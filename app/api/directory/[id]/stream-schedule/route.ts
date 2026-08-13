import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import db from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await currentUser()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ownerId = Number((await params).id);
  if (!Number.isSafeInteger(ownerId) || ownerId < 1)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const owner = db
    .prepare(
      "SELECT id,name,avatar,timezone FROM users WHERE id=? AND status='Active'",
    )
    .get(ownerId) as
    | { id: number; name: string; avatar: string | null; timezone: string }
    | undefined;
  if (!owner) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(request.url);
  const from = url.searchParams.get("from") || new Date().toISOString();
  const to =
    url.searchParams.get("to") ||
    new Date(Date.now() + 180 * 86400000).toISOString();
  const calendars = db
    .prepare(
      `SELECT public_id id,name,color,description,timezone
       FROM calendars
       WHERE owner_id=? AND deleted_at IS NULL
         AND calendar_type='streaming' AND visibility='public'
       ORDER BY created_at`,
    )
    .all(ownerId);
  const events = db
    .prepare(
      `SELECT e.public_id id,e.title,e.description,e.start_at startAt,e.end_at endAt,
         e.timezone,e.all_day allDay,e.event_kind kind,e.platform,e.game,
         e.stream_url streamUrl,c.public_id calendarId,c.name calendarName,c.color
       FROM calendar_events e
       JOIN calendars c ON c.id=e.calendar_id
       WHERE c.owner_id=? AND c.deleted_at IS NULL AND e.deleted_at IS NULL
         AND c.calendar_type='streaming' AND c.visibility='public'
         AND e.visibility IN ('calendar','public') AND e.status!='cancelled'
         AND e.start_at<? AND e.end_at>?
       ORDER BY e.start_at,c.name`,
    )
    .all(ownerId, to, from);

  return NextResponse.json({ owner, calendars, events });
}
