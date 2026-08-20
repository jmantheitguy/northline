import db from "./db";
import type { SessionUser } from "./auth";

export type CalendarPermission = "owner" | "editor" | "viewer";

export async function calendarPermission(
  user: SessionUser,
  calendarId: number,
): Promise<CalendarPermission | null> {
  const calendar = await db
    .prepare(
      `SELECT c.owner_id ownerId,cm.permission
       FROM calendars c LEFT JOIN calendar_members cm ON cm.calendar_id=c.id AND cm.user_id=?
       WHERE c.id=? AND c.deleted_at IS NULL`,
    )
    .get(user.id, calendarId) as
    { ownerId: number; permission: "viewer" | "editor" | null } | undefined;
  if (!calendar) return null;
  if (calendar.ownerId === user.id) return "owner";
  return calendar.permission || null;
}

export const canEditCalendar = (permission: CalendarPermission | null) =>
  permission === "owner" || permission === "editor";

export async function calendarIdByKey(key: string) {
  const calendar = await db
    .prepare(
      "SELECT id FROM calendars WHERE public_id=? AND deleted_at IS NULL",
    )
    .get(key) as { id: number } | undefined;
  return calendar?.id || null;
}

export async function calendarEventByKey(key: string) {
  return await db
    .prepare(
      "SELECT id,calendar_id calendarId,title FROM calendar_events WHERE public_id=? AND deleted_at IS NULL",
    )
    .get(key) as { id: number; calendarId: number; title: string } | undefined;
}

export async function recordCalendarActivity(
  calendarId: number,
  actorId: number,
  action: string,
  detail: string,
) {
  await db.prepare(
    "INSERT INTO calendar_activity(calendar_id,actor_id,action,detail) VALUES(?,?,?,?)",
  ).run(calendarId, actorId, action, detail.slice(0, 500));
  await db.prepare(
    "INSERT INTO audit_log(actor_id,action,target,detail) VALUES(?,?,?,?)",
  ).run(actorId, action, String(calendarId), detail.slice(0, 500));
}

export function validTimezone(value: unknown) {
  const timezone = String(value || "UTC").slice(0, 80);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    return timezone;
  } catch {
    throw new Error("Choose a valid time zone");
  }
}
