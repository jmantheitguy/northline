import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { boardPermission, canEdit } from "@/lib/boards";
import { discordConfigured } from "@/lib/discord";
import db from "@/lib/db";

export async function GET() {
  const user=await currentUser(); if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const reminders=db.prepare(`SELECT r.id,r.board_id boardId,r.task_id taskId,r.channel_id channelId,r.channel_name channelName,
    r.message,r.remind_at remindAt,r.status,r.error,r.created_at createdAt,r.sent_at sentAt,r.kind,r.event_type eventType,b.name boardName,t.title taskTitle,
    CASE WHEN b.owner_id=? OR w.owner_id=? OR bm.permission='editor' OR wm.permission='editor' THEN 1 ELSE 0 END canManage
    FROM reminders r JOIN boards b ON b.id=r.board_id JOIN workspaces w ON w.id=b.workspace_id LEFT JOIN tasks t ON t.id=r.task_id
    LEFT JOIN board_members bm ON bm.board_id=b.id AND bm.user_id=? LEFT JOIN workspace_members wm ON wm.workspace_id=w.id AND wm.user_id=?
    WHERE (b.owner_id=? OR w.owner_id=? OR bm.user_id=? OR wm.user_id=?) AND (r.created_by=? OR r.recipient_user_id=?) ORDER BY r.remind_at DESC LIMIT 100`).all(user.id,user.id,user.id,user.id,user.id,user.id,user.id,user.id,user.id,user.id) as Array<Record<string,unknown>>;
  const archived=db.prepare(`SELECT -d.id id,d.board_id_snapshot boardId,NULL taskId,d.channel_id channelId,d.channel_name channelName,d.message,d.created_at remindAt,d.status,d.error,d.created_at createdAt,d.delivered_at sentAt,d.kind,d.event_type eventType,d.board_name boardName,d.task_title taskTitle,0 canManage FROM notification_deliveries d WHERE NOT EXISTS(SELECT 1 FROM reminders r WHERE r.id=d.reminder_id) AND d.created_by=? ORDER BY d.id DESC LIMIT 100`).all(user.id);
  return NextResponse.json({reminders:[...reminders,...archived as Array<Record<string,unknown>>].sort((a,b)=>String(b.remindAt).localeCompare(String(a.remindAt))).slice(0,100)});
}

export async function POST(request:Request) {
  const user=await currentUser(); if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const {boardId,taskId=null,message,remindAt}=await request.json();
  if(!canEdit(boardPermission(user,Number(boardId))))return NextResponse.json({error:"Forbidden"},{status:403});
  if(!discordConfigured())return NextResponse.json({error:"Discord bot is not configured"},{status:409});
  const when=new Date(remindAt); if(!String(message||"").trim()||String(message).length>1800||Number.isNaN(when.valueOf())||when<=new Date())return NextResponse.json({error:"Choose a future time and message under 1,800 characters"},{status:400});
  const task=taskId?db.prepare("SELECT id,created_by createdBy FROM tasks WHERE id=? AND board_id=?").get(Number(taskId),Number(boardId)) as {id:number;createdBy:number}|undefined:undefined;
  if(taskId&&!task)return NextResponse.json({error:"Task not found on this board"},{status:400});
  if(task){
    const recipient=db.prepare("SELECT discord_user_id discordUserId FROM users WHERE id=?").get(task.createdBy) as {discordUserId:string|null}|undefined;
    if(!recipient?.discordUserId)return NextResponse.json({error:"The task creator has not linked Discord"},{status:409});
    const result=db.prepare("INSERT INTO reminders(board_id,task_id,created_by,recipient_user_id,channel_id,channel_name,message,remind_at) VALUES(?,?,?,?,?,?,?,?)")
      .run(Number(boardId),Number(taskId),user.id,task.createdBy,"dm","Direct message",String(message).trim(),when.toISOString());
    db.prepare("INSERT INTO audit_log(actor_id,action,target,detail) VALUES(?,?,?,?)").run(user.id,"REMINDER.CREATE",String(result.lastInsertRowid),"Scheduled private task reminder");
    return NextResponse.json({id:Number(result.lastInsertRowid),recipients:1},{status:201});
  }
  const recipients=db.prepare(`SELECT DISTINCT u.id FROM users u JOIN boards b ON b.id=? JOIN workspaces w ON w.id=b.workspace_id
    LEFT JOIN board_members bm ON bm.board_id=b.id AND bm.user_id=u.id
    LEFT JOIN workspace_members wm ON wm.workspace_id=w.id AND wm.user_id=u.id
    WHERE u.status='Active' AND (u.id=b.owner_id OR u.id=w.owner_id OR bm.user_id IS NOT NULL OR wm.user_id IS NOT NULL)`).all(Number(boardId)) as Array<{id:number}>;
  const insert=db.prepare("INSERT INTO reminders(board_id,task_id,created_by,recipient_user_id,channel_id,channel_name,message,remind_at) VALUES(?,NULL,?,?,?,?,?,?)");
  const ids=db.transaction(()=>recipients.map(recipient=>Number(insert.run(Number(boardId),user.id,recipient.id,"dm","Direct message",String(message).trim(),when.toISOString()).lastInsertRowid)))();
  db.prepare("INSERT INTO audit_log(actor_id,action,target,detail) VALUES(?,?,?,?)").run(user.id,"REMINDER.CREATE",String(ids[0]||"board"),`Scheduled board-wide reminder for ${ids.length} members`);
  return NextResponse.json({ids,recipients:ids.length},{status:201});
}
