import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import db from "@/lib/db";
import { canManageTeam, teamRole } from "@/lib/teams";

async function readId(params: Promise<{ id: string }>) {
  const value = (await params).id;
  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric > 0) return numeric;
  const row = await db.prepare("SELECT id FROM teams WHERE public_id=?").get(value) as {id:number}|undefined;
  return row?.id || null;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = await readId(params);
  if (!id) return NextResponse.json({ error: "Invalid team" }, { status: 400 });
  const role = await teamRole(user, id);
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const team = await db.prepare(`SELECT t.id,t.public_id teamKey,t.name,t.description,t.color,t.owner_id ownerId,u.name ownerName
    FROM teams t JOIN users u ON u.id=t.owner_id WHERE t.id=?`).get(id);
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });
  const members = await db.prepare(`SELECT u.id,u.name,u.email,u.avatar,'owner' role
    FROM teams t JOIN users u ON u.id=t.owner_id WHERE t.id=?
    UNION ALL
    SELECT member.id,member.name,member.email,member.avatar,tm.role
    FROM team_members tm JOIN users member ON member.id=tm.user_id
    WHERE tm.team_id=? ORDER BY name COLLATE NOCASE`).all(id, id);
  const workspaces = await db.prepare(`SELECT w.id,w.public_id workspaceKey,w.name,w.kind,w.owner_id ownerId,
    tw.permission,owner.name ownerName
    FROM team_workspaces tw JOIN workspaces w ON w.id=tw.workspace_id JOIN users owner ON owner.id=w.owner_id
    WHERE tw.team_id=? ORDER BY w.name COLLATE NOCASE`).all(id);
  return NextResponse.json({ team, members, workspaces, role, canManage: canManageTeam(role), canDelete: role === "owner" });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = await readId(params);
  if (!id) return NextResponse.json({ error: "Invalid team" }, { status: 400 });
  const role = await teamRole(user, id);
  if (!canManageTeam(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  const description = String(body.description || "").trim();
  const color = String(body.color || "#7c6ce7").trim();
  if (!name || name.length > 80 || description.length > 500 || !/^#[0-9a-f]{6}$/i.test(color))
    return NextResponse.json({ error: "Enter a team name, description, and valid color" }, { status: 400 });
  await db.prepare("UPDATE teams SET name=?,description=?,color=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .run(name, description, color, id);
  await db.prepare("INSERT INTO audit_log(actor_id,action,target,detail) VALUES(?,?,?,?)")
    .run(user.id, "TEAM.UPDATE", String(id), `Updated team “${name}”`);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = await readId(params);
  if (!id) return NextResponse.json({ error: "Invalid team" }, { status: 400 });
  if ((await teamRole(user, id)) !== "owner") return NextResponse.json({ error: "Only the team owner can delete it" }, { status: 403 });
  await db.prepare("DELETE FROM teams WHERE id=?").run(id);
  await db.prepare("INSERT INTO audit_log(actor_id,action,target,detail) VALUES(?,?,?,?)")
    .run(user.id, "TEAM.DELETE", String(id), "Deleted a team and removed its workspace links");
  return NextResponse.json({ ok: true });
}
