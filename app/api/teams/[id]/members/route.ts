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

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const teamId = await readId(params), actorRole = teamId ? await teamRole(user, teamId) : null;
  if (!teamId || !canManageTeam(actorRole)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const targetId = Number(body.userId), role = String(body.role || "member");
  if (!Number.isInteger(targetId) || targetId <= 0 || !["manager", "member"].includes(role))
    return NextResponse.json({ error: "Choose an active user and a valid team role" }, { status: 400 });
  if (actorRole === "manager" && role === "manager") return NextResponse.json({ error: "Only the team owner can appoint managers" }, { status: 403 });
  const team = await db.prepare("SELECT owner_id ownerId FROM teams WHERE id=?").get(teamId) as { ownerId: number } | undefined;
  const target = await db.prepare("SELECT id,status FROM users WHERE id=?").get(targetId) as { id: number; status: string } | undefined;
  if (!team || !target || target.status !== "Active") return NextResponse.json({ error: "Active user not found" }, { status: 404 });
  if (target.id === team.ownerId) return NextResponse.json({ error: "The owner already has full team control" }, { status: 400 });
  await db.prepare("INSERT INTO team_members(team_id,user_id,role) VALUES(?,?,?) ON CONFLICT(team_id,user_id) DO UPDATE SET role=excluded.role")
    .run(teamId, target.id, role);
  await db.prepare("INSERT INTO audit_log(actor_id,action,target,detail) VALUES(?,?,?,?)")
    .run(user.id, "TEAM.MEMBER_UPSERT", `${teamId}:${target.id}`, `Set team member role to ${role}`);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const teamId = await readId(params), actorRole = teamId ? await teamRole(user, teamId) : null;
  if (!teamId || !canManageTeam(actorRole)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const targetId = Number((await request.json().catch(() => ({}))).userId);
  const target = await db.prepare("SELECT role FROM team_members WHERE team_id=? AND user_id=?").get(teamId, targetId) as { role: "manager" | "member" } | undefined;
  if (!target) return NextResponse.json({ error: "Team member not found" }, { status: 404 });
  if (actorRole === "manager" && target.role === "manager") return NextResponse.json({ error: "Only the team owner can remove a manager" }, { status: 403 });
  await db.prepare("DELETE FROM team_members WHERE team_id=? AND user_id=?").run(teamId, targetId);
  await db.prepare("INSERT INTO audit_log(actor_id,action,target,detail) VALUES(?,?,?,?)")
    .run(user.id, "TEAM.MEMBER_REMOVE", `${teamId}:${targetId}`, "Removed a team member");
  return NextResponse.json({ ok: true });
}
