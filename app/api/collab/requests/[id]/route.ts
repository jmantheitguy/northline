import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import db, { createCalendarEventPublicId } from "@/lib/db";
import {
  calendarIdByKey,
  calendarPermission,
  canEditCalendar,
  validTimezone,
} from "@/lib/calendars";

type RequestRow = {
  id: number;
  requester_id: number;
  recipient_id: number;
  requester_calendar_id: number;
  recipient_calendar_id: number | null;
  proposed_start_at: string;
  proposed_end_at: string;
  timezone: string;
  title: string;
  message: string;
  status: string;
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
    .get((await params).id) as RequestRow | undefined;
  if (
    !row ||
    (row.requester_id !== user.id && row.recipient_id !== user.id)
  )
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const body = await request.json();
    const action = String(body.action || "");
    if (!["pending", "countered"].includes(row.status))
      throw new Error("This request is already closed");

    if (action === "cancel") {
      if (row.requester_id !== user.id)
        throw new Error("Only the requester can cancel");
      db.prepare(
        "UPDATE collab_requests SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE id=?",
      ).run(row.id);
      queue(row, row.recipient_id, `${user.name} cancelled “${row.title}”.`);
      return NextResponse.json({ ok: true });
    }

    if (action === "decline") {
      if (row.recipient_id !== user.id || row.status !== "pending")
        throw new Error("Only the invited streamer can decline a new request");
      db.prepare(
        "UPDATE collab_requests SET status='declined',response_message=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      ).run(String(body.message || "").trim().slice(0, 1000), row.id);
      queue(
        row,
        row.requester_id,
        `${user.name} declined the collaboration request “${row.title}”.`,
      );
      return NextResponse.json({ ok: true });
    }

    if (action === "counter") {
      if (row.recipient_id !== user.id || row.status !== "pending")
        throw new Error("Only the invited streamer can suggest a new time");
      const start = new Date(body.startAt);
      const end = new Date(body.endAt);
      const timezone = validTimezone(body.timezone);
      const recipientCalendarId = editableCalendar(user, body.calendarId);
      if (
        Number.isNaN(start.valueOf()) ||
        Number.isNaN(end.valueOf()) ||
        end <= start
      )
        throw new Error("Enter a valid counterproposal time");
      db.prepare(
        "UPDATE collab_requests SET status='countered',recipient_calendar_id=?,proposed_start_at=?,proposed_end_at=?,timezone=?,response_message=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      ).run(
        recipientCalendarId,
        start.toISOString(),
        end.toISOString(),
        timezone,
        String(body.message || "").trim().slice(0, 1000),
        row.id,
      );
      queue(
        row,
        row.requester_id,
        `${user.name} proposed a new time for “${row.title}”.`,
      );
      return NextResponse.json({ ok: true });
    }

    if (action === "accept") {
      const acceptingOriginal = row.status === "pending" && row.recipient_id === user.id;
      const acceptingCounter = row.status === "countered" && row.requester_id === user.id;
      if (!acceptingOriginal && !acceptingCounter)
        throw new Error("This participant cannot accept the current proposal");
      const recipientCalendarId = acceptingOriginal
        ? editableCalendar(user, body.calendarId)
        : row.recipient_calendar_id;
      if (!recipientCalendarId)
        throw new Error("The invited streamer must choose a calendar first");
      const create = db.prepare(
        `INSERT INTO calendar_events(public_id,calendar_id,title,description,start_at,end_at,timezone,status,created_by,event_kind,visibility,collab_enabled,collab_request_id)
         VALUES(?,?,?,?,?,?,?,'confirmed',?,'collab','calendar',0,?)`,
      );
      db.transaction(() => {
        create.run(
          createCalendarEventPublicId(),
          row.requester_calendar_id,
          row.title,
          row.message,
          row.proposed_start_at,
          row.proposed_end_at,
          row.timezone,
          row.requester_id,
          row.id,
        );
        create.run(
          createCalendarEventPublicId(),
          recipientCalendarId,
          row.title,
          row.message,
          row.proposed_start_at,
          row.proposed_end_at,
          row.timezone,
          row.recipient_id,
          row.id,
        );
        db.prepare(
          "UPDATE collab_requests SET status='accepted',recipient_calendar_id=?,response_message=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        ).run(
          recipientCalendarId,
          String(body.message || "").trim().slice(0, 1000),
          row.id,
        );
        const notifyUser = acceptingOriginal ? row.requester_id : row.recipient_id;
        queue(
          row,
          notifyUser,
          `${user.name} accepted “${row.title}”. It is now on both calendars.`,
        );
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

function editableCalendar(
  user: NonNullable<Awaited<ReturnType<typeof currentUser>>>,
  key: unknown,
) {
  const id = calendarIdByKey(String(key || ""));
  if (!id || !canEditCalendar(calendarPermission(user, id)))
    throw new Error("Choose a calendar you can edit");
  return id;
}

function queue(row: RequestRow, recipient: number, message: string) {
  db.prepare(
    "INSERT INTO collab_notifications(collab_request_id,recipient_user_id,message) VALUES(?,?,?)",
  ).run(row.id, recipient, message);
}
