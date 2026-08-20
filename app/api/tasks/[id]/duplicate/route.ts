import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { boardPermission,canEdit } from "@/lib/boards";
import { recordBoardActivity } from "@/lib/activity";
import db from "@/lib/db";

export async function POST(_:Request,{params}:{params:Promise<{id:string}>}){
  const user=await currentUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});const id=Number((await params).id);
  const task=await db.prepare("SELECT * FROM tasks WHERE id=?").get(id) as Record<string,unknown>|undefined;if(!task)return NextResponse.json({error:"Not found"},{status:404});const boardId=Number(task.board_id);
  if(!canEdit(await boardPermission(user,boardId)))return NextResponse.json({error:"Forbidden"},{status:403});
  const result=await db.prepare("INSERT INTO tasks(board_id,title,description,status,priority,tag,due_date,assignee_id,created_by) VALUES(?,?,?,?,?,?,?,?,?)").run(boardId,`${task.title} (copy)`,task.description,task.status,task.priority,task.tag,task.due_date,task.assignee_id,user.id);
  await recordBoardActivity(boardId,user.id,"TASK.DUPLICATE",`Duplicated ${task.title}`);await db.prepare("UPDATE boards SET updated_at=CURRENT_TIMESTAMP WHERE id=?").run(boardId);
  return NextResponse.json({id:Number(result.lastInsertRowid)},{status:201});
}
