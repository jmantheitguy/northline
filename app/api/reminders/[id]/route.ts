import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { boardPermission, canEdit } from "@/lib/boards";
import { discordConfigured } from "@/lib/discord";
import db from "@/lib/db";

async function editableReminder(user:NonNullable<Awaited<ReturnType<typeof currentUser>>>,id:number) {
  const reminder=db.prepare("SELECT id,board_id boardId,status,kind FROM reminders WHERE id=?").get(id) as {id:number;boardId:number;status:string;kind:string}|undefined;
  if(!reminder)return {error:NextResponse.json({error:"Not found"},{status:404})};
  if(!canEdit(boardPermission(user,reminder.boardId)))return {error:NextResponse.json({error:"Forbidden"},{status:403})};
  return {reminder};
}

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}) {
  const user=await currentUser(); if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const id=Number((await params).id); const found=await editableReminder(user,id); if(found.error)return found.error; const reminder=found.reminder!;
  if(reminder.status!=="pending")return NextResponse.json({error:"Only pending reminders can be edited"},{status:409});
  if(reminder.kind!=="scheduled")return NextResponse.json({error:"Automatic notifications cannot be edited"},{status:409});
  if(!discordConfigured())return NextResponse.json({error:"Discord bot is not configured"},{status:409});
  const {message,remindAt}=await request.json(); const when=new Date(remindAt);
  if(!String(message||"").trim()||String(message).length>1800||Number.isNaN(when.valueOf())||when<=new Date())return NextResponse.json({error:"Choose a future time and message under 1,800 characters"},{status:400});
  db.prepare("UPDATE reminders SET channel_id='dm',channel_name='Direct message',message=?,remind_at=?,error=NULL WHERE id=?").run(String(message).trim(),when.toISOString(),id);
  db.prepare("INSERT INTO audit_log(actor_id,action,target) VALUES(?,?,?)").run(user.id,"REMINDER.UPDATE",String(id));
  return NextResponse.json({ok:true});
}

export async function DELETE(_:Request,{params}:{params:Promise<{id:string}>}) {
  const user=await currentUser(); if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const id=Number((await params).id); const found=await editableReminder(user,id); if(found.error)return found.error; const reminder=found.reminder!;
  if(reminder.status==="sent")return NextResponse.json({error:"Sent reminders cannot be cancelled"},{status:409});
  db.prepare("UPDATE reminders SET status='cancelled',error=NULL WHERE id=?").run(id);
  db.prepare("INSERT INTO audit_log(actor_id,action,target) VALUES(?,?,?)").run(user.id,"REMINDER.CANCEL",String(id));
  return NextResponse.json({ok:true});
}
