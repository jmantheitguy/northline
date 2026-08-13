import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import db from "@/lib/db";
import {
  calendarIdByKey,
  calendarPermission,
  recordCalendarActivity,
  validTimezone,
} from "@/lib/calendars";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = calendarIdByKey((await params).id);
  if (!id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const permission = calendarPermission(user, id);
  if (!permission)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  const url = new URL(request.url),
    from = url.searchParams.get("from") || "1970-01-01T00:00:00.000Z",
    to = url.searchParams.get("to") || "2999-01-01T00:00:00.000Z";
  const calendar = db
    .prepare(
      "SELECT c.public_id id,c.name,c.color,c.description,c.timezone,c.owner_id ownerId,u.name ownerName FROM calendars c JOIN users u ON u.id=c.owner_id WHERE c.id=?",
    )
    .get(id);
  const events = db
    .prepare(
      `SELECT e.public_id id,e.title,e.description,e.location,e.start_at startAt,e.end_at endAt,e.timezone,e.all_day allDay,e.status,e.created_by createdBy,u.name creatorName
    FROM calendar_events e JOIN users u ON u.id=e.created_by WHERE e.calendar_id=? AND e.deleted_at IS NULL AND e.start_at<? AND e.end_at>? ORDER BY e.start_at`,
    )
    .all(id, to, from);
  const deletedEvents =
    permission === "owner"
      ? db
          .prepare(
            `SELECT public_id id,title,start_at startAt,deleted_at deletedAt FROM calendar_events WHERE calendar_id=? AND deleted_at IS NOT NULL AND datetime(deleted_at)>=datetime('now','-30 days') ORDER BY deleted_at DESC`,
          )
          .all(id)
      : [];
  const members =
    permission === "owner"
      ? db
          .prepare(
            "SELECT cm.user_id userId,u.name,u.email,u.avatar,cm.permission FROM calendar_members cm JOIN users u ON u.id=cm.user_id WHERE cm.calendar_id=? ORDER BY u.name",
          )
          .all(id)
      : [];
  const activity =
    permission === "owner"
      ? db
          .prepare(
            "SELECT a.id,a.action,a.detail,a.created_at createdAt,COALESCE(u.name,'System') actorName FROM calendar_activity a LEFT JOIN users u ON u.id=a.actor_id WHERE a.calendar_id=? ORDER BY a.id DESC LIMIT 50",
          )
          .all(id)
      : [];
  return NextResponse.json({
    calendar: { ...(calendar as object), permission },
    events,
    deletedEvents,
    members,
    activity,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = calendarIdByKey((await params).id);
  if (!id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (calendarPermission(user, id) !== "owner")
    return NextResponse.json(
      { error: "Only the calendar owner can change calendar settings" },
      { status: 403 },
    );
  try {
    const body = await request.json(),
      name = String(body.name || "").trim(),
      color = /^#[0-9a-f]{6}$/i.test(String(body.color))
        ? String(body.color)
        : null,
      timezone = validTimezone(body.timezone);
    if (!name || name.length > 80 || !color)
      throw new Error("Enter a valid name and color");
    db.prepare(
      "UPDATE calendars SET name=?,color=?,description=?,timezone=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
    ).run(
      name,
      color,
      String(body.description || "")
        .trim()
        .slice(0, 500),
      timezone,
      id,
    );
    recordCalendarActivity(
      id,
      user.id,
      "CALENDAR.UPDATE",
      `Updated calendar settings for “${name}”`,
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
  const id = calendarIdByKey((await params).id);
  if (!id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (calendarPermission(user, id) !== "owner")
    return NextResponse.json(
      { error: "Only the calendar owner can delete it" },
      { status: 403 },
    );
  const calendar = db
    .prepare("SELECT name FROM calendars WHERE id=?")
    .get(id) as { name: string };
  db.prepare(
    "UPDATE calendars SET deleted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?",
  ).run(id);
  db.prepare(
    "INSERT INTO audit_log(actor_id,action,target,detail) VALUES(?,?,?,?)",
  ).run(
    user.id,
    "CALENDAR.DELETE",
    String(id),
    `Moved calendar “${calendar.name}” to Recently deleted for 30 days`,
  );
  return NextResponse.json({ ok: true });
}
