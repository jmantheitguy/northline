import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import db from "@/lib/db";

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const from = url.searchParams.get("from") || new Date().toISOString();
  const to = url.searchParams.get("to") || new Date(Date.now() + 90 * 86400000).toISOString();
  const events = db.prepare(`
    SELECT e.public_id id,e.title,e.description,e.start_at startAt,e.end_at endAt,e.timezone,
      e.event_kind kind,e.visibility,e.platform,e.game,e.stream_url streamUrl,e.collab_enabled collabEnabled,
      c.public_id calendarId,c.name calendarName,c.color,c.owner_id ownerId,
      u.name ownerName,u.avatar ownerAvatar
    FROM calendar_events e
    JOIN calendars c ON c.id=e.calendar_id
    JOIN users u ON u.id=c.owner_id
    WHERE e.deleted_at IS NULL AND c.deleted_at IS NULL AND u.status='Active'
      AND e.start_at<? AND e.end_at>?
      AND (c.owner_id=? OR (
        c.calendar_type='streaming' AND c.visibility IN ('team','public')
        AND e.visibility IN ('calendar','team','public','busy')
      ))
    ORDER BY e.start_at,u.name COLLATE NOCASE
  `).all(to, from, user.id) as Array<Record<string, unknown> & { ownerId: number; visibility: string }>;
  const safeEvents = events.map((event) => {
    if (event.ownerId !== user.id && event.visibility === "busy") {
      return { ...event, title: "Busy", description: "", platform: "", game: "", streamUrl: "", collabEnabled: 0 };
    }
    return event;
  });
  const people = db.prepare("SELECT id,name,email,avatar,timezone FROM users WHERE status='Active' ORDER BY name COLLATE NOCASE").all();
  return NextResponse.json({ events: safeEvents, people });
}
