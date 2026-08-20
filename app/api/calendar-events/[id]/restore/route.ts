import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import db from "@/lib/db";
import { calendarPermission, recordCalendarActivity } from "@/lib/calendars";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const event = await db.prepare("SELECT id,calendar_id calendarId,title FROM calendar_events WHERE public_id=? AND deleted_at IS NOT NULL AND datetime(deleted_at)>=datetime('now','-30 days')").get((await params).id) as { id: number; calendarId: number; title: string } | undefined;
  if (!event || await calendarPermission(user, event.calendarId) !== "owner")
    return NextResponse.json({ error: "Recoverable event not found" }, { status: 404 });
  await db.prepare("UPDATE calendar_events SET deleted_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(event.id);
  await recordCalendarActivity(event.calendarId, user.id, "CALENDAR.EVENT.RESTORE", `Restored event “${event.title}”`);
  return NextResponse.json({ ok: true });
}
