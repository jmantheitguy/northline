import "server-only";

import db from "./db";
import { DEFAULT_TIMEZONE, zonedDateTimeToUtc } from "./timezones";

type EventType="assignment"|"status"|"comment"|"mention"|"due";
type TaskContext={id:number;boardId:number;title:string;status?:string|null;assigneeId?:number|null;assigneeIds?:number[];dueDate?:string|null;createdBy?:number|null};

const eventColumn:Record<EventType,string>={assignment:"assignment_enabled",status:"status_enabled",comment:"comment_enabled",mention:"mention_enabled",due:"due_enabled"};
async function statusName(boardId:number,key:string|null|undefined){return (await db.prepare("SELECT name FROM board_columns WHERE board_id=? AND column_key=?").get(boardId,key||"") as {name:string}|undefined)?.name||key||"Unknown"}

async function settings(boardId:number){
  return await db.prepare(`SELECT * FROM board_notification_settings WHERE board_id=?`).get(boardId) as Record<string,unknown>|undefined;
}

async function taskLink(task:TaskContext){
  const base=(process.env.NORTHLINE_PUBLIC_URL||"https://northline.vtuberoffices.com").replace(/\/$/,"");
  const board=await db.prepare("SELECT public_id FROM boards WHERE id=?").get(task.boardId) as {public_id:string}|undefined;
  return `${base}/?board=${encodeURIComponent(board?.public_id||String(task.boardId))}&task=${task.id}`;
}

function assignees(task:TaskContext) {
  if (task.assigneeIds) return task.assigneeIds;
  return task.assigneeId ? [task.assigneeId] : [];
}

async function enqueue(task:TaskContext,actorId:number,event:EventType,message:string,dedupeKey:string,when=new Date(),recipientId=task.createdBy||actorId){
  const config=await settings(task.boardId); if(!config||config[eventColumn[event]]===0)return;
  const preference=await db.prepare(`SELECT ${eventColumn[event]} enabled FROM user_notification_settings WHERE user_id=?`).get(recipientId) as {enabled:number}|undefined;if(preference?.enabled===0)return;
  await db.prepare(`INSERT OR IGNORE INTO reminders(board_id,task_id,created_by,recipient_user_id,channel_id,channel_name,message,remind_at,kind,event_type,dedupe_key)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(task.boardId,task.id,actorId,recipientId,"dm","Direct message",`${message}\n${await taskLink(task)}`,when.toISOString(),"automatic",event,dedupeKey);
}

export async function notifyTaskCreated(task:TaskContext,actorId:number){
  for(const assigneeId of assignees(task)){const person=await db.prepare("SELECT name FROM users WHERE id=?").get(assigneeId) as {name:string}|undefined;await enqueue(task,actorId,"assignment",`👤 **${person?.name||"A teammate"}** was assigned to **${task.title}**.`,`assignment:${task.id}:${assigneeId}`,new Date(),assigneeId);}
  await scheduleDueNotification(task,actorId);
}

export async function notifyTaskChanges(before:TaskContext,after:TaskContext,actorId:number){
  const previous=new Set(assignees(before));
  const current=assignees(after);
  for(const assigneeId of current.filter((id)=>!previous.has(id))){const person=await db.prepare("SELECT name FROM users WHERE id=?").get(assigneeId) as {name:string}|undefined;await enqueue(after,actorId,"assignment",`👤 **${person?.name||"A teammate"}** was assigned to **${after.title}**.`,`assignment:${after.id}:${assigneeId}:${Date.now()}`,new Date(),assigneeId);}
  if(before.status!==after.status)await enqueue(after,actorId,"status",`🔄 **${after.title}** moved from **${await statusName(after.boardId,before.status)}** to **${await statusName(after.boardId,after.status)}**.`,`status:${after.id}:${after.status}:${Date.now()}`);
  if(before.dueDate!==after.dueDate||before.status!==after.status||previous.size!==current.length||current.some((id)=>!previous.has(id)))await scheduleDueNotification(after,actorId);
}

export async function notifyComment(task:TaskContext,actorId:number,actorName:string,body:string){
  const excerpt=body.length>240?`${body.slice(0,237)}…`:body;
  await enqueue(task,actorId,"comment",`💬 **${actorName}** commented on **${task.title}**:\n> ${excerpt.replace(/\n/g,"\n> ")}`,`comment:${task.id}:${Date.now()}`);
  const candidates=await db.prepare(`SELECT DISTINCT u.id,u.name,u.email FROM users u JOIN boards b ON b.id=? JOIN workspaces w ON w.id=b.workspace_id LEFT JOIN board_members bm ON bm.board_id=b.id AND bm.user_id=u.id LEFT JOIN workspace_members wm ON wm.workspace_id=w.id AND wm.user_id=u.id WHERE u.status='Active' AND (u.id=b.owner_id OR u.id=w.owner_id OR bm.user_id IS NOT NULL OR wm.user_id IS NOT NULL OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id=? AND ta.user_id=u.id))`).all(task.boardId,task.id) as Array<{id:number;name:string;email:string}>;
  for(const person of candidates){const aliases=[person.email.split("@")[0],person.name.replace(/\s+/g,"")];if(aliases.some(alias=>new RegExp(`@${alias.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\b`,"i").test(body)))await enqueue(task,actorId,"mention",`📣 **${actorName}** mentioned **${person.name}** on **${task.title}**.`,`mention:${task.id}:${person.id}:${Date.now()}`);}
}

export async function scheduleDueNotification(task:TaskContext,actorId:number){
  await db.prepare("UPDATE reminders SET status='cancelled',error=NULL WHERE task_id=? AND event_type='due' AND status='pending'").run(task.id);
  const completed=(await db.prepare("SELECT is_done isDone FROM board_columns WHERE board_id=? AND column_key=?").get(task.boardId,task.status||"") as {isDone:number}|undefined)?.isDone===1;
  if(!task.dueDate||completed)return;
  const config=await settings(task.boardId);const hours=Number(config?.due_warning_hours||24);
  const recipientIds=[...new Set(assignees(task).length?assignees(task):[task.createdBy||actorId])];
  for(const recipientId of recipientIds){
    const recipient=await db.prepare("SELECT timezone FROM users WHERE id=?").get(recipientId) as {timezone:string}|undefined;
    const due=zonedDateTimeToUtc(task.dueDate,"17:00:00",recipient?.timezone||DEFAULT_TIMEZONE);const when=new Date(due.getTime()-hours*3600000);if(when<=new Date())when.setTime(Date.now()+1000);
    await enqueue(task,actorId,"due",`⏰ **${task.title}** is due ${task.dueDate}.`,`due:${task.id}:${task.dueDate}:${hours}:${recipientId}`,when,recipientId);
  }
}
