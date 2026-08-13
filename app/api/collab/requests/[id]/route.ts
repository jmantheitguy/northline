import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import db, { createCalendarEventPublicId } from "@/lib/db";
import {
  calendarIdByKey,
  calendarPermission,
  canEditCalendar,
  validTimezone,
} from "@/lib/calendars";

type Row = {
  id: number;
  requester_id: number;
  requester_calendar_id: number;
  proposed_start_at: string;
  proposed_end_at: string;
  timezone: string;
  title: string;
  message: string;
  status: string;
};
type Participant = {
  user_id: number;
  calendar_id: number | null;
  status: string;
  proposed_start_at: string | null;
  proposed_end_at: string | null;
  timezone: string | null;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const row = db
    .prepare("SELECT * FROM collab_requests WHERE public_id=?")
    .get((await params).id) as Row | undefined;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const mine = db
    .prepare(
      "SELECT * FROM collab_request_participants WHERE collab_request_id=? AND user_id=?",
    )
    .get(row.id, user.id) as Participant | undefined;
  if (row.requester_id !== user.id && !mine)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const body = await request.json(),
      action = String(body.action || "");
    if (action === "cancel") {
      if (row.requester_id !== user.id)
        throw new Error("Only the organizer can cancel the collaboration");
      if (!["pending", "countered", "accepted"].includes(row.status))
        throw new Error("This collaboration request is already closed");
      db.transaction(() => {
        db.prepare(
          "UPDATE collab_requests SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE id=?",
        ).run(row.id);
        db.prepare(
          "UPDATE collab_request_participants SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE collab_request_id=? AND status IN ('pending','countered','accepted')",
        ).run(row.id);
        db.prepare(
          "UPDATE calendar_events SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE collab_request_id=? AND deleted_at IS NULL",
        ).run(row.id);
        db.prepare(
          "UPDATE collab_reschedule_proposals SET status='cancelled',resolved_at=CURRENT_TIMESTAMP WHERE collab_request_id=? AND status='pending'",
        ).run(row.id);
        for (const p of participants(row.id))
          queue(
            row.id,
            p.user_id,
            `${user.name} cancelled the collaboration “${row.title}”.`,
          );
      })();
      return NextResponse.json({ ok: true });
    }
    if (action === "decline") {
      if (!mine || mine.status !== "pending")
        throw new Error("You cannot decline this invitation");
      db.prepare(
        "UPDATE collab_request_participants SET status='declined',response_message=?,updated_at=CURRENT_TIMESTAMP WHERE collab_request_id=? AND user_id=?",
      ).run(
        String(body.message || "")
          .trim()
          .slice(0, 1000),
        row.id,
        user.id,
      );
      queue(row.id, row.requester_id, `${user.name} declined “${row.title}”.`);
      refresh(row.id);
      return NextResponse.json({ ok: true });
    }
    if (action === "counter") {
      if (!mine || mine.status !== "pending")
        throw new Error("You cannot counter this invitation");
      if (participants(row.id).some((p) => p.status === "accepted"))
        throw new Error(
          "A participant has already accepted; ask the organizer to create a new request for a different time",
        );
      const start = new Date(body.startAt),
        end = new Date(body.endAt),
        timezone = validTimezone(body.timezone),
        calendarId = editableCalendar(user, body.calendarId);
      if (
        Number.isNaN(start.valueOf()) ||
        Number.isNaN(end.valueOf()) ||
        end <= start
      )
        throw new Error("Enter a valid counterproposal time");
      db.prepare(
        "UPDATE collab_request_participants SET status='countered',calendar_id=?,proposed_start_at=?,proposed_end_at=?,timezone=?,response_message=?,updated_at=CURRENT_TIMESTAMP WHERE collab_request_id=? AND user_id=?",
      ).run(
        calendarId,
        start.toISOString(),
        end.toISOString(),
        timezone,
        String(body.message || "")
          .trim()
          .slice(0, 1000),
        row.id,
        user.id,
      );
      queue(
        row.id,
        row.requester_id,
        `${user.name} proposed a new group time for “${row.title}”.`,
      );
      refresh(row.id);
      return NextResponse.json({ ok: true });
    }
    if (action === "accept") {
      let participant: Participant,
        start = row.proposed_start_at,
        end = row.proposed_end_at,
        timezone = row.timezone;
      if (mine && mine.status === "pending")
        participant = {
          ...mine,
          calendar_id: editableCalendar(user, body.calendarId),
        };
      else {
        if (row.requester_id !== user.id)
          throw new Error("Only the organizer can approve a counterproposal");
        const participantUserId = Number(body.participantUserId);
        participant = db
          .prepare(
            "SELECT * FROM collab_request_participants WHERE collab_request_id=? AND user_id=? AND status='countered'",
          )
          .get(row.id, participantUserId) as Participant;
        if (!participant) throw new Error("Choose a counterproposal to accept");
        if (participants(row.id).some((p) => p.status === "accepted"))
          throw new Error(
            "The group time cannot change after someone has accepted",
          );
        start = participant.proposed_start_at!;
        end = participant.proposed_end_at!;
        timezone = participant.timezone!;
      }
      if (!participant.calendar_id)
        throw new Error("The participant must choose a calendar");
      const create = db.prepare(
        `INSERT INTO calendar_events(public_id,calendar_id,title,description,start_at,end_at,timezone,status,created_by,event_kind,visibility,collab_enabled,collab_request_id) VALUES(?,?,?,?,?,?,?,'confirmed',?,'collab','calendar',0,?)`,
      );
      db.transaction(() => {
        if (mine?.status === "pending") {
          const counters = participants(row.id).filter(
            (p) => p.status === "countered",
          );
          db.prepare(
            "UPDATE collab_request_participants SET status='pending',calendar_id=NULL,proposed_start_at=NULL,proposed_end_at=NULL,timezone=NULL,response_message='',updated_at=CURRENT_TIMESTAMP WHERE collab_request_id=? AND status='countered'",
          ).run(row.id);
          for (const counter of counters)
            queue(
              row.id,
              counter.user_id,
              `The original time for “${row.title}” is now locked because another participant accepted. Please review the invitation again.`,
            );
        }
        if (
          !db
            .prepare(
              "SELECT 1 FROM calendar_events WHERE collab_request_id=? AND calendar_id=? AND deleted_at IS NULL",
            )
            .get(row.id, row.requester_calendar_id)
        )
          create.run(
            createCalendarEventPublicId(),
            row.requester_calendar_id,
            row.title,
            row.message,
            start,
            end,
            timezone,
            row.requester_id,
            row.id,
          );
        create.run(
          createCalendarEventPublicId(),
          participant.calendar_id,
          row.title,
          row.message,
          start,
          end,
          timezone,
          participant.user_id,
          row.id,
        );
        db.prepare(
          "UPDATE collab_request_participants SET status='accepted',calendar_id=?,proposed_start_at=NULL,proposed_end_at=NULL,timezone=NULL,updated_at=CURRENT_TIMESTAMP WHERE collab_request_id=? AND user_id=?",
        ).run(participant.calendar_id, row.id, participant.user_id);
        db.prepare(
          "UPDATE collab_requests SET proposed_start_at=?,proposed_end_at=?,timezone=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        ).run(start, end, timezone, row.id);
        if (row.requester_id === user.id)
          for (const p of participants(row.id).filter(
            (p) => p.status === "pending",
          ))
            queue(
              row.id,
              p.user_id,
              `${user.name} approved a new group time for “${row.title}”. Please review the updated invitation.`,
            );
        queue(
          row.id,
          row.requester_id === user.id ? participant.user_id : row.requester_id,
          `${user.name} accepted “${row.title}”.`,
        );
        refresh(row.id);
      })();
      return NextResponse.json({ ok: true });
    }
    throw new Error("Choose a valid response");
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
function participants(id: number) {
  return db
    .prepare(
      "SELECT * FROM collab_request_participants WHERE collab_request_id=?",
    )
    .all(id) as Participant[];
}
function refresh(id: number) {
  const states = participants(id).map((p) => p.status);
  const status = states.some((s) => s === "countered")
    ? "countered"
    : states.some((s) => s === "pending")
      ? "pending"
      : states.some((s) => s === "accepted")
        ? "accepted"
        : "declined";
  db.prepare(
    "UPDATE collab_requests SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
  ).run(status, id);
}
function editableCalendar(
  user: NonNullable<Awaited<ReturnType<typeof currentUser>>>,
  key: unknown,
) {
  const id = calendarIdByKey(String(key || ""));
  if (!id || !canEditCalendar(calendarPermission(user, id)))
    throw new Error("Choose a calendar you can edit");
  return id;
}
function queue(requestId: number, recipient: number, message: string) {
  db.prepare(
    "INSERT INTO collab_notifications(collab_request_id,recipient_user_id,message) VALUES(?,?,?)",
  ).run(requestId, recipient, message);
}
