import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { boardPermission, canEdit } from "@/lib/boards";
import { discordConfigured } from "@/lib/discord";
import db from "@/lib/db";

export async function POST(_:Request,{params}:{params:Promise<{id:string}>}) {
  const user=await currentUser(); if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const id=Number((await params).id); const reminder=await db.prepare("SELECT board_id boardId,status FROM reminders WHERE id=?").get(id) as {boardId:number;status:string}|undefined;
  if(!reminder)return NextResponse.json({error:"Not found"},{status:404});
  if(!canEdit(await boardPermission(user,reminder.boardId)))return NextResponse.json({error:"Forbidden"},{status:403});
  if(reminder.status!=="failed")return NextResponse.json({error:"Only failed reminders can be retried"},{status:409});
  if(!discordConfigured())return NextResponse.json({error:"Discord bot is not configured"},{status:409});
  await db.prepare("UPDATE reminders SET status='pending',remind_at=CURRENT_TIMESTAMP,error=NULL,sent_at=NULL WHERE id=?").run(id);
  await db.prepare("INSERT INTO audit_log(actor_id,action,target) VALUES(?,?,?)").run(user.id,"REMINDER.RETRY",String(id));
  return NextResponse.json({ok:true});
}
