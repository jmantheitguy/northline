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
  for (const user of users as Array<{ id:number; teamNames?:string[] }>) {
    const memberships = await db.prepare(`SELECT t.name FROM teams t LEFT JOIN team_members tm ON tm.team_id=t.id WHERE t.owner_id=? OR tm.user_id=? ORDER BY t.name COLLATE NOCASE`).all(user.id,user.id) as Array<{name:string}>;
    user.teamNames = memberships.map((item) => item.name);
  }
  return NextResponse.json({ users });
}
