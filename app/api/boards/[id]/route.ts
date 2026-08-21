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
      `SELECT b.id,b.public_id AS "boardKey",b.name,b.description,b.owner_id AS "ownerId",b.created_by AS "createdBy",b.workspace_id AS "workspaceId",
        u.name AS "ownerName",u.email AS "ownerEmail",u.avatar AS "ownerAvatar",w.kind AS "workspaceKind"
       FROM boards b JOIN users u ON u.id=b.owner_id JOIN workspaces w ON w.id=b.workspace_id WHERE b.id=?`,
    )
    .get(id) as {
      id: number;
      boardKey: string;
      name: string;
      description: string;
      ownerId: number;
      createdBy: number;
      workspaceId: number;
      ownerName: string;
      ownerEmail: string;
      ownerAvatar: string | null;
      workspaceKind: "personal" | "shared";
    };
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
      `SELECT DISTINCT u.id,u.name,u.avatar
       FROM users u
       WHERE u.id IN (
         SELECT ta.user_id FROM task_assignees ta WHERE ta.task_id=?
         UNION
         SELECT t.assignee_id FROM tasks t WHERE t.id=? AND t.assignee_id IS NOT NULL
       )
       ORDER BY u.name COLLATE NOCASE, u.id`,
    ).all(task.id, task.id),
  })));
  const members = await db
    .prepare(
      "SELECT u.id,u.name,u.email,u.avatar,bm.permission FROM board_members bm JOIN users u ON u.id=bm.user_id WHERE bm.board_id=? ORDER BY u.name",
    )
    .all(id);
  const sharedWith = new Map<number, {
    id: number;
    name: string;
    email: string;
    avatar: string | null;
    permission: "owner" | "viewer" | "editor";
    source: string;
  }>();
  sharedWith.set(board.ownerId, {
    id: board.ownerId,
    name: board.ownerName,
    email: board.ownerEmail,
    avatar: board.ownerAvatar,
    permission: "owner",
    source: "board owner",
  });
  type AccessRow = { id: number; name: string; email: string; avatar: string | null; permission?: string };
  const addAccess = (row: AccessRow, source: string) => {
    if (!row?.id || Number(row.id) === board.ownerId) return;
    const nextPermission = row.permission === "editor" ? "editor" : "viewer";
    const current = sharedWith.get(Number(row.id));
    const rank = (value: string) => value === "editor" ? 2 : value === "viewer" ? 1 : 0;
    if (!current || rank(nextPermission) > rank(current.permission))
      sharedWith.set(Number(row.id), { ...row, id: Number(row.id), permission: nextPermission, source });
  };
  for (const row of members as AccessRow[]) addAccess(row, "direct board share");
  if (board.workspaceKind === "shared") {
    const inherited = await db.prepare(`
      SELECT DISTINCT u.id,u.name,u.email,u.avatar,access.permission FROM users u
      JOIN (
        SELECT w.owner_id user_id,'editor' permission FROM workspaces w WHERE w.id=?
        UNION ALL SELECT wm.user_id,wm.permission FROM workspace_members wm WHERE wm.workspace_id=?
        UNION ALL SELECT tm.user_id,tw.permission FROM team_workspaces tw JOIN team_members tm ON tm.team_id=tw.team_id WHERE tw.workspace_id=?
        UNION ALL SELECT t.owner_id,tw.permission FROM team_workspaces tw JOIN teams t ON t.id=tw.team_id WHERE tw.workspace_id=?
      ) access ON access.user_id=u.id
      WHERE u.status='Active'
      ORDER BY u.name,u.id`).all(board.workspaceId, board.workspaceId, board.workspaceId, board.workspaceId) as AccessRow[];
    for (const row of inherited) addAccess(row, "shared workspace");
  }
  const workspaceMembers = await db
    .prepare(
      `SELECT DISTINCT u.id,u.name,u.email,u.avatar,CASE WHEN w.owner_id=u.id THEN 'owner' ELSE COALESCE(wm.permission,tw.permission,'viewer') END permission
       FROM workspaces w JOIN users u ON u.id=w.owner_id
       LEFT JOIN workspace_members wm ON wm.workspace_id=w.id AND wm.user_id=u.id
       LEFT JOIN team_workspaces tw ON tw.workspace_id=w.id
       LEFT JOIN teams team ON team.id=tw.team_id
       LEFT JOIN team_members tm ON tm.team_id=tw.team_id AND tm.user_id=u.id
       WHERE w.id=?
       UNION
       SELECT DISTINCT u.id,u.name,u.email,u.avatar,COALESCE(wm.permission,tw.permission,'viewer') permission
       FROM users u
       LEFT JOIN workspace_members wm ON wm.workspace_id=? AND wm.user_id=u.id
       LEFT JOIN team_workspaces tw ON tw.workspace_id=?
       LEFT JOIN teams team ON team.id=tw.team_id
       LEFT JOIN team_members tm ON tm.team_id=tw.team_id AND tm.user_id=u.id
       WHERE wm.user_id IS NOT NULL OR tm.user_id IS NOT NULL ORDER BY name`,
    )
    .all(board.workspaceId, board.workspaceId, board.workspaceId);
  const assignees = await db
    .prepare(
      `SELECT id,name,email,avatar
       FROM (
         SELECT DISTINCT u.id,u.name,u.email,u.avatar
         FROM users u
         JOIN boards b ON b.id=?
         JOIN workspaces w ON w.id=b.workspace_id
         LEFT JOIN board_members bm ON bm.board_id=b.id AND bm.user_id=u.id
         LEFT JOIN workspace_members wm ON wm.workspace_id=w.id AND wm.user_id=u.id
         LEFT JOIN team_workspaces tw ON tw.workspace_id=w.id
         LEFT JOIN teams team ON team.id=tw.team_id
         LEFT JOIN team_members tm ON tm.team_id=tw.team_id AND tm.user_id=u.id
         WHERE u.status='Active'
           AND (u.id=b.owner_id OR u.id=w.owner_id OR bm.user_id IS NOT NULL OR wm.user_id IS NOT NULL OR team.owner_id=u.id OR tm.user_id IS NOT NULL)
       ) AS assignee_candidates
       ORDER BY LOWER(name),id`,
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
    boardOwner: sharedWith.get(board.ownerId),
    sharedWith: [...sharedWith.values()].sort((a, b) => a.name.localeCompare(b.name)),
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
  if (!Number.isInteger(id) || id <= 0)
    return NextResponse.json({ error: "Invalid board" }, { status: 400 });
  const permission = await boardPermission(user, id);
  if (!canShare(permission))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const currentBoard = await db
    .prepare(
      `SELECT b.id,b.public_id AS "boardKey",b.name,b.owner_id AS "ownerId",b.workspace_id AS "workspaceId",
        w.name AS "workspaceName",w.owner_id AS "workspaceOwnerId",w.kind AS "workspaceKind"
       FROM boards b JOIN workspaces w ON w.id=b.workspace_id WHERE b.id=?`,
    )
    .get(id) as
    | {
        id: number;
        boardKey: string;
        name: string;
        ownerId: number;
        workspaceId: number;
        workspaceName: string;
        workspaceOwnerId: number;
        workspaceKind: "personal" | "shared";
      }
    | undefined;
  if (!currentBoard)
    return NextResponse.json({ error: "Board not found" }, { status: 404 });
  const body = await request.json();
  if (body.id !== undefined || body.boardId !== undefined || body.boardKey !== undefined || body.publicId !== undefined)
    return NextResponse.json({ error: "Board IDs are permanent and cannot be changed" }, { status: 400 });
  const { name, description, workspaceId } = body;
  const hasWorkspaceChange = workspaceId !== undefined;
  let targetWorkspace: number | undefined;
  let targetWorkspaceName = currentBoard.workspaceName;
  if (hasWorkspaceChange) {
    targetWorkspace = Number(workspaceId);
    if (!Number.isInteger(targetWorkspace) || targetWorkspace <= 0)
      return NextResponse.json({ error: "Invalid destination workspace" }, { status: 400 });
    const destination = await db
      .prepare("SELECT id,name,kind FROM workspaces WHERE id=?")
      .get(targetWorkspace) as { id: number; name: string; kind: "personal" | "shared" } | undefined;
    if (!destination)
      return NextResponse.json({ error: "Destination workspace not found" }, { status: 404 });
    if (!canCreateBoards(await workspacePermission(user, targetWorkspace)))
      return NextResponse.json(
        { error: "You cannot move boards into that workspace" },
        { status: 403 },
      );
    targetWorkspaceName = destination.name;
  }
  await db.transaction(async () => {
    // Direct board shares are untouched. When leaving a shared workspace,
    // materialize each inherited member as an explicit board share so their
    // effective permission survives the move (including editor access).
    if (hasWorkspaceChange && targetWorkspace !== currentBoard.workspaceId) {
      const inherited = await db
        .prepare(
          `SELECT user_id AS "userId",permission FROM workspace_members WHERE workspace_id=?
           UNION ALL
           SELECT owner_id AS "userId", 'editor' AS permission FROM workspaces WHERE id=?
           UNION ALL
           SELECT tm.user_id AS "userId",tw.permission FROM team_workspaces tw JOIN team_members tm ON tm.team_id=tw.team_id WHERE tw.workspace_id=?
           UNION ALL
           SELECT t.owner_id AS "userId",tw.permission FROM team_workspaces tw JOIN teams t ON t.id=tw.team_id WHERE tw.workspace_id=?`,
        )
        .all(currentBoard.workspaceId, currentBoard.workspaceId, currentBoard.workspaceId, currentBoard.workspaceId) as Array<{
        userId: number;
        permission: "viewer" | "editor";
      }>;
      for (const member of inherited) {
        if (member.userId === currentBoard.ownerId) continue;
        await db
          .prepare(
            `INSERT INTO board_members(board_id,user_id,permission) VALUES(?,?,?)
             ON CONFLICT(board_id,user_id) DO UPDATE SET permission=
             CASE WHEN board_members.permission='editor' OR excluded.permission='editor' THEN 'editor' ELSE 'viewer' END`,
          )
          .run(id, member.userId, member.permission);
      }
    }
    await db
      .prepare(
        `UPDATE boards SET name=COALESCE(?,name),description=COALESCE(?,description),
          workspace_id=COALESCE(?,workspace_id),updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      )
      .run(name?.trim() || null, description ?? null, targetWorkspace ?? null, id);
    if (hasWorkspaceChange && targetWorkspace !== currentBoard.workspaceId) {
      await db
        .prepare("INSERT INTO audit_log(actor_id,action,target,detail) VALUES(?,?,?,?)")
        .run(
          user.id,
          "BOARD.MOVE",
          currentBoard.boardKey,
          `Moved board “${name?.trim() || currentBoard.name}” from “${currentBoard.workspaceName}” to “${targetWorkspaceName}”; direct shares preserved and inherited access retained`,
        );
    }
  });
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
