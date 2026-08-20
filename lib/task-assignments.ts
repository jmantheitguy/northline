import db from "./db";

/** Normalize legacy single-assignee payloads and the new multi-assignee form. */
export function normalizeAssigneeIds(value: unknown, legacyValue?: unknown) {
  const source = Array.isArray(value)
    ? value
    : value === undefined
      ? legacyValue == null
        ? []
        : [legacyValue]
      : value == null
        ? []
        : [value];
  return [...new Set(source.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
}

/** Return only active users who can actually be assigned work on this board. */
export async function validateAssigneeIds(boardId: number, ids: number[]) {
  if (!ids.length) return [];
  const rows = await db
    .prepare(
      `SELECT DISTINCT u.id
       FROM users u
       JOIN boards b ON b.id=?
       JOIN workspaces w ON w.id=b.workspace_id
       LEFT JOIN board_members bm ON bm.board_id=b.id AND bm.user_id=u.id
       LEFT JOIN workspace_members wm ON wm.workspace_id=w.id AND wm.user_id=u.id
       WHERE u.status='Active'
         AND u.id IN (${ids.map(() => "?").join(",")})
         AND (u.id=b.owner_id OR u.id=w.owner_id OR bm.user_id IS NOT NULL OR wm.user_id IS NOT NULL)`,
    )
    .all(boardId, ...ids) as Array<{ id: number }>;
  const allowed = new Set(rows.map((row) => row.id));
  if (allowed.size !== ids.length)
    throw new Error("Every assignee must have access to this board");
  return ids;
}

export async function taskAssigneeIds(taskId: number) {
  return (
    await db
      .prepare(
        "SELECT user_id userId FROM task_assignees WHERE task_id=? ORDER BY created_at,user_id",
      )
      .all(taskId) as Array<{ userId: number }>
  ).map((row) => row.userId);
}

export async function replaceTaskAssignees(
  taskId: number,
  ids: number[],
  assignedBy: number,
) {
  await db.prepare("DELETE FROM task_assignees WHERE task_id=?").run(taskId);
  const insert = db.prepare(
    "INSERT INTO task_assignees(task_id,user_id,assigned_by) VALUES(?,?,?)",
  );
  for (const id of ids) await insert.run(taskId, id, assignedBy);
  await db.prepare("UPDATE tasks SET assignee_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(
    ids[0] ?? null,
    taskId,
  );
}
