import db from "./db";
import type { SessionUser } from "./auth";

export type TeamRole = "owner" | "manager" | "member";
export type TeamWorkspacePermission = "viewer" | "editor";

export async function teamRole(
  user: SessionUser,
  teamId: number,
): Promise<TeamRole | null> {
  const team = await db
    .prepare("SELECT owner_id ownerId FROM teams WHERE id=?")
    .get(teamId) as { ownerId: number } | undefined;
  if (!team) return null;
  if (team.ownerId === user.id) return "owner";
  const member = await db
    .prepare("SELECT role FROM team_members WHERE team_id=? AND user_id=?")
    .get(teamId, user.id) as { role: "manager" | "member" } | undefined;
  return member?.role || null;
}

export const canManageTeam = (role: TeamRole | null) =>
  role === "owner" || role === "manager";

export async function teamWorkspacePermission(
  user: SessionUser,
  workspaceId: number,
): Promise<TeamWorkspacePermission | null> {
  const access = await db
    .prepare(
      `SELECT tw.permission
       FROM team_workspaces tw
       JOIN teams t ON t.id=tw.team_id
       LEFT JOIN team_members tm ON tm.team_id=tw.team_id AND tm.user_id=?
       WHERE tw.workspace_id=? AND (t.owner_id=? OR tm.user_id=?)
       ORDER BY CASE WHEN tw.permission='editor' THEN 0 ELSE 1 END
       LIMIT 1`,
    )
    .get(
      user.id,
      workspaceId,
      user.id,
      user.id,
    ) as { permission: TeamWorkspacePermission } | undefined;
  return access?.permission || null;
}

export async function teamMemberIds(teamId: number) {
  const team = await db
    .prepare("SELECT owner_id ownerId FROM teams WHERE id=?")
    .get(teamId) as { ownerId: number } | undefined;
  if (!team) return [];
  const members = await db
    .prepare("SELECT user_id userId FROM team_members WHERE team_id=?")
    .all(teamId) as Array<{ userId: number }>;
  return [team.ownerId, ...members.map((member) => member.userId)];
}
