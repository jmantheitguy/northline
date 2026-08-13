import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import db, { createCollabRequestPublicId } from "@/lib/db";
import {
  calendarIdByKey,
  canEditCalendar,
  calendarPermission,
  validTimezone,
} from "@/lib/calendars";

export async function GET() {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const requests = db
    .prepare(
      `SELECT r.public_id id,r.id internalId,r.requester_id requesterId,
    r.proposed_start_at startAt,r.proposed_end_at endAt,r.timezone,r.title,r.message,r.status,
    r.created_at createdAt,r.updated_at updatedAt,requester.name requesterName,requester.avatar requesterAvatar,
    e.public_id sourceEventId,e.title sourceEventTitle
    FROM collab_requests r JOIN users requester ON requester.id=r.requester_id
    LEFT JOIN calendar_events e ON e.id=r.source_event_id
    WHERE r.requester_id=? OR EXISTS(SELECT 1 FROM collab_request_participants p WHERE p.collab_request_id=r.id AND p.user_id=?)
    ORDER BY CASE WHEN r.status IN ('pending','countered') THEN 0 ELSE 1 END,r.updated_at DESC`,
    )
    .all(user.id, user.id) as Array<
    Record<string, unknown> & { internalId: number }
  >;
  const ids = requests.map((item) => item.internalId);
  const participants = ids.length
    ? (db
        .prepare(
          `SELECT p.collab_request_id requestId,p.user_id userId,u.name,u.avatar,p.status,p.proposed_start_at proposedStartAt,p.proposed_end_at proposedEndAt,p.timezone,p.response_message responseMessage
    FROM collab_request_participants p JOIN users u ON u.id=p.user_id WHERE p.collab_request_id IN (${ids.map(() => "?").join(",")}) ORDER BY u.name COLLATE NOCASE`,
        )
        .all(...ids) as Array<Record<string, unknown> & { requestId: number }>)
    : [];
  return NextResponse.json({
    requests: requests.map(({ internalId, ...item }) => ({
      ...item,
      participants: participants
        .filter((p) => p.requestId === internalId)
        .map((p) => ({
          userId: p.userId,
          name: p.name,
          avatar: p.avatar,
          status: p.status,
          proposedStartAt: p.proposedStartAt,
          proposedEndAt: p.proposedEndAt,
          timezone: p.timezone,
          responseMessage: p.responseMessage,
        })),
    })),
    currentUserId: user.id,
  });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const recipientIds = [
      ...new Set(
        (Array.isArray(body.recipientIds)
          ? body.recipientIds
          : [body.recipientId]
        )
          .map(Number)
          .filter((id: number) => id > 0 && id !== user.id),
      ),
    ] as number[];
    const calendarId = calendarIdByKey(String(body.calendarId || ""));
    const start = new Date(body.startAt),
      end = new Date(body.endAt),
      title = String(body.title || "")
        .trim()
        .slice(0, 160),
      message = String(body.message || "")
        .trim()
        .slice(0, 2000),
      timezone = validTimezone(body.timezone);
    if (!calendarId || !canEditCalendar(calendarPermission(user, calendarId)))
      throw new Error("Choose a calendar you can edit");
    if (!recipientIds.length || recipientIds.length > 20)
      throw new Error("Choose between 1 and 20 streamers");
    const active = (
      db
        .prepare(
          `SELECT COUNT(*) count FROM users WHERE status='Active' AND id IN (${recipientIds.map(() => "?").join(",")})`,
        )
        .get(...recipientIds) as { count: number }
    ).count;
    if (
      active !== recipientIds.length ||
      !title ||
      Number.isNaN(start.valueOf()) ||
      Number.isNaN(end.valueOf()) ||
      end <= start
    )
      throw new Error("Enter valid streamers, title, and time range");
    const pendingCount = (
      db
        .prepare(
          "SELECT COUNT(*) count FROM collab_requests WHERE requester_id=? AND status IN ('pending','countered')",
        )
        .get(user.id) as { count: number }
    ).count;
    if (pendingCount >= 20)
      throw new Error(
        "Resolve or cancel an open collaboration request before sending more",
      );
    let sourceEventId: number | null = null;
    if (body.sourceEventId) {
      const source = db
        .prepare(
          `SELECT e.id,c.owner_id ownerId,c.calendar_type calendarType,c.visibility calendarVisibility,e.visibility,e.collab_enabled collabEnabled FROM calendar_events e JOIN calendars c ON c.id=e.calendar_id WHERE e.public_id=? AND e.deleted_at IS NULL AND c.deleted_at IS NULL`,
        )
        .get(String(body.sourceEventId)) as
        | {
            id: number;
            ownerId: number;
            calendarType: string;
            calendarVisibility: string;
            visibility: string;
            collabEnabled: number;
          }
        | undefined;
      if (
        !source ||
        !recipientIds.includes(source.ownerId) ||
        source.calendarType !== "streaming" ||
        !["team", "public"].includes(source.calendarVisibility) ||
        !["calendar", "team", "public"].includes(source.visibility) ||
        source.collabEnabled !== 1
      )
        throw new Error(
          "That schedule item is not available for collaboration requests",
        );
      sourceEventId = source.id;
    }
    const key = createCollabRequestPublicId();
    db.transaction(() => {
      const result = db
        .prepare(
          `INSERT INTO collab_requests(public_id,source_event_id,requester_id,recipient_id,requester_calendar_id,proposed_start_at,proposed_end_at,timezone,title,message) VALUES(?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          key,
          sourceEventId,
          user.id,
          recipientIds[0],
          calendarId,
          start.toISOString(),
          end.toISOString(),
          timezone,
          title,
          message,
        );
      const requestId = Number(result.lastInsertRowid),
        add = db.prepare(
          "INSERT INTO collab_request_participants(collab_request_id,user_id) VALUES(?,?)",
        ),
        notify = db.prepare(
          "INSERT INTO collab_notifications(collab_request_id,recipient_user_id,message) VALUES(?,?,?)",
        );
      for (const recipientId of recipientIds) {
        add.run(requestId, recipientId);
        const group =
          recipientIds.length > 1
            ? ` and ${recipientIds.length - 1} other streamer${recipientIds.length === 2 ? "" : "s"}`
            : "";
        notify.run(
          requestId,
          recipientId,
          `${user.name} invited you${group} to collaborate on “${title}”.`,
        );
      }
    })();
    return NextResponse.json(
      { id: key, recipients: recipientIds.length },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
