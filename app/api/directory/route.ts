import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import db from "@/lib/db";
import { syncAuthentikDirectory } from "@/lib/authentik-directory";
export async function GET() {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await syncAuthentikDirectory();
  } catch (error) {
    console.error("Authentik directory sync failed", error);
  }
  const users = await db
    .prepare(
      `SELECT u.id,u.name,u.email,u.avatar,u.role,u.status,u.auth_source authSource,u.discord_username discordUsername,
  (SELECT COUNT(*) FROM boards b WHERE b.owner_id=u.id)+(SELECT COUNT(*) FROM board_members bm WHERE bm.user_id=u.id) boards,
  (SELECT COUNT(*) FROM calendars c WHERE c.owner_id=u.id AND c.deleted_at IS NULL AND c.calendar_type='streaming' AND c.visibility='public') AS publicStreamCalendarCount,
  (SELECT c.name FROM calendars c WHERE c.owner_id=u.id AND c.deleted_at IS NULL AND c.calendar_type='streaming' AND c.visibility='public' ORDER BY c.created_at LIMIT 1) AS publicStreamCalendarName
  FROM users u WHERE u.status='Active' AND u.directory_visible=1 ORDER BY u.name COLLATE NOCASE`,
    )
    .all();
  const configuredMain = await db.prepare("SELECT value FROM app_meta WHERE key='main_team_id'").get() as { value:string } | undefined;
  const mainTeamId = Number(configuredMain?.value || "") || -1;
  for (const user of users as Array<{ id:number; teamNames?:string[] }>) {
    // team_members has a composite primary key, and the join is scoped to one
    // user, so each team can contribute at most one row. Avoid DISTINCT here:
    // PostgreSQL rejects ORDER BY expressions that are not in a DISTINCT
    // select list (the SQLite version accepted this query).
    const memberships = await db.prepare(`SELECT t.id,t.name FROM teams t LEFT JOIN team_members tm ON tm.team_id=t.id AND tm.user_id=? WHERE t.owner_id=? OR tm.user_id=? ORDER BY CASE WHEN t.id=? THEN 0 ELSE 1 END,t.name COLLATE NOCASE,t.id`).all(user.id,user.id,user.id,mainTeamId) as Array<{name:string}>;
    user.teamNames = memberships.map((item) => item.name);
  }
  return NextResponse.json({ users });
}
