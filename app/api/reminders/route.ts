import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { boardPermission, canEdit } from "@/lib/boards";
import { discordConfigured, listDiscordChannels } from "@/lib/discord";
import db from "@/lib/db";

export async function GET() {
  const user=await currentUser(); if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const reminders=db.prepare(`SELECT r.id,r.board_id boardId,r.task_id taskId,r.channel_id channelId,r.channel_name channelName,
    r.message,r.remind_at remindAt,r.status,r.error,b.name boardName,t.title taskTitle
    FROM reminders r JOIN boards b ON b.id=r.board_id LEFT JOIN tasks t ON t.id=r.task_id
    LEFT JOIN board_members bm ON bm.board_id=b.id AND bm.user_id=?
    WHERE b.owner_id=? OR ?='Admin' OR bm.user_id=? ORDER BY r.remind_at DESC LIMIT 100`).all(user.id,user.id,user.role,user.id);
  return NextResponse.json({reminders});
}

export async function POST(request:Request) {
  const user=await currentUser(); if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const {boardId,taskId=null,channelId,message,remindAt}=await request.json();
  if(!canEdit(boardPermission(user,Number(boardId))))return NextResponse.json({error:"Forbidden"},{status:403});
  if(!discordConfigured())return NextResponse.json({error:"Discord bot is not configured"},{status:409});
  const when=new Date(remindAt); if(!channelId||!String(message||"").trim()||String(message).length>1800||Number.isNaN(when.valueOf())||when<=new Date())return NextResponse.json({error:"Choose a channel, future time, and message under 1,800 characters"},{status:400});
  const channels=await listDiscordChannels(); const channel=channels.find(item=>item.id===String(channelId));
  if(!channel)return NextResponse.json({error:"Channel is not available to the bot"},{status:400});
  if(taskId){const task=db.prepare("SELECT id FROM tasks WHERE id=? AND board_id=?").get(Number(taskId),Number(boardId));if(!task)return NextResponse.json({error:"Task not found on this board"},{status:400});}
  const result=db.prepare("INSERT INTO reminders(board_id,task_id,created_by,channel_id,channel_name,message,remind_at) VALUES(?,?,?,?,?,?,?)")
    .run(Number(boardId),taskId?Number(taskId):null,user.id,channel.id,channel.name,String(message).trim(),when.toISOString());
  db.prepare("INSERT INTO audit_log(actor_id,action,target) VALUES(?,?,?)").run(user.id,"REMINDER.CREATE",String(result.lastInsertRowid));
  return NextResponse.json({id:Number(result.lastInsertRowid)},{status:201});
}
