import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { boardPermission,canShare } from "@/lib/boards";
import db from "@/lib/db";

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await currentUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const boardId=Number((await params).id);if(!canShare(await boardPermission(user,boardId)))return NextResponse.json({error:"Forbidden"},{status:403});
  const body=await request.json();
  const flag=(value:unknown)=>value?1:0;const hours=Math.min(168,Math.max(1,Number(body.dueWarningHours)||24));
  await db.prepare(`INSERT INTO board_notification_settings(board_id,channel_id,channel_name,assignment_enabled,status_enabled,comment_enabled,mention_enabled,due_enabled,due_warning_hours)
    VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(board_id) DO UPDATE SET channel_id=excluded.channel_id,channel_name=excluded.channel_name,assignment_enabled=excluded.assignment_enabled,status_enabled=excluded.status_enabled,comment_enabled=excluded.comment_enabled,mention_enabled=excluded.mention_enabled,due_enabled=excluded.due_enabled,due_warning_hours=excluded.due_warning_hours,updated_at=CURRENT_TIMESTAMP`)
    .run(boardId,"dm","Direct message",flag(body.assignmentEnabled),flag(body.statusEnabled),flag(body.commentEnabled),flag(body.mentionEnabled),flag(body.dueEnabled),hours);
  await db.prepare("INSERT INTO audit_log(actor_id,action,target) VALUES(?,?,?)").run(user.id,"BOARD.NOTIFICATIONS.UPDATE",String(boardId));
  return NextResponse.json({ok:true});
}
