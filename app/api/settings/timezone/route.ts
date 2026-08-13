import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import db from "@/lib/db";
import { validTimezone } from "@/lib/timezones";
import { scheduleDueNotification } from "@/lib/task-notifications";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ timezone: user.timezone });
}

export async function PATCH(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const timezone = validTimezone((await request.json()).timezone);
  if (!timezone)
    return NextResponse.json({ error: "Invalid time zone" }, { status: 400 });
  db.prepare("UPDATE users SET timezone=? WHERE id=?").run(timezone, user.id);
  const dueTasks=db.prepare(`SELECT t.id,t.board_id boardId,t.title,t.status,t.assignee_id assigneeId,t.due_date dueDate,t.created_by createdBy
    FROM tasks t WHERE t.created_by=? AND t.due_date IS NOT NULL AND t.archived_at IS NULL`).all(user.id) as Array<{id:number;boardId:number;title:string;status:string;assigneeId:number|null;dueDate:string;createdBy:number}>;
  for(const task of dueTasks)scheduleDueNotification(task,user.id);
  return NextResponse.json({ timezone });
}
