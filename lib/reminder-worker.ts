import "server-only";

import db from "./db";
import { discordConfigured, sendDiscordReminder } from "./discord";

declare global { var orbitReminderWorkerStarted: boolean | undefined; }

async function deliverDueReminders() {
  if (!discordConfigured()) return;
  const due = db.prepare(`SELECT r.id,r.channel_id channelId,r.message,b.name boardName,t.title taskTitle
    FROM reminders r JOIN boards b ON b.id=r.board_id LEFT JOIN tasks t ON t.id=r.task_id
    WHERE r.status='pending' AND datetime(r.remind_at)<=datetime('now') ORDER BY r.remind_at LIMIT 20`).all() as Array<{id:number;channelId:string;message:string;boardName:string;taskTitle:string|null}>;
  for (const reminder of due) {
    try {
      const context = reminder.taskTitle ? `**${reminder.boardName} · ${reminder.taskTitle}**` : `**${reminder.boardName}**`;
      await sendDiscordReminder(reminder.channelId, `🛰️ ${context}\n${reminder.message}`);
      db.prepare("UPDATE reminders SET status='sent',sent_at=CURRENT_TIMESTAMP,error=NULL WHERE id=?").run(reminder.id);
    } catch (error) {
      db.prepare("UPDATE reminders SET status='failed',error=? WHERE id=?").run(error instanceof Error ? error.message.slice(0,300) : "Delivery failed", reminder.id);
    }
  }
}

export function startReminderWorker() {
  if (globalThis.orbitReminderWorkerStarted) return;
  globalThis.orbitReminderWorkerStarted = true;
  void deliverDueReminders();
  const timer = setInterval(() => void deliverDueReminders(), 30_000);
  timer.unref();
}
