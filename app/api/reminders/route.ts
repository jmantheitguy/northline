import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { boardPermission, canEdit } from "@/lib/boards";
import { discordConfigured } from "@/lib/discord";
import { taskAssigneeIds } from "@/lib/task-assignments";
import db from "@/lib/db";

export async function GET() {
  const user=await currentUser(); if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const reminders=await db.prepare(`SELECT DISTINCT r.id,r.board_id boardId,r.task_id taskId,r.channel_id channelId,r.channel_name channelName,
    r.message,r.remind_at remindAt,r.status,r.error,r.created_at createdAt,r.sent_at sentAt,r.kind,r.event_type eventType,b.name boardName,t.title taskTitle,
    CASE WHEN b.owner_id=? OR w.owner_id=? OR bm.permission='editor' OR wm.permission='editor' OR team.owner_id=? OR (tw.permission='editor' AND tm.role IN ('owner','manager')) THEN 1 ELSE 0 END canManage
    FROM reminders r JOIN boards b ON b.id=r.board_id JOIN workspaces w ON w.id=b.workspace_id LEFT JOIN tasks t ON t.id=r.task_id
    LEFT JOIN board_members bm ON bm.board_id=b.id AND bm.user_id=? LEFT JOIN workspace_members wm ON wm.workspace_id=w.id AND wm.user_id=?
    LEFT JOIN team_workspaces tw ON tw.workspace_id=w.id
    LEFT JOIN teams team ON team.id=tw.team_id
    LEFT JOIN team_members tm ON tm.team_id=team.id AND tm.user_id=?
    WHERE (b.owner_id=? OR w.owner_id=? OR bm.user_id=? OR wm.user_id=? OR team.owner_id=? OR tm.user_id IS NOT NULL) AND (r.created_by=? OR r.recipient_user_id=?) ORDER BY r.remind_at DESC LIMIT 100`).all(user.id,user.id,user.id,user.id,user.id,user.id,user.id,user.id,user.id,user.id,user.id,user.id,user.id) as Array<Record<string,unknown>>;
  const archived=await db.prepare(`SELECT -d.id id,d.board_id_snapshot boardId,NULL taskId,d.channel_id channelId,d.channel_name channelName,d.message,d.created_at remindAt,d.status,d.error,d.created_at createdAt,d.delivered_at sentAt,d.kind,d.event_type eventType,d.board_name boardName,d.task_title taskTitle,0 canManage FROM notification_deliveries d WHERE NOT EXISTS(SELECT 1 FROM reminders r WHERE r.id=d.reminder_id) AND d.created_by=? ORDER BY d.id DESC LIMIT 100`).all(user.id);
  return NextResponse.json({reminders:[...reminders,...archived as Array<Record<string,unknown>>].sort((a,b)=>String(b.remindAt).localeCompare(String(a.remindAt))).slice(0,100)});
}

export async function POST(request:Request) {
  const user=await currentUser(); if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const {boardId,taskId=null,message,remindAt}=await request.json();
  if(!canEdit(await boardPermission(user,Number(boardId))))return NextResponse.json({error:"Forbidden"},{status:403});
  if(!discordConfigured())return NextResponse.json({error:"Discord bot is not configured"},{status:409});
  const when=new Date(remindAt); if(!String(message||"").trim()||String(message).length>1800||Number.isNaN(when.valueOf())||when<=new Date())return NextResponse.json({error:"Choose a future time and message under 1,800 characters"},{status:400});
  const task=taskId?await db.prepare("SELECT id,created_by createdBy FROM tasks WHERE id=? AND board_id=?").get(Number(taskId),Number(boardId)) as {id:number;createdBy:number}|undefined:undefined;
  if(taskId&&!task)return NextResponse.json({error:"Task not found on this board"},{status:400});
  if(task){
    const assigneeIds=await taskAssigneeIds(task.id);
    const recipientIds=[...new Set((assigneeIds.length?assigneeIds:[task.createdBy]).map(Number))];
    const recipients=await db.prepare(`SELECT id,discord_user_id discordUserId FROM users WHERE id IN (${recipientIds.map(()=>"?").join(",")})`).all(...recipientIds) as Array<{id:number;discordUserId:string|null}>;
    const recipientById=new Map(recipients.map((recipient)=>[Number(recipient.id),recipient]));
    const missing=recipientIds.filter((id)=>!recipientById.get(id)?.discordUserId);
    if(missing.length){
      const subject=assigneeIds.length?"Every task assignee must link Discord":"The task creator has not linked Discord";
      return NextResponse.json({error:subject},{status:409});
    }
    const ids=await db.transaction(async()=>{
      const insert=db.prepare("INSERT INTO reminders(board_id,task_id,created_by,recipient_user_id,channel_id,channel_name,message,remind_at) VALUES(?,?,?,?,?,?,?,?)");
      const created:number[]=[];
      for(const recipientId of recipientIds){
        const result=await insert.run(Number(boardId),Number(taskId),user.id,recipientId,"dm","Direct message",String(message).trim(),when.toISOString());
        created.push(Number(result.lastInsertRowid));
      }
      return created;
    });
    await db.prepare("INSERT INTO audit_log(actor_id,action,target,detail) VALUES(?,?,?,?)").run(user.id,"REMINDER.CREATE",String(ids[0]||task.id),`Scheduled private task reminder for ${recipientIds.length} recipient${recipientIds.length===1?"":"s"}`);
    return NextResponse.json({ids,recipients:ids.length},{status:201});
  }
  const recipients=await db.prepare(`SELECT DISTINCT u.id FROM users u JOIN boards b ON b.id=? JOIN workspaces w ON w.id=b.workspace_id
    LEFT JOIN board_members bm ON bm.board_id=b.id AND bm.user_id=u.id
    LEFT JOIN workspace_members wm ON wm.workspace_id=w.id AND wm.user_id=u.id
    LEFT JOIN team_workspaces tw ON tw.workspace_id=w.id
    LEFT JOIN teams team ON team.id=tw.team_id
    LEFT JOIN team_members tm ON tm.team_id=team.id AND tm.user_id=u.id
    WHERE u.status='Active' AND (u.id=b.owner_id OR u.id=w.owner_id OR bm.user_id IS NOT NULL OR wm.user_id IS NOT NULL OR team.owner_id=u.id OR tm.user_id IS NOT NULL)`).all(Number(boardId)) as Array<{id:number}>;
  const ids=await db.transaction(async()=>{
    const insert=db.prepare("INSERT INTO reminders(board_id,task_id,created_by,recipient_user_id,channel_id,channel_name,message,remind_at) VALUES(?,NULL,?,?,?,?,?,?)");
    const created:number[]=[];
    for(const recipient of recipients){const result=await insert.run(Number(boardId),user.id,recipient.id,"dm","Direct message",String(message).trim(),when.toISOString());created.push(Number(result.lastInsertRowid));}
    return created;
  });
  await db.prepare("INSERT INTO audit_log(actor_id,action,target,detail) VALUES(?,?,?,?)").run(user.id,"REMINDER.CREATE",String(ids[0]||"board"),`Scheduled board-wide reminder for ${ids.length} members`);
  return NextResponse.json({ids,recipients:ids.length},{status:201});
}
