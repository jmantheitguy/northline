import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { boardPermission, canEdit } from "@/lib/boards";
import db from "@/lib/db";

export async function DELETE(_:Request,{params}:{params:Promise<{id:string}>}) {
  const user=await currentUser(); if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const id=Number((await params).id); const reminder=db.prepare("SELECT board_id boardId,status FROM reminders WHERE id=?").get(id) as {boardId:number;status:string}|undefined;
  if(!reminder)return NextResponse.json({error:"Not found"},{status:404});
  if(!canEdit(boardPermission(user,reminder.boardId)))return NextResponse.json({error:"Forbidden"},{status:403});
  if(reminder.status==="sent")return NextResponse.json({error:"Sent reminders cannot be cancelled"},{status:409});
  db.prepare("UPDATE reminders SET status='cancelled' WHERE id=?").run(id); return NextResponse.json({ok:true});
}
