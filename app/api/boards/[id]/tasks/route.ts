import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import db from "@/lib/db";
import { boardPermission,canEdit } from "@/lib/boards";
import { notifyTaskCreated } from "@/lib/task-notifications";
import { recordBoardActivity } from "@/lib/activity";

const statuses=["ideas","ready","progress","hold","done"];
const priorities=["Low","Medium","High"];
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await currentUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const boardId=Number((await params).id);if(!canEdit(boardPermission(user,boardId)))return NextResponse.json({error:"Forbidden"},{status:403});
  const{title,status="ideas",priority="Medium",tag="General",dueDate=null,assigneeId=null,description=""}=await request.json();
  const cleanTitle=String(title||"").trim(),cleanDescription=String(description||"").trim(),cleanTag=String(tag||"General").trim();
  if(!cleanTitle)return NextResponse.json({error:"Task title is required"},{status:400});
  if(cleanTitle.length>200||cleanDescription.length>5000||cleanTag.length>50||!statuses.includes(status)||!priorities.includes(priority))return NextResponse.json({error:"Invalid task details"},{status:400});
  if(assigneeId){const allowed=db.prepare("SELECT 1 FROM users u JOIN boards b ON b.id=? LEFT JOIN board_members bm ON bm.board_id=b.id AND bm.user_id=u.id WHERE u.id=? AND u.status='Active' AND (u.id=b.owner_id OR bm.user_id IS NOT NULL)").get(boardId,Number(assigneeId));if(!allowed)return NextResponse.json({error:"Assignee does not have access to this board"},{status:400});}
  const result=db.prepare("INSERT INTO tasks(board_id,title,description,status,priority,tag,due_date,assignee_id,created_by) VALUES(?,?,?,?,?,?,?,?,?)").run(boardId,cleanTitle,cleanDescription,status,priority,cleanTag,dueDate||null,assigneeId||null,user.id);
  db.prepare("UPDATE boards SET updated_at=CURRENT_TIMESTAMP WHERE id=?").run(boardId);db.prepare("INSERT INTO audit_log(actor_id,action,target) VALUES(?,?,?)").run(user.id,"TASK.CREATE",String(result.lastInsertRowid));
  recordBoardActivity(boardId,user.id,"TASK.CREATE",`Created ${cleanTitle}`);
  notifyTaskCreated({id:Number(result.lastInsertRowid),boardId,title:cleanTitle,status,assigneeId:assigneeId?Number(assigneeId):null,dueDate:dueDate||null},user.id);
  return NextResponse.json({id:Number(result.lastInsertRowid)},{status:201});
}
