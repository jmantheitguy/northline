import "server-only";

import db from "./db";
import { DEFAULT_TIMEZONE, zonedDateTimeToUtc } from "./timezones";

type EventType="assignment"|"status"|"comment"|"mention"|"due";
type TaskContext={id:number;boardId:number;title:string;status?:string|null;assigneeId?:number|null;dueDate?:string|null;createdBy?:number|null};

const eventColumn:Record<EventType,string>={assignment:"assignment_enabled",status:"status_enabled",comment:"comment_enabled",mention:"mention_enabled",due:"due_enabled"};
function statusName(boardId:number,key:string|null|undefined){return (db.prepare("SELECT name FROM board_columns WHERE board_id=? AND column_key=?").get(boardId,key||"") as {name:string}|undefined)?.name||key||"Unknown"}

function settings(boardId:number){
  return db.prepare(`SELECT * FROM board_notification_settings WHERE board_id=?`).get(boardId) as Record<string,unknown>|undefined;
}

function taskLink(task:TaskContext){
  const base=(process.env.NORTHLINE_PUBLIC_URL||"https://northline.vtuberoffices.com").replace(/\/$/,"");
  const board=db.prepare("SELECT public_id FROM boards WHERE id=?").get(task.boardId) as {public_id:string}|undefined;
  return `${base}/?board=${encodeURIComponent(board?.public_id||String(task.boardId))}&task=${task.id}`;
}

function enqueue(task:TaskContext,actorId:number,event:EventType,message:string,dedupeKey:string,when=new Date()){
  const config=settings(task.boardId); if(!config||config[eventColumn[event]]===0)return;
  const preferenceUserId=task.createdBy||actorId;
  const preference=db.prepare(`SELECT ${eventColumn[event]} enabled FROM user_notification_settings WHERE user_id=?`).get(preferenceUserId) as {enabled:number}|undefined;if(preference?.enabled===0)return;
  db.prepare(`INSERT OR IGNORE INTO reminders(board_id,task_id,created_by,recipient_user_id,channel_id,channel_name,message,remind_at,kind,event_type,dedupe_key)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(task.boardId,task.id,actorId,task.createdBy||actorId,"dm","Direct message",`${message}\n${taskLink(task)}`,when.toISOString(),"automatic",event,dedupeKey);
}

export function notifyTaskCreated(task:TaskContext,actorId:number){
  if(task.assigneeId){const person=db.prepare("SELECT name FROM users WHERE id=?").get(task.assigneeId) as {name:string}|undefined;enqueue(task,actorId,"assignment",`👤 **${person?.name||"A teammate"}** was assigned to **${task.title}**.`,`assignment:${task.id}:${task.assigneeId}`);}
  scheduleDueNotification(task,actorId);
}

export function notifyTaskChanges(before:TaskContext,after:TaskContext,actorId:number){
  if(before.assigneeId!==after.assigneeId&&after.assigneeId){const person=db.prepare("SELECT name FROM users WHERE id=?").get(after.assigneeId) as {name:string}|undefined;enqueue(after,actorId,"assignment",`👤 **${person?.name||"A teammate"}** was assigned to **${after.title}**.`,`assignment:${after.id}:${after.assigneeId}:${Date.now()}`);}
  if(before.status!==after.status)enqueue(after,actorId,"status",`🔄 **${after.title}** moved from **${statusName(after.boardId,before.status)}** to **${statusName(after.boardId,after.status)}**.`,`status:${after.id}:${after.status}:${Date.now()}`);
  if(before.dueDate!==after.dueDate||before.status!==after.status)scheduleDueNotification(after,actorId);
}

export function notifyComment(task:TaskContext,actorId:number,actorName:string,body:string){
  const excerpt=body.length>240?`${body.slice(0,237)}…`:body;
  enqueue(task,actorId,"comment",`💬 **${actorName}** commented on **${task.title}**:\n> ${excerpt.replace(/\n/g,"\n> ")}`,`comment:${task.id}:${Date.now()}`);
  const candidates=db.prepare(`SELECT DISTINCT u.id,u.name,u.email FROM users u JOIN boards b ON b.id=? JOIN workspaces w ON w.id=b.workspace_id LEFT JOIN board_members bm ON bm.board_id=b.id AND bm.user_id=u.id LEFT JOIN workspace_members wm ON wm.workspace_id=w.id AND wm.user_id=u.id WHERE u.status='Active' AND (u.id=b.owner_id OR u.id=w.owner_id OR bm.user_id IS NOT NULL OR wm.user_id IS NOT NULL OR u.id=?)`).all(task.boardId,task.assigneeId||-1) as Array<{id:number;name:string;email:string}>;
  for(const person of candidates){const aliases=[person.email.split("@")[0],person.name.replace(/\s+/g,"")];if(aliases.some(alias=>new RegExp(`@${alias.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\b`,"i").test(body)))enqueue(task,actorId,"mention",`📣 **${actorName}** mentioned **${person.name}** on **${task.title}**.`,`mention:${task.id}:${person.id}:${Date.now()}`);}
}

export function scheduleDueNotification(task:TaskContext,actorId:number){
  db.prepare("UPDATE reminders SET status='cancelled',error=NULL WHERE task_id=? AND event_type='due' AND status='pending'").run(task.id);
  const completed=(db.prepare("SELECT is_done isDone FROM board_columns WHERE board_id=? AND column_key=?").get(task.boardId,task.status||"") as {isDone:number}|undefined)?.isDone===1;
  if(!task.dueDate||completed)return;
  const config=settings(task.boardId);const hours=Number(config?.due_warning_hours||24);
  const recipientId=task.createdBy||actorId;
  const recipient=db.prepare("SELECT timezone FROM users WHERE id=?").get(recipientId) as {timezone:string}|undefined;
  const due=zonedDateTimeToUtc(task.dueDate,"17:00:00",recipient?.timezone||DEFAULT_TIMEZONE);const when=new Date(due.getTime()-hours*3600000);if(when<=new Date())when.setTime(Date.now()+1000);
  enqueue(task,actorId,"due",`⏰ **${task.title}** is due ${task.dueDate}.`,`due:${task.id}:${task.dueDate}:${hours}`,when);
}
