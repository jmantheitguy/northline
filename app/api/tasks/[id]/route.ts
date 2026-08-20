import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import db from "@/lib/db";
import { boardPermission, canEdit } from "@/lib/boards";
import { notifyTaskChanges } from "@/lib/task-notifications";
import { recordBoardActivity } from "@/lib/activity";
import { normalizeAssigneeIds, replaceTaskAssignees, taskAssigneeIds, validateAssigneeIds } from "@/lib/task-assignments";

const priorities = ["Low", "Medium", "High"];
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id),
    task = await db
      .prepare(
        "SELECT id,board_id boardId,title,status,assignee_id assigneeId,due_date dueDate,created_by createdBy FROM tasks WHERE id=?",
      )
      .get(id) as
      | {
          id: number;
          boardId: number;
          title: string;
          status: string;
          assigneeId: number | null;
          dueDate: string | null;
          createdBy: number;
        }
      | undefined;
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canEdit(await boardPermission(user, task.boardId)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json();
  const assignmentChanged = Object.prototype.hasOwnProperty.call(body, "assignee_ids") || Object.prototype.hasOwnProperty.call(body, "assigneeIds") || Object.prototype.hasOwnProperty.call(body, "assignee_id");
  const currentAssigneeIds = await taskAssigneeIds(id);
  const requestedAssigneeIds = assignmentChanged
    ? normalizeAssigneeIds(body.assignee_ids ?? body.assigneeIds, body.assignee_id)
    : currentAssigneeIds;
  if (body.archive !== undefined) {
    const column = await db
      .prepare(
        "SELECT is_done isDone FROM board_columns WHERE board_id=? AND column_key=?",
      )
      .get(task.boardId, task.status) as { isDone: number } | undefined;
    if (body.archive === true && column?.isDone !== 1)
      return NextResponse.json(
        { error: "Only completed tasks can be archived" },
        { status: 400 },
      );
    await db.prepare(
      "UPDATE tasks SET archived_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
    ).run(body.archive === true ? new Date().toISOString() : null, id);
    if (body.archive === true)
      await db.prepare(
        "UPDATE reminders SET status='cancelled',error='Task archived',updated_at=CURRENT_TIMESTAMP WHERE task_id=? AND status='pending'",
      ).run(id);
    await recordBoardActivity(
      task.boardId,
      user.id,
      body.archive === true ? "TASK.ARCHIVE" : "TASK.RESTORE",
      `${body.archive === true ? "Archived" : "Restored"} ${task.title}`,
    );
    await db.prepare("INSERT INTO audit_log(actor_id,action,target,detail) VALUES(?,?,?,?)").run(
      user.id,
      body.archive === true ? "TASK.ARCHIVE" : "TASK.RESTORE",
      String(id),
      `${body.archive === true ? "Archived" : "Restored"} task “${task.title}”`,
    );
    return NextResponse.json({ ok: true });
  }
  if (body.title !== undefined && !String(body.title).trim())
    return NextResponse.json(
      { error: "Task title is required" },
      { status: 400 },
    );
  const validStatus =
    body.status === undefined ||
    await db
      .prepare("SELECT 1 FROM board_columns WHERE board_id=? AND column_key=?")
      .get(task.boardId, String(body.status));
  if (
    (body.title && String(body.title).length > 200) ||
    (body.description && String(body.description).length > 5000) ||
    (body.tag && String(body.tag).length > 50) ||
    !validStatus ||
    (body.priority && !priorities.includes(body.priority))
  )
    return NextResponse.json(
      { error: "Invalid task details" },
      { status: 400 },
    );
  if (assignmentChanged) {
    try { await validateAssigneeIds(task.boardId, requestedAssigneeIds); }
    catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
  }
  const allowed = [
    "title",
    "description",
    "status",
    "priority",
    "tag",
    "due_date",
    "assignee_id",
  ] as const;
  const changedFields = allowed
    .filter((key) => Object.prototype.hasOwnProperty.call(body, key))
    .map((key) => key.replace("assignee_id", "assignee").replace("due_date", "due date").replaceAll("_", " "));
  await db.transaction(async () => {
    for (const key of allowed)
      if (Object.prototype.hasOwnProperty.call(body, key))
        await db.prepare(
          `UPDATE tasks SET ${key}=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
        ).run(key === "assignee_id" && assignmentChanged ? requestedAssigneeIds[0] ?? null : body[key], id);
    if (assignmentChanged) await replaceTaskAssignees(id, requestedAssigneeIds, user.id);
    await db.prepare("UPDATE boards SET updated_at=CURRENT_TIMESTAMP WHERE id=?").run(
      task.boardId,
    );
    await db.prepare(
      "INSERT INTO audit_log(actor_id,action,target,detail) VALUES(?,?,?,?)",
    ).run(user.id, "TASK.UPDATE", String(id), `Updated ${changedFields.join(", ") || "task details"} on “${task.title}”`);
    await recordBoardActivity(
      task.boardId,
      user.id,
      "TASK.UPDATE",
      `Updated ${task.title}`,
    );
  });
  const after = await db
    .prepare(
      "SELECT id,board_id boardId,title,status,assignee_id assigneeId,due_date dueDate,created_by createdBy FROM tasks WHERE id=?",
    )
    .get(id) as typeof task;
  const afterWithAssignees = { ...after!, assigneeIds: await taskAssigneeIds(id) };
  await notifyTaskChanges({ ...task, assigneeIds: currentAssigneeIds }, afterWithAssignees, user.id);
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
    task = await db.prepare("SELECT board_id,title FROM tasks WHERE id=?").get(id) as
      { board_id: number; title: string } | undefined;
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canEdit(await boardPermission(user, task.board_id)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await db.transaction(async () => {
    await recordBoardActivity(
      task.board_id,
      user.id,
      "TASK.DELETE",
      `Deleted ${task.title}`,
    );
    await db.prepare("DELETE FROM tasks WHERE id=?").run(id);
    await db.prepare(
      "INSERT INTO audit_log(actor_id,action,target,detail) VALUES(?,?,?,?)",
    ).run(user.id, "TASK.DELETE", String(id), `Deleted task “${task.title}”`);
  });
  return NextResponse.json({ ok: true });
}
