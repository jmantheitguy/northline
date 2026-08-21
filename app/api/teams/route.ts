import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import db, { createTeamPublicId } from "@/lib/db";
import { normalizeTeamColor } from "@/lib/team-colors";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const configuredMain = await db
    .prepare("SELECT value FROM app_meta WHERE key='main_team_id'")
    .get() as { value: string } | undefined;
  const mainTeamId = Number(configuredMain?.value || "") || -1;
  const teams = await db
    .prepare(
      `SELECT t.id,t.public_id teamKey,t.name,t.description,t.color,t.owner_id ownerId,
        owner.name ownerName,
        CASE WHEN t.owner_id=? THEN 'owner' ELSE COALESCE(tm.role,'viewer') END role,
        CASE WHEN t.id=? THEN 1 ELSE 0 END isMain,
        (SELECT COUNT(*) FROM team_members m WHERE m.team_id=t.id)+1 memberCount,
        (SELECT COUNT(*) FROM team_workspaces tw WHERE tw.team_id=t.id) workspaceCount
       FROM teams t JOIN users owner ON owner.id=t.owner_id
       LEFT JOIN team_members tm ON tm.team_id=t.id AND tm.user_id=?
       ORDER BY CASE WHEN t.owner_id=? OR tm.user_id IS NOT NULL THEN 0 WHEN t.id=? THEN 1 ELSE 2 END,
         t.name COLLATE NOCASE`,
    )
    .all(user.id, mainTeamId, user.id, user.id, mainTeamId);
  return NextResponse.json({ teams, mainTeamId: mainTeamId > 0 ? mainTeamId : null });
}
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  const description = String(body.description || "").trim();
  const color = normalizeTeamColor(body.color || "#7c6ce7");
  if (!name || name.length > 80 || description.length > 500 || !color)
    return NextResponse.json({ error: "Enter a team name, description, and valid color" }, { status: 400 });
  const publicId = createTeamPublicId();
  const result = await db.transaction(async () => {
    const created = await db
      .prepare("INSERT INTO teams(public_id,name,description,color,owner_id) VALUES(?,?,?,?,?)")
      .run(publicId, name, description, color, user.id);
    await db.prepare("INSERT INTO audit_log(actor_id,action,target,detail) VALUES(?,?,?,?)")
      .run(user.id, "TEAM.CREATE", publicId, `Created team “${name}”`);
    return { id: Number(created.lastInsertRowid), teamKey: publicId };
  });
  return NextResponse.json(result, { status: 201 });
}
