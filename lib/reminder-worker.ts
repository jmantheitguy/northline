import "server-only";

import db from "./db";
import { discordConfigured, sendDiscordReminder } from "./discord";

declare global { var northlineReminderWorkerStarted: boolean | undefined; }

async function deliverDueReminders() {
  if (!discordConfigured()) return;
  const due = db.prepare(`SELECT r.id,r.created_by createdBy,r.channel_id channelId,r.channel_name channelName,r.message,r.kind,r.event_type eventType,b.id boardId,b.public_id boardKey,b.name boardName,t.id taskId,t.title taskTitle,u.name creatorName
    FROM reminders r JOIN boards b ON b.id=r.board_id LEFT JOIN tasks t ON t.id=r.task_id JOIN users u ON u.id=r.created_by
    WHERE r.status='pending' AND datetime(r.remind_at)<=datetime('now') ORDER BY r.remind_at LIMIT 20`).all() as Array<{id:number;createdBy:number;channelId:string;channelName:string;message:string;kind:string;eventType:string|null;boardId:number;boardKey:string;boardName:string;taskId:number|null;taskTitle:string|null;creatorName:string}>;
  for (const reminder of due) {
    try {
      const context = reminder.taskTitle ? `**${reminder.boardName} · ${reminder.taskTitle}**` : `**${reminder.boardName}**`;
      const base=(process.env.NORTHLINE_PUBLIC_URL||"https://northline.vtuberoffices.com").replace(/\/$/,"");
      const link=reminder.taskId?`${base}/?board=${encodeURIComponent(reminder.boardKey||String(reminder.boardId))}&task=${reminder.taskId}`:`${base}/?board=${encodeURIComponent(reminder.boardKey||String(reminder.boardId))}`;
      await sendDiscordReminder(reminder.channelId, `🛰️ ${context}\n🔔 **${reminder.creatorName}** set a reminder: ${reminder.message}\n${link}`);
      db.prepare("UPDATE reminders SET status='sent',sent_at=CURRENT_TIMESTAMP,error=NULL WHERE id=?").run(reminder.id);
      db.prepare(`INSERT INTO notification_deliveries(reminder_id,board_id_snapshot,board_key,board_name,task_title,created_by,channel_id,channel_name,message,kind,event_type,status,delivered_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,'sent',CURRENT_TIMESTAMP) ON CONFLICT(reminder_id) DO UPDATE SET status='sent',error=NULL,delivered_at=CURRENT_TIMESTAMP`).run(reminder.id,reminder.boardId,reminder.boardKey,reminder.boardName,reminder.taskTitle,reminder.createdBy,reminder.channelId,reminder.channelName,reminder.message,reminder.kind,reminder.eventType);
    } catch (error) {
      const message=error instanceof Error ? error.message.slice(0,300) : "Delivery failed";db.prepare("UPDATE reminders SET status='failed',error=? WHERE id=?").run(message, reminder.id);
      db.prepare(`INSERT INTO notification_deliveries(reminder_id,board_id_snapshot,board_key,board_name,task_title,created_by,channel_id,channel_name,message,kind,event_type,status,error) VALUES(?,?,?,?,?,?,?,?,?,?,?,'failed',?) ON CONFLICT(reminder_id) DO UPDATE SET status='failed',error=excluded.error`).run(reminder.id,reminder.boardId,reminder.boardKey,reminder.boardName,reminder.taskTitle,reminder.createdBy,reminder.channelId,reminder.channelName,reminder.message,reminder.kind,reminder.eventType,message);
    }
  }
}

export function startReminderWorker() {
  if (globalThis.northlineReminderWorkerStarted) return;
  globalThis.northlineReminderWorkerStarted = true;
  void deliverDueReminders();
  const timer = setInterval(() => void deliverDueReminders(), 30_000);
  timer.unref();
}
