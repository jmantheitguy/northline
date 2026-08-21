import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import db from "@/lib/db";
import { canManageTeam, teamRole } from "@/lib/teams";
import { workspacePermission } from "@/lib/workspaces";

async function readId(params: Promise<{ id: string }>) {
  const value = (await params).id;
  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric > 0) return numeric;
  const row = await db.prepare("SELECT id FROM teams WHERE public_id=?").get(value) as {id:number}|undefined;
  return row?.id || null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const teamId = await readId(params), actorRole = teamId ? await teamRole(user, teamId) : null;
  if (!teamId || !canManageTeam(actorRole)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const workspaceId = Number(body.workspaceId), permission = String(body.permission || "viewer");
  if (!Number.isInteger(workspaceId) || workspaceId <= 0 || !["viewer", "editor"].includes(permission))
    return NextResponse.json({ error: "Choose a workspace and valid access level" }, { status: 400 });
  if (await workspacePermission(user, workspaceId) !== "owner")
    return NextResponse.json({ error: "Only the workspace owner can connect it to a team" }, { status: 403 });
  const workspace = await db.prepare("SELECT kind FROM workspaces WHERE id=?").get(workspaceId) as { kind: string } | undefined;
  if (!workspace || workspace.kind !== "shared") return NextResponse.json({ error: "Teams can only be connected to shared workspaces" }, { status: 400 });
  await db.prepare("INSERT INTO team_workspaces(team_id,workspace_id,permission,created_by) VALUES(?,?,?,?) ON CONFLICT(team_id,workspace_id) DO UPDATE SET permission=excluded.permission")
    .run(teamId, workspaceId, permission, user.id);
  await db.prepare("INSERT INTO audit_log(actor_id,action,target,detail) VALUES(?,?,?,?)")
    .run(user.id, "TEAM.WORKSPACE_LINK", `${teamId}:${workspaceId}`, `Connected workspace with ${permission} access`);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const teamId = await readId(params), actorRole = teamId ? await teamRole(user, teamId) : null;
  if (!teamId || !canManageTeam(actorRole)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const workspaceId = Number((await request.json().catch(() => ({}))).workspaceId);
  if (!Number.isInteger(workspaceId) || workspaceId <= 0 || await workspacePermission(user, workspaceId) !== "owner")
    return NextResponse.json({ error: "Only the workspace owner can disconnect it" }, { status: 403 });
  await db.prepare("DELETE FROM team_workspaces WHERE team_id=? AND workspace_id=?").run(teamId, workspaceId);
  await db.prepare("INSERT INTO audit_log(actor_id,action,target,detail) VALUES(?,?,?,?)")
    .run(user.id, "TEAM.WORKSPACE_UNLINK", `${teamId}:${workspaceId}`, "Disconnected a workspace from a team");
  return NextResponse.json({ ok: true });
}
