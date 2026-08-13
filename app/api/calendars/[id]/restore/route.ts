import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import db from "@/lib/db";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const key = (await params).id;
  const calendar = db.prepare("SELECT id,name FROM calendars WHERE public_id=? AND owner_id=? AND deleted_at IS NOT NULL AND datetime(deleted_at)>=datetime('now','-30 days')").get(key, user.id) as { id: number; name: string } | undefined;
  if (!calendar) return NextResponse.json({ error: "Recoverable calendar not found" }, { status: 404 });
  db.prepare("UPDATE calendars SET deleted_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(calendar.id);
  db.prepare("INSERT INTO audit_log(actor_id,action,target,detail) VALUES(?,?,?,?)").run(user.id, "CALENDAR.RESTORE", String(calendar.id), `Restored calendar “${calendar.name}”`);
  return NextResponse.json({ ok: true });
}
