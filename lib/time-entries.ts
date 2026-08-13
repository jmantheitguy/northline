import db from "./db";
import type { SessionUser } from "./auth";
import { boardPermission } from "./boards";

export const MAX_ENTRY_SECONDS = 7 * 24 * 60 * 60;

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

export function validateAssociation(
  user: SessionUser,
  boardId: unknown,
  taskId: unknown,
) {
  const board = boardId ? Number(boardId) : null;
  const task = taskId ? Number(taskId) : null;
  if (!board && task) throw new Error("Choose a board for the selected task");
  if (board && !boardPermission(user, board))
    throw new Error("You cannot log time to that board");
  if (task) {
    const found = db
      .prepare("SELECT id FROM tasks WHERE id=? AND board_id=?")
      .get(task, board);
    if (!found)
      throw new Error("The selected task does not belong to that board");
  }
  const workspace = board
    ? (db
        .prepare("SELECT workspace_id workspaceId FROM boards WHERE id=?")
        .get(board) as { workspaceId: number } | undefined)
    : undefined;
  return {
    boardId: board,
    taskId: task,
    workspaceId: workspace?.workspaceId || null,
  };
}

export function ensureNoOverlap(
  userId: number,
  startedAt: string,
  endedAt: string,
  exceptId?: number,
) {
  const overlap = db
    .prepare(
      `SELECT id FROM time_entries
    WHERE user_id=? AND id!=?
      AND deleted_at IS NULL
      AND started_at < ? AND (ended_at IS NULL OR ended_at > ?) LIMIT 1`,
    )
    .get(userId, exceptId || -1, endedAt, startedAt);
  if (overlap) throw new Error("This time overlaps an existing entry");
}

export function timeOptions(user: SessionUser) {
  const boards = db
    .prepare(
      `SELECT DISTINCT b.id,b.name,w.id workspaceId,w.name workspaceName
    FROM boards b JOIN workspaces w ON w.id=b.workspace_id
    LEFT JOIN board_members bm ON bm.board_id=b.id AND bm.user_id=?
    LEFT JOIN workspace_members wm ON wm.workspace_id=w.id AND wm.user_id=?
    WHERE b.owner_id=? OR w.owner_id=? OR bm.user_id IS NOT NULL OR wm.user_id IS NOT NULL
    ORDER BY w.name,b.name`,
    )
    .all(user.id, user.id, user.id, user.id);
  const boardIds = (boards as Array<{ id: number }>).map((board) => board.id);
  const tasks = boardIds.length
    ? db
        .prepare(
          `SELECT id,board_id boardId,title FROM tasks
    WHERE archived_at IS NULL AND board_id IN (${boardIds.map(() => "?").join(",")}) ORDER BY title`,
        )
        .all(...boardIds)
    : [];
  return { boards, tasks };
}

export const entrySelect = `SELECT e.id,e.user_id userId,e.workspace_id workspaceId,e.board_id boardId,e.task_id taskId,
  e.started_at startedAt,e.ended_at endedAt,e.duration_seconds durationSeconds,e.note,e.source,e.deleted_at deletedAt,e.created_at createdAt,e.updated_at updatedAt,
  u.name userName,u.avatar userAvatar,w.name workspaceName,b.name boardName,t.title taskTitle
  FROM time_entries e JOIN users u ON u.id=e.user_id
  LEFT JOIN workspaces w ON w.id=e.workspace_id LEFT JOIN boards b ON b.id=e.board_id LEFT JOIN tasks t ON t.id=e.task_id`;

export function auditTimeEntry(
  entryId: number,
  actorId: number,
  action: string,
  previous: unknown,
  next: unknown,
  reason = "",
) {
  db.prepare(
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
