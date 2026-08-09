import "server-only";

import db from "./db";
import { discordConfigured, sendDiscordReminder } from "./discord";

declare global { var northlineReminderWorkerStarted: boolean | undefined; }

async function deliverDueReminders() {
  if (!discordConfigured()) return;
  const due = db.prepare(`SELECT r.id,r.channel_id channelId,r.message,b.id boardId,b.public_id boardKey,b.name boardName,t.id taskId,t.title taskTitle,u.name creatorName
    FROM reminders r JOIN boards b ON b.id=r.board_id LEFT JOIN tasks t ON t.id=r.task_id JOIN users u ON u.id=r.created_by
    WHERE r.status='pending' AND datetime(r.remind_at)<=datetime('now') ORDER BY r.remind_at LIMIT 20`).all() as Array<{id:number;channelId:string;message:string;boardId:number;boardKey:string;boardName:string;taskId:number|null;taskTitle:string|null;creatorName:string}>;
  for (const reminder of due) {
    try {
      const context = reminder.taskTitle ? `**${reminder.boardName} · ${reminder.taskTitle}**` : `**${reminder.boardName}**`;
      const base=(process.env.NORTHLINE_PUBLIC_URL||"https://northline.vtuberoffices.com").replace(/\/$/,"");
      const link=reminder.taskId?`${base}/?board=${encodeURIComponent(reminder.boardKey||String(reminder.boardId))}&task=${reminder.taskId}`:`${base}/?board=${encodeURIComponent(reminder.boardKey||String(reminder.boardId))}`;
      await sendDiscordReminder(reminder.channelId, `🛰️ ${context}\n🔔 **${reminder.creatorName}** set a reminder: ${reminder.message}\n${link}`);
      db.prepare("UPDATE reminders SET status='sent',sent_at=CURRENT_TIMESTAMP,error=NULL WHERE id=?").run(reminder.id);
    } catch (error) {
      db.prepare("UPDATE reminders SET status='failed',error=? WHERE id=?").run(error instanceof Error ? error.message.slice(0,300) : "Delivery failed", reminder.id);
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
