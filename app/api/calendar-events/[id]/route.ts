import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import db from "@/lib/db";
import {
  calendarEventByKey,
  calendarPermission,
  canEditCalendar,
  recordCalendarActivity,
  validTimezone,
} from "@/lib/calendars";

type User = NonNullable<Awaited<ReturnType<typeof currentUser>>>;

function editable(user: User, key: string) {
  const event = calendarEventByKey(key);
  if (!event)
    return {
      error: NextResponse.json({ error: "Event not found" }, { status: 404 }),
    };
  if (!canEditCalendar(calendarPermission(user, event.calendarId)))
    return {
      error: NextResponse.json(
        { error: "You cannot edit this event" },
        { status: 403 },
      ),
    };
  return { event };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const found = editable(user, (await params).id);
  if (found.error) return found.error;
  try {
    const body = await request.json();
    const title = String(body.title || "").trim();
    const start = new Date(body.startAt);
    const end = new Date(body.endAt);
    const timezone = validTimezone(body.timezone);
    const status = ["tentative", "confirmed", "cancelled"].includes(body.status)
      ? body.status
      : "confirmed";
    const kind = ["event","stream","availability","collab"].includes(body.kind) ? body.kind : "event";
    const visibility = ["calendar","private","team","public","busy"].includes(body.visibility) ? body.visibility : "calendar";
    if (
      !title ||
      title.length > 160 ||
      Number.isNaN(start.valueOf()) ||
      Number.isNaN(end.valueOf()) ||
      end <= start
    )
      throw new Error("Enter a valid title and time range");
    db.prepare(
      "UPDATE calendar_events SET title=?,description=?,location=?,start_at=?,end_at=?,timezone=?,all_day=?,status=?,event_kind=?,visibility=?,platform=?,game=?,stream_url=?,collab_enabled=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
    ).run(
      title,
      String(body.description || "")
        .trim()
        .slice(0, 3000),
      String(body.location || "")
        .trim()
        .slice(0, 300),
      start.toISOString(),
      end.toISOString(),
      timezone,
      body.allDay ? 1 : 0,
      status,
      kind,
      visibility,
      String(body.platform||"").trim().slice(0,80),
      String(body.game||"").trim().slice(0,120),
      String(body.streamUrl||"").trim().slice(0,500),
      body.collabEnabled ? 1 : 0,
      found.event!.id,
    );
    recordCalendarActivity(
      found.event!.calendarId,
      user.id,
      "CALENDAR.EVENT.UPDATE",
      `Updated event “${title}”`,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const found = editable(user, (await params).id);
  if (found.error) return found.error;
  recordCalendarActivity(
    found.event!.calendarId,
    user.id,
    "CALENDAR.EVENT.DELETE",
    `Moved event “${found.event!.title}” to Recently deleted for 30 days`,
  );
  db.prepare(
    "UPDATE calendar_events SET deleted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?",
  ).run(found.event!.id);
  return NextResponse.json({ ok: true });
}
