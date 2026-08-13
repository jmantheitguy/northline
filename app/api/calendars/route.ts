import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import db, { createCalendarPublicId } from "@/lib/db";
import { recordCalendarActivity, validTimezone } from "@/lib/calendars";

export async function GET() {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const calendars = db
    .prepare(
      `SELECT c.public_id id,c.name,c.color,c.description,c.timezone,
    c.owner_id ownerId,u.name ownerName,CASE WHEN c.owner_id=? THEN 'owner' ELSE cm.permission END permission,
    (SELECT COUNT(*) FROM calendar_events e WHERE e.calendar_id=c.id AND e.end_at>=datetime('now','-31 days')) eventCount
    FROM calendars c JOIN users u ON u.id=c.owner_id
    LEFT JOIN calendar_members cm ON cm.calendar_id=c.id AND cm.user_id=?
    WHERE c.deleted_at IS NULL AND (c.owner_id=? OR cm.user_id=?) ORDER BY CASE WHEN c.owner_id=? THEN 0 ELSE 1 END,c.name COLLATE NOCASE`,
    )
    .all(user.id, user.id, user.id, user.id, user.id);
  const deletedCalendars = db
    .prepare(
      `SELECT public_id id,name,color,deleted_at deletedAt FROM calendars WHERE owner_id=? AND deleted_at IS NOT NULL AND datetime(deleted_at)>=datetime('now','-30 days') ORDER BY deleted_at DESC`,
    )
    .all(user.id);
  return NextResponse.json({ calendars, deletedCalendars });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json(),
      name = String(body.name || "").trim(),
      color = /^#[0-9a-f]{6}$/i.test(String(body.color))
        ? String(body.color)
        : "#7c6ce7",
      timezone = validTimezone(body.timezone);
    if (!name || name.length > 80)
      throw new Error("Calendar name must be between 1 and 80 characters");
    const key = createCalendarPublicId(),
      result = db
        .prepare(
          "INSERT INTO calendars(public_id,owner_id,name,color,description,timezone) VALUES(?,?,?,?,?,?)",
        )
        .run(
          key,
          user.id,
          name,
          color,
          String(body.description || "")
            .trim()
            .slice(0, 500),
          timezone,
        );
    const id = Number(result.lastInsertRowid);
    recordCalendarActivity(
      id,
      user.id,
      "CALENDAR.CREATE",
      `Created calendar “${name}”`,
    );
    return NextResponse.json({ id: key }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
