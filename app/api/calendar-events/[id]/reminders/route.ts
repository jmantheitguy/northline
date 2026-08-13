import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { discordConfigured } from "@/lib/discord";
import db from "@/lib/db";
import { calendarEventByKey, calendarPermission } from "@/lib/calendars";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const event = calendarEventByKey((await params).id);
  if (!event || !calendarPermission(user, event.calendarId))
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  if (!discordConfigured()) return NextResponse.json({ error: "Discord bot is not configured" }, { status: 409 });
  const recipient = db.prepare("SELECT discord_user_id discordUserId FROM users WHERE id=?").get(user.id) as { discordUserId: string | null };
  if (!recipient.discordUserId) return NextResponse.json({ error: "Link Discord before scheduling an event reminder" }, { status: 409 });
  const body = await request.json();
  const when = new Date(body.remindAt);
  const message = String(body.message || `Upcoming calendar event: ${event.title}`).trim();
  if (Number.isNaN(when.valueOf()) || when <= new Date() || !message || message.length > 1800)
    return NextResponse.json({ error: "Choose a future reminder time and a message under 1,800 characters" }, { status: 400 });
  const result = db.prepare("INSERT INTO calendar_reminders(calendar_event_id,created_by,recipient_user_id,message,remind_at) VALUES(?,?,?,?,?)").run(event.id, user.id, user.id, message, when.toISOString());
  recordCalendarReminderAudit(user.id, Number(result.lastInsertRowid), event.title);
  return NextResponse.json({ id: Number(result.lastInsertRowid) }, { status: 201 });
}

function recordCalendarReminderAudit(userId: number, reminderId: number, title: string) {
  db.prepare("INSERT INTO audit_log(actor_id,action,target,detail) VALUES(?,?,?,?)").run(userId, "CALENDAR.REMINDER.CREATE", String(reminderId), `Scheduled a Task Buddy reminder for “${title}”`);
}
