import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import db from "@/lib/db";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const configured = await db.prepare("SELECT value FROM app_meta WHERE key='main_team_id'").get() as { value:string } | undefined;
  const mainTeamId = Number(configured?.value || "") || null;
  const teams = await db.prepare(`SELECT t.id,t.public_id teamKey,t.name,t.color,t.owner_id ownerId,u.name ownerName
    FROM teams t JOIN users u ON u.id=t.owner_id ORDER BY t.name COLLATE NOCASE`).all();
  return NextResponse.json({ mainTeamId, teams });
}

export async function PATCH(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const raw = body.mainTeamId;
  const mainTeamId = raw === null || raw === "" || raw === undefined ? null : Number(raw);
  if (mainTeamId !== null && (!Number.isInteger(mainTeamId) || mainTeamId <= 0))
    return NextResponse.json({ error: "Choose a valid main team" }, { status: 400 });
  if (mainTeamId !== null) {
    const team = await db.prepare("SELECT id,name FROM teams WHERE id=?").get(mainTeamId) as { id:number; name:string } | undefined;
    if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }
  await db.transaction(async () => {
    if (mainTeamId === null) {
      await db.prepare("DELETE FROM app_meta WHERE key='main_team_id'").run();
    } else {
      await db.prepare("INSERT INTO app_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run("main_team_id", String(mainTeamId));
    }
    await db.prepare("INSERT INTO audit_log(actor_id,action,target,detail) VALUES(?,?,?,?)")
      .run(admin.id, "TEAM.MAIN.UPDATE", mainTeamId === null ? "none" : String(mainTeamId), mainTeamId === null ? "Cleared the main team" : `Set team ${mainTeamId} as the main team`);
  });
  return NextResponse.json({ ok: true, mainTeamId });
}
