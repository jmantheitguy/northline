import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import db from "@/lib/db";
import { teamRole } from "@/lib/teams";

async function readId(params: Promise<{ id: string }>) {
  const value = (await params).id;
  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric > 0) return numeric;
  const row = await db.prepare("SELECT id FROM teams WHERE public_id=?").get(value) as { id: number } | undefined;
  return row?.id || null;
}

/** Transfer team ownership without changing the team's membership roster. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const teamId = await readId(params);
  if (!teamId) return NextResponse.json({ error: "Invalid team" }, { status: 400 });
  if ((await teamRole(user, teamId)) !== "owner") {
    return NextResponse.json({ error: "Only the team owner can transfer ownership" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const targetId = Number(body.userId);
  if (!Number.isInteger(targetId) || targetId <= 0) {
    return NextResponse.json({ error: "Choose an active team member" }, { status: 400 });
  }
  if (targetId === user.id) {
    return NextResponse.json({ error: "You already own this team" }, { status: 400 });
  }

  const target = await db.prepare(`
    SELECT member.id,member.name
    FROM team_members tm
    JOIN users member ON member.id=tm.user_id
    WHERE tm.team_id=? AND tm.user_id=? AND member.status='Active'
  `).get(teamId, targetId) as { id: number; name: string } | undefined;
  if (!target) {
    return NextResponse.json({ error: "The new owner must be an active team member" }, { status: 400 });
  }

  const team = await db.prepare("SELECT name,owner_id ownerId FROM teams WHERE id=?").get(teamId) as { name: string; ownerId: number } | undefined;
  if (!team || team.ownerId !== user.id) {
    return NextResponse.json({ error: "Only the team owner can transfer ownership" }, { status: 403 });
  }

  try {
    await db.transaction(async () => {
      const changed = await db.prepare("UPDATE teams SET owner_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND owner_id=?")
        .run(target.id, teamId, user.id);
      if (!changed.changes) throw new Error("Team ownership changed; refresh and try again");

      // The former owner remains a normal member, while the new owner is represented by teams.owner_id.
      await db.prepare("INSERT INTO team_members(team_id,user_id,role) VALUES(?,?,?) ON CONFLICT(team_id,user_id) DO UPDATE SET role=excluded.role")
        .run(teamId, user.id, "member");
      await db.prepare("DELETE FROM team_members WHERE team_id=? AND user_id=?").run(teamId, target.id);
      await db.prepare("INSERT INTO audit_log(actor_id,action,target,detail) VALUES(?,?,?,?)")
        .run(user.id, "TEAM.OWNER_TRANSFER", String(teamId), `Transferred “${team.name}” ownership to ${target.name}`);
    });
  } catch (error) {
    const message = error instanceof Error && error.message === "Team ownership changed; refresh and try again"
      ? error.message
      : "Unable to transfer team ownership";
    return NextResponse.json({ error: message }, { status: 409 });
  }

  return NextResponse.json({ ok: true, ownerId: target.id, ownerName: target.name });
}
