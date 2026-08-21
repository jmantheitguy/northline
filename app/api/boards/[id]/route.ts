import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import db from "@/lib/db";
import { boardPermission, canEdit, canShare } from "@/lib/boards";
import { workspacePermission, canCreateBoards } from "@/lib/workspaces";
import { taskAssigneeIds } from "@/lib/task-assignments";

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id),
    permission = await boardPermission(user, id);
  if (!permission)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const board = await db
    .prepare(
      "SELECT id,public_id AS \"boardKey\",name,description,owner_id AS \"ownerId\",created_by AS \"createdBy\",workspace_id AS \"workspaceId\" FROM boards WHERE id=?",
    )
    .get(id) as { id: number; workspaceId: number };
  const taskRows = await db
    .prepare(
      `SELECT t.id,t.title,t.description,t.status,t.priority,t.tag,t.due_date AS "due",u.id AS "ownerId",u.name AS "ownerName",u.avatar AS "ownerAvatar",
  (SELECT COUNT(*) FROM comments c WHERE c.task_id=t.id) AS "comments" FROM tasks t LEFT JOIN users u ON u.id=t.assignee_id WHERE t.board_id=? AND t.archived_at IS NULL ORDER BY t.created_at`,
    )
    .all(id) as Array<Record<string, unknown> & { id: number }>;
  const tasks = await Promise.all(taskRows.map(async (task) => ({
    ...task,
    assigneeIds: await taskAssigneeIds(task.id),
    assignees: await db.prepare(
      "SELECT u.id,u.name,u.avatar FROM task_assignees ta JOIN users u ON u.id=ta.user_id WHERE ta.task_id=? ORDER BY ta.created_at, u.name COLLATE NOCASE",
    ).all(task.id),
  })));
  const members = await db
    .prepare(
      "SELECT u.id,u.name,u.email,u.avatar,bm.permission FROM board_members bm JOIN users u ON u.id=bm.user_id WHERE bm.board_id=? ORDER BY u.name",
    )
    .all(id);
  const workspaceMembers = await db
    .prepare(
      "SELECT u.id,u.name,u.email,u.avatar,CASE WHEN w.owner_id=u.id THEN 'owner' ELSE wm.permission END permission FROM workspaces w JOIN users u ON u.id=w.owner_id LEFT JOIN workspace_members wm ON wm.workspace_id=w.id WHERE w.id=? UNION SELECT u.id,u.name,u.email,u.avatar,wm.permission FROM workspace_members wm JOIN users u ON u.id=wm.user_id WHERE wm.workspace_id=? ORDER BY name",
    )
    .all(board.workspaceId, board.workspaceId);
  const assignees = await db
    .prepare(
      `SELECT u.id,u.name,u.email,u.avatar FROM users u JOIN boards b ON b.id=? JOIN workspaces w ON w.id=b.workspace_id LEFT JOIN board_members bm ON bm.board_id=b.id AND bm.user_id=u.id LEFT JOIN workspace_members wm ON wm.workspace_id=w.id AND wm.user_id=u.id WHERE u.status='Active' AND (u.id=b.owner_id OR u.id=w.owner_id OR bm.user_id IS NOT NULL OR wm.user_id IS NOT NULL) ORDER BY u.name COLLATE NOCASE`,
    )
    .all(id);
  const columns = await db
    .prepare(
      "SELECT id,column_key AS \"key\",name,color,position,is_done AS \"isDone\" FROM board_columns WHERE board_id=? ORDER BY position",
    )
    .all(id);
  const notifications = await db
    .prepare(
      "SELECT channel_id AS \"channelId\",channel_name AS \"channelName\",assignment_enabled AS \"assignmentEnabled\",status_enabled AS \"statusEnabled\",comment_enabled AS \"commentEnabled\",mention_enabled AS \"mentionEnabled\",due_enabled AS \"dueEnabled\",due_warning_hours AS \"dueWarningHours\" FROM board_notification_settings WHERE board_id=?",
    )
    .get(id) || {
    channelId: "",
    channelName: "",
    assignmentEnabled: 1,
    statusEnabled: 1,
    commentEnabled: 1,
    mentionEnabled: 1,
    dueEnabled: 1,
    dueWarningHours: 24,
  };
  return NextResponse.json({
    board,
    tasks,
    members,
    workspaceMembers,
    assignees,
    columns,
    notifications,
    permission,
    canEdit: canEdit(permission),
    canShare: canShare(permission),
  });
}
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!canShare(await boardPermission(user, id)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { name, description, workspaceId } = await request.json();
  let targetWorkspace: null | number = null;
  if (workspaceId !== undefined) {
    targetWorkspace = Number(workspaceId);
    if (!canCreateBoards(await workspacePermission(user, targetWorkspace)))
      return NextResponse.json(
        { error: "You cannot move boards into that workspace" },
        { status: 403 },
      );
  }
  await db.prepare(
    "UPDATE boards SET name=COALESCE(?,name),description=COALESCE(?,description),workspace_id=COALESCE(?,workspace_id),updated_at=CURRENT_TIMESTAMP WHERE id=?",
  ).run(name?.trim() || null, description ?? null, targetWorkspace, id);
  return NextResponse.json({ ok: true });
}
export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id),
    permission = await boardPermission(user, id);
  if (permission !== "owner")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await db.prepare("DELETE FROM boards WHERE id=?").run(id);
  return NextResponse.json({ ok: true });
}
