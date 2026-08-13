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
  const users = db
    .prepare(
      `SELECT u.id,u.name,u.email,u.avatar,u.role,u.status,u.auth_source authSource,
  (SELECT COUNT(*) FROM boards b WHERE b.owner_id=u.id)+(SELECT COUNT(*) FROM board_members bm WHERE bm.user_id=u.id) boards,
  (SELECT COUNT(*) FROM calendars c WHERE c.owner_id=u.id AND c.deleted_at IS NULL AND c.calendar_type='streaming' AND c.visibility='public') publicStreamCalendarCount,
  (SELECT c.name FROM calendars c WHERE c.owner_id=u.id AND c.deleted_at IS NULL AND c.calendar_type='streaming' AND c.visibility='public' ORDER BY c.created_at LIMIT 1) publicStreamCalendarName
  FROM users u WHERE u.status='Active' AND u.directory_visible=1 ORDER BY u.name COLLATE NOCASE`,
    )
    .all();
  return NextResponse.json({ users });
}
