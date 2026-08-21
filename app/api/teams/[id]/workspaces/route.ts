import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import db, { createWorkspacePublicId } from "@/lib/db";
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
  const permission = String(body.permission || "viewer");
  if (!["viewer", "editor"].includes(permission))
    return NextResponse.json({ error: "Choose a valid access level" }, { status: 400 });

  // Owners and managers can create a team workspace in one operation. The
  // workspace is owned by the creator, then immediately linked to the team so
  // inherited board access is available without a second, owner-only step.
  const hasWorkspaceId = body.workspaceId !== undefined && body.workspaceId !== null && String(body.workspaceId).trim() !== "";
  if (!hasWorkspaceId) {
    const name = String(body.name || "").trim();
    if (!name || name.length > 80)
      return NextResponse.json({ error: "Workspace name must be between 1 and 80 characters" }, { status: 400 });
    const created = await db.transaction(async () => {
      const publicId = createWorkspacePublicId();
      const result = await db.prepare("INSERT INTO workspaces(public_id,name,owner_id,kind) VALUES(?,?,?,'shared')")
        .run(publicId, name, user.id);
      const workspaceId = Number(result.lastInsertRowid);
      await db.prepare("INSERT INTO team_workspaces(team_id,workspace_id,permission,created_by) VALUES(?,?,?,?)")
        .run(teamId, workspaceId, permission, user.id);
      await db.prepare("INSERT INTO audit_log(actor_id,action,target,detail) VALUES(?,?,?,?)")
        .run(user.id, "TEAM.WORKSPACE_CREATE", `${teamId}:${publicId}`, `Created team workspace “${name}” with ${permission} member access`);
      return { id: workspaceId, workspaceKey: publicId, name, permission };
    });
    return NextResponse.json({ ok: true, workspace: created }, { status: 201 });
  }

  const workspaceId = Number(body.workspaceId);
  if (!Number.isInteger(workspaceId) || workspaceId <= 0)
    return NextResponse.json({ error: "Choose a workspace" }, { status: 400 });
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
  if (!Number.isInteger(workspaceId) || workspaceId <= 0)
    return NextResponse.json({ error: "Choose a workspace" }, { status: 400 });
  const linked = await db.prepare("SELECT 1 FROM team_workspaces WHERE team_id=? AND workspace_id=?").get(teamId, workspaceId);
  if (!linked) return NextResponse.json({ error: "That workspace is not linked to this team" }, { status: 404 });
  await db.prepare("DELETE FROM team_workspaces WHERE team_id=? AND workspace_id=?").run(teamId, workspaceId);
  await db.prepare("INSERT INTO audit_log(actor_id,action,target,detail) VALUES(?,?,?,?)")
    .run(user.id, "TEAM.WORKSPACE_UNLINK", `${teamId}:${workspaceId}`, "Disconnected a workspace from a team");
  return NextResponse.json({ ok: true });
}
