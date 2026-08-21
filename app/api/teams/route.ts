import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import db, { createTeamPublicId } from "@/lib/db";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const teams = await db
    .prepare(
      `SELECT t.id,t.public_id teamKey,t.name,t.description,t.color,t.owner_id ownerId,
        owner.name ownerName,
        CASE WHEN t.owner_id=? THEN 'owner' ELSE tm.role END role,
        (SELECT COUNT(*) FROM team_members m WHERE m.team_id=t.id)+1 memberCount,
        (SELECT COUNT(*) FROM team_workspaces tw WHERE tw.team_id=t.id) workspaceCount
       FROM teams t JOIN users owner ON owner.id=t.owner_id
       LEFT JOIN team_members tm ON tm.team_id=t.id AND tm.user_id=?
       WHERE t.owner_id=? OR tm.user_id=?
       ORDER BY t.name COLLATE NOCASE`,
    )
    .all(user.id, user.id, user.id, user.id);
  return NextResponse.json({ teams });
}
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  const description = String(body.description || "").trim();
  const color = String(body.color || "#7c6ce7").trim();
  if (!name || name.length > 80 || description.length > 500 || !/^#[0-9a-f]{6}$/i.test(color))
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
