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
  const row = await db
    .prepare("SELECT * FROM collab_requests WHERE public_id=?")
    .get((await params).id) as Row | undefined;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const mine = await db
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
      await db.transaction(async () => {
        await db.prepare(
          "UPDATE collab_requests SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE id=?",
        ).run(row.id);
        await db.prepare(
          "UPDATE collab_request_participants SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE collab_request_id=? AND status IN ('pending','countered','accepted')",
        ).run(row.id);
        await db.prepare(
          `UPDATE calendar_events
           SET status='cancelled',deleted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
           WHERE collab_request_id=? AND deleted_at IS NULL`,
        ).run(row.id);
        await db.prepare(
          `UPDATE calendar_reminders SET status='cancelled',error=NULL
           WHERE status='pending' AND calendar_event_id IN
             (SELECT id FROM calendar_events WHERE collab_request_id=?)`,
        ).run(row.id);
        await db.prepare(
          "UPDATE collab_reschedule_proposals SET status='cancelled',resolved_at=CURRENT_TIMESTAMP WHERE collab_request_id=? AND status='pending'",
        ).run(row.id);
        for (const p of await participants(row.id))
          await queue(
            row.id,
            p.user_id,
            `${user.name} cancelled the collaboration “${row.title}”.`,
          );
      });
      return NextResponse.json({ ok: true });
    }
    if (action === "decline") {
      if (!mine || mine.status !== "pending")
        throw new Error("You cannot decline this invitation");
      await db.prepare(
        "UPDATE collab_request_participants SET status='declined',response_message=?,updated_at=CURRENT_TIMESTAMP WHERE collab_request_id=? AND user_id=?",
      ).run(
        String(body.message || "")
          .trim()
          .slice(0, 1000),
        row.id,
        user.id,
      );
      await queue(row.id, row.requester_id, `${user.name} declined “${row.title}”.`);
      await refresh(row.id);
      return NextResponse.json({ ok: true });
    }
    if (action === "counter") {
      if (!mine || mine.status !== "pending")
        throw new Error("You cannot counter this invitation");
      if ((await participants(row.id)).some((p) => p.status === "accepted"))
        throw new Error(
          "A participant has already accepted; ask the organizer to create a new request for a different time",
        );
      const start = new Date(body.startAt),
        end = new Date(body.endAt),
        timezone = validTimezone(body.timezone),
        calendarId = await editableCalendar(user, body.calendarId);
      if (
        Number.isNaN(start.valueOf()) ||
        Number.isNaN(end.valueOf()) ||
        end <= start
      )
        throw new Error("Enter a valid counterproposal time");
      await db.prepare(
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
      await queue(
        row.id,
        row.requester_id,
        `${user.name} proposed a new group time for “${row.title}”.`,
      );
      await refresh(row.id);
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
          calendar_id: await editableCalendar(user, body.calendarId),
        };
      else {
        if (row.requester_id !== user.id)
          throw new Error("Only the organizer can approve a counterproposal");
        const participantUserId = Number(body.participantUserId);
        participant = await db
          .prepare(
            "SELECT * FROM collab_request_participants WHERE collab_request_id=? AND user_id=? AND status='countered'",
          )
          .get(row.id, participantUserId) as Participant;
        if (!participant) throw new Error("Choose a counterproposal to accept");
        if ((await participants(row.id)).some((p) => p.status === "accepted"))
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
      await db.transaction(async () => {
        if (mine?.status === "pending") {
          const counters = (await participants(row.id)).filter(
            (p) => p.status === "countered",
          );
          await db.prepare(
            "UPDATE collab_request_participants SET status='pending',calendar_id=NULL,proposed_start_at=NULL,proposed_end_at=NULL,timezone=NULL,response_message='',updated_at=CURRENT_TIMESTAMP WHERE collab_request_id=? AND status='countered'",
          ).run(row.id);
          for (const counter of counters)
            await queue(
              row.id,
              counter.user_id,
              `The original time for “${row.title}” is now locked because another participant accepted. Please review the invitation again.`,
            );
        }
        if (
          !await db
            .prepare(
              "SELECT 1 FROM calendar_events WHERE collab_request_id=? AND calendar_id=? AND deleted_at IS NULL",
            )
            .get(row.id, row.requester_calendar_id)
        )
          await create.run(
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
        await create.run(
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
        await db.prepare(
          "UPDATE collab_request_participants SET status='accepted',calendar_id=?,proposed_start_at=NULL,proposed_end_at=NULL,timezone=NULL,updated_at=CURRENT_TIMESTAMP WHERE collab_request_id=? AND user_id=?",
        ).run(participant.calendar_id, row.id, participant.user_id);
        await db.prepare(
          "UPDATE collab_requests SET proposed_start_at=?,proposed_end_at=?,timezone=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        ).run(start, end, timezone, row.id);
        if (row.requester_id === user.id)
           for (const p of (await participants(row.id)).filter(
            (p) => p.status === "pending",
          ))
             await queue(
              row.id,
              p.user_id,
              `${user.name} approved a new group time for “${row.title}”. Please review the updated invitation.`,
            );
        await queue(
          row.id,
          row.requester_id === user.id ? participant.user_id : row.requester_id,
          `${user.name} accepted “${row.title}”.`,
        );
        await refresh(row.id);
        await scheduleAutomaticReminders(row.id, row.title, start);
      });
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
async function participants(id: number) {
  return await db
    .prepare(
      "SELECT * FROM collab_request_participants WHERE collab_request_id=?",
    )
    .all(id) as Participant[];
}
async function refresh(id: number) {
  const states = (await participants(id)).map((p) => p.status);
  const status = states.some((s) => s === "countered")
    ? "countered"
    : states.some((s) => s === "pending")
      ? "pending"
      : states.some((s) => s === "accepted")
        ? "accepted"
        : "declined";
  await db.prepare(
    "UPDATE collab_requests SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
  ).run(status, id);
}
async function editableCalendar(
  user: NonNullable<Awaited<ReturnType<typeof currentUser>>>,
  key: unknown,
) {
  const id = await calendarIdByKey(String(key || ""));
  if (!id || !canEditCalendar(await calendarPermission(user, id)))
    throw new Error("Choose a calendar you can edit");
  return id;
}
async function queue(requestId: number, recipient: number, message: string) {
  await db.prepare(
    "INSERT INTO collab_notifications(collab_request_id,recipient_user_id,message) VALUES(?,?,?)",
  ).run(requestId, recipient, message);
}

async function scheduleAutomaticReminders(
  requestId: number,
  title: string,
  startAt: string,
) {
  const remindAt = new Date(new Date(startAt).getTime() - 30 * 60 * 1000);
  if (Number.isNaN(remindAt.valueOf()) || remindAt <= new Date()) return;
  const message = `Collab starts in 30 minutes: ${title}`;
  await db.prepare(
    `INSERT INTO calendar_reminders
       (calendar_event_id,created_by,recipient_user_id,message,remind_at)
     SELECT event.id,event.created_by,event.created_by,?,?
     FROM calendar_events event
     WHERE event.collab_request_id=? AND event.status='confirmed' AND event.deleted_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM calendar_reminders existing
         WHERE existing.calendar_event_id=event.id
           AND existing.recipient_user_id=event.created_by
           AND existing.status='pending'
           AND existing.message LIKE 'Collab starts in 30 minutes:%'
       )`,
  ).run(message, remindAt.toISOString(), requestId);
}
