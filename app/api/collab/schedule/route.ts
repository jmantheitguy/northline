import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import db from "@/lib/db";

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const from = url.searchParams.get("from") || new Date().toISOString();
  const to =
    url.searchParams.get("to") ||
    new Date(Date.now() + 90 * 86400000).toISOString();
  const events = await db
    .prepare(
      `
    SELECT e.public_id id,e.title,e.description,e.start_at startAt,e.end_at endAt,e.timezone,
      e.event_kind kind,e.visibility,e.platform,e.game,e.stream_url streamUrl,e.collab_enabled collabEnabled,e.collab_request_id collabRequestId,
      c.public_id calendarId,c.name calendarName,c.color,c.owner_id ownerId,
      u.name ownerName,u.avatar ownerAvatar
    FROM calendar_events e
    JOIN calendars c ON c.id=e.calendar_id
    JOIN users u ON u.id=c.owner_id
    LEFT JOIN teams team ON team.id=c.team_id
    LEFT JOIN team_members tm ON tm.team_id=c.team_id AND tm.user_id=?
    WHERE e.deleted_at IS NULL AND c.deleted_at IS NULL
      AND e.start_at<? AND e.end_at>?
      AND (c.owner_id=? OR (
        c.calendar_type='streaming' AND c.visibility IN ('team','public')
        AND e.visibility IN ('calendar','team','public','busy')
        AND (c.visibility='public' OR (u.status='Active' AND (c.team_id IS NULL OR team.owner_id=? OR tm.user_id IS NOT NULL)))
      ))
    ORDER BY e.start_at,CASE WHEN e.collab_request_id IS NOT NULL AND c.owner_id=(SELECT requester_id FROM collab_requests WHERE id=e.collab_request_id) THEN 0 ELSE 1 END,u.name COLLATE NOCASE
  `,
    )
    .all(user.id, user.id, to, from, user.id) as Array<
    Record<string, unknown> & { ownerId: number; visibility: string }
  >;
  const safeEvents = events.map((event) => {
    if (event.ownerId !== user.id && event.visibility === "busy") {
      return {
        ...event,
        title: "Busy",
        description: "",
        platform: "",
        game: "",
        streamUrl: "",
        collabEnabled: 0,
      };
    }
    return event;
  });
  const seen = new Set<number>();
  const groupedEvents = await Promise.all(safeEvents
    .filter((event) => {
      const requestId = Number(event.collabRequestId || 0);
      if (!requestId) return true;
      if (seen.has(requestId)) return false;
      seen.add(requestId);
      return true;
    })
    .map(async (event) => {
      const requestId = Number(event.collabRequestId || 0);
      if (!requestId) return event;
      const names = await db
        .prepare(
          `SELECT u.name FROM collab_request_participants p JOIN users u ON u.id=p.user_id WHERE p.collab_request_id=? AND p.status='accepted' ORDER BY u.name COLLATE NOCASE`,
        )
        .all(requestId) as Array<{ name: string }>;
      return { ...event, participantNames: names.map((item) => item.name) };
    }));
  const people = await db
    .prepare(
      "SELECT id,name,email,avatar,timezone FROM users WHERE status='Active' AND directory_visible=1 ORDER BY name COLLATE NOCASE",
    )
    .all();
  for (const person of people as Array<{id:number;teamNames?:string[]}>) {
    const memberships = await db.prepare(`SELECT t.name FROM teams t LEFT JOIN team_members tm ON tm.team_id=t.id WHERE t.owner_id=? OR tm.user_id=? ORDER BY t.name COLLATE NOCASE`).all(person.id,person.id) as Array<{name:string}>;
    person.teamNames = memberships.map((item)=>item.name);
  }
  return NextResponse.json({ events: groupedEvents, people });
}
