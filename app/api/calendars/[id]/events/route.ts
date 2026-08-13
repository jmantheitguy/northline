import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import db, { createCalendarEventPublicId } from "@/lib/db";
import {
  calendarIdByKey,
  calendarPermission,
  canEditCalendar,
  recordCalendarActivity,
  validTimezone,
} from "@/lib/calendars";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const calendarId = calendarIdByKey((await params).id);
  if (!calendarId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canEditCalendar(calendarPermission(user, calendarId)))
    return NextResponse.json(
      { error: "You cannot add events to this calendar" },
      { status: 403 },
    );
  try {
    const body = await request.json();
    const title = String(body.title || "").trim();
    const start = new Date(body.startAt);
    const end = new Date(body.endAt);
    const timezone = validTimezone(body.timezone);
    const status = ["tentative", "confirmed", "cancelled"].includes(body.status)
      ? body.status
      : "confirmed";
    if (!title || title.length > 160)
      throw new Error("Event title must be between 1 and 160 characters");
    if (
      Number.isNaN(start.valueOf()) ||
      Number.isNaN(end.valueOf()) ||
      end <= start
    )
      throw new Error("Event end must be after its start");
    const key = createCalendarEventPublicId();
    db.prepare(
      "INSERT INTO calendar_events(public_id,calendar_id,title,description,location,start_at,end_at,timezone,all_day,status,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    ).run(
      key,
      calendarId,
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
      user.id,
    );
    recordCalendarActivity(
      calendarId,
      user.id,
      "CALENDAR.EVENT.CREATE",
      `Created event “${title}” for ${start.toLocaleString("en-US", { timeZone: timezone })}`,
    );
    return NextResponse.json({ id: key }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
