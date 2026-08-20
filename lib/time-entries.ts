import db from "./db";
import type { SessionUser } from "./auth";
import { accessibleBoardIds, boardPermission } from "./boards";

export const MAX_ENTRY_SECONDS = 7 * 24 * 60 * 60;

export function elapsedSeconds(
  startedAt: string,
  endedAt: string | null,
  pausedSeconds = 0,
  pausedAt: string | null = null,
  now = new Date(),
) {
  const end = endedAt ? new Date(endedAt) : now;
  const start = new Date(startedAt);
  let paused = Math.max(0, Number(pausedSeconds) || 0);
  if (pausedAt && !endedAt) paused += Math.max(0, Math.floor((now.getTime() - new Date(pausedAt).getTime()) / 1000));
  if (pausedAt && endedAt) paused += Math.max(0, Math.floor((end.getTime() - new Date(pausedAt).getTime()) / 1000));
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000) - paused);
}

export function validateClockIn(startedAt: string, now = new Date()) {
  const start = new Date(startedAt);
  if (!Number.isFinite(start.getTime()) || start.getTime() > now.getTime())
    throw new Error("Time in must be a valid time that is not in the future");
  return start.toISOString();
}

export function secondsBetween(startedAt: string, endedAt: string) {
  const start = new Date(startedAt);
  const end = new Date(endedAt);
  const seconds = Math.floor((end.getTime() - start.getTime()) / 1000);
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > MAX_ENTRY_SECONDS)
    throw new Error(
      "Time entries must be longer than zero and no longer than 7 days",
    );
  return seconds;
}

export async function validateAssociation(
  user: SessionUser,
  boardId: unknown,
  taskId: unknown,
) {
  const board = boardId ? Number(boardId) : null;
  const task = taskId ? Number(taskId) : null;
  if (!board && task) throw new Error("Choose a board for the selected task");
  if (board && !(await boardPermission(user, board)))
    throw new Error("You cannot log time to that board");
  if (task) {
    const found = await db
      .prepare("SELECT id FROM tasks WHERE id=? AND board_id=?")
      .get(task, board);
    if (!found)
      throw new Error("The selected task does not belong to that board");
  }
  const workspace = board
    ? (await db
        .prepare("SELECT workspace_id workspaceId FROM boards WHERE id=?")
        .get(board) as { workspaceId: number } | undefined)
    : undefined;
  return {
    boardId: board,
    taskId: task,
    workspaceId: workspace?.workspaceId || null,
  };
}

export async function ensureNoOverlap(
  userId: number,
  startedAt: string,
  endedAt: string,
  exceptId?: number,
) {
  const overlap = await db
    .prepare(
      `SELECT id FROM time_entries
    WHERE user_id=? AND id!=?
      AND deleted_at IS NULL
      AND started_at < ? AND (ended_at IS NULL OR ended_at > ?) LIMIT 1`,
    )
    .get(userId, exceptId || -1, endedAt, startedAt);
  if (overlap) throw new Error("This time overlaps an existing entry");
}

export async function timeOptions(user: SessionUser) {
  // Use the same authoritative permission check as every board API. Keeping a
  // second SQL implementation here risks exposing private board metadata when
  // workspace or direct-share behavior changes.
  const boardIds = await accessibleBoardIds(user);
  const boards = boardIds.length
    ? await db
        .prepare(
          `SELECT b.id,b.name,w.id workspaceId,w.name workspaceName
           FROM boards b JOIN workspaces w ON w.id=b.workspace_id
           WHERE b.id IN (${boardIds.map(() => "?").join(",")})
           ORDER BY w.name,b.name`,
        )
        .all(...boardIds)
    : [];
  const tasks = boardIds.length
    ? await db
        .prepare(
          `SELECT id,board_id boardId,title FROM tasks
    WHERE archived_at IS NULL AND board_id IN (${boardIds.map(() => "?").join(",")}) ORDER BY title`,
        )
        .all(...boardIds)
    : [];
  return { boards, tasks };
}

export const entrySelect = `SELECT e.id,e.user_id userId,e.workspace_id workspaceId,e.board_id boardId,e.task_id taskId,
  e.started_at startedAt,e.ended_at endedAt,e.duration_seconds durationSeconds,e.paused_at pausedAt,e.paused_seconds pausedSeconds,e.note,e.source,e.deleted_at deletedAt,e.created_at createdAt,e.updated_at updatedAt,
  u.name userName,u.avatar userAvatar,w.name workspaceName,b.name boardName,t.title taskTitle
  FROM time_entries e JOIN users u ON u.id=e.user_id
  LEFT JOIN workspaces w ON w.id=e.workspace_id LEFT JOIN boards b ON b.id=e.board_id LEFT JOIN tasks t ON t.id=e.task_id`;

export async function auditTimeEntry(
  entryId: number,
  actorId: number,
  action: string,
  previous: unknown,
  next: unknown,
  reason = "",
) {
  await db.prepare(
    "INSERT INTO time_entry_audit(time_entry_id,actor_user_id,action,previous_values,new_values,reason) VALUES(?,?,?,?,?,?)",
  ).run(
    entryId,
    actorId,
    action,
    previous ? JSON.stringify(previous) : null,
    next ? JSON.stringify(next) : null,
    reason,
  );
}
