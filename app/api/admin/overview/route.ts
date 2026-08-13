import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import db from "@/lib/db";
import { boardPermission } from "@/lib/boards";
import { calendarPermission } from "@/lib/calendars";

const actionLabels: Record<string, string> = {
  "TASK.CREATE": "Created task",
  "TASK.UPDATE": "Updated task",
  "TASK.DELETE": "Deleted task",
  "TASK.ARCHIVE": "Archived task",
  "TASK.RESTORE": "Restored task",
  "BOARD.CREATE": "Created board",
  "BOARD.SHARE": "Changed board access",
  "BOARD.NOTIFICATIONS.UPDATE": "Updated board notifications",
  "WORKSPACE.CREATE": "Created workspace",
  "WORKSPACE.SHARE": "Changed workspace access",
  "REMINDER.CREATE": "Scheduled reminder",
  "REMINDER.UPDATE": "Updated reminder",
  "REMINDER.CANCEL": "Cancelled reminder",
  "REMINDER.RETRY": "Retried reminder",
  "USER.CREATE": "Created recovery user",
  "USER.UPDATE": "Updated user account",
  "USER.STATUS.UPDATE": "Changed user status",
  "USER.ROLE.UPDATE": "Changed user role",
  "HEALTH.DISCORD.TEST": "Sent Task Buddy health test",
  "CALENDAR.CREATE": "Created calendar",
  "CALENDAR.UPDATE": "Updated calendar",
  "CALENDAR.DELETE": "Deleted calendar",
  "CALENDAR.SHARE": "Changed calendar access",
  "CALENDAR.UNSHARE": "Removed calendar access",
  "CALENDAR.EVENT.CREATE": "Created calendar event",
  "CALENDAR.EVENT.UPDATE": "Updated calendar event",
  "CALENDAR.EVENT.DELETE": "Deleted calendar event",
};

type AuditRecord = {
  id: number;
  action: string;
  target: string | null;
  detail: string | null;
  createdAt: string;
  actorName: string;
};

function describeAudit(admin: NonNullable<Awaited<ReturnType<typeof requireAdmin>>>, item: AuditRecord) {
  const label = actionLabels[item.action] || item.action.replaceAll(".", " ").toLowerCase();
  const [rawId] = String(item.target || "").split(":");
  if (item.action.startsWith("TASK.")) {
    const task = db.prepare("SELECT id,title,board_id boardId FROM tasks WHERE id=?").get(Number(rawId)) as { id:number; title:string; boardId:number } | undefined;
    return { ...item, label, description: task && boardPermission(admin, task.boardId) ? (item.detail || `${label} “${task.title}”`) : `${label} on a private or removed board` };
  }
  if (item.action.startsWith("BOARD.")) {
    const board = db.prepare("SELECT id,name FROM boards WHERE id=? OR public_id=?").get(Number(rawId) || -1, rawId) as { id:number; name:string } | undefined;
    return { ...item, label, description: board && boardPermission(admin, board.id) ? (item.detail || `${label} “${board.name}”`) : `${label} on a private or removed board` };
  }
  if (item.action.startsWith("CALENDAR.")) {
    const calendarId = Number(rawId);
    return { ...item, label, description: calendarId && calendarPermission(admin, calendarId) ? (item.detail || label) : `${label} on a private or removed calendar` };
  }
  if (item.detail) return { ...item, label, description: item.detail };
  if (item.action.startsWith("USER.")) {
    const target = db.prepare("SELECT name,email FROM users WHERE id=? OR email=?").get(Number(rawId) || -1, rawId) as { name:string; email:string } | undefined;
    return { ...item, label, description: target ? `${label} for ${target.name} (${target.email})` : `${label}: ${rawId}` };
  }
  if (item.action.startsWith("REMINDER."))
    return { ...item, label, description: `${label} #${rawId}` };
  return { ...item, label, description: `${label}${item.target ? ` · ${item.target}` : ""}` };
}

export async function GET() {
  const admin=await requireAdmin();if(!admin)return NextResponse.json({error:"Forbidden"},{status:403});
  const metrics={
    users:Number((db.prepare("SELECT COUNT(*) count FROM users").get() as {count:number}).count),
    activeUsers:Number((db.prepare("SELECT COUNT(*) count FROM users WHERE status='Active'").get() as {count:number}).count),
    activeBoards:Number((db.prepare("SELECT COUNT(*) count FROM boards").get() as {count:number}).count),
    workspaces:Number((db.prepare("SELECT COUNT(*) count FROM workspaces").get() as {count:number}).count),
    tasks:Number((db.prepare("SELECT COUNT(*) count FROM tasks WHERE archived_at IS NULL").get() as {count:number}).count),
    activeTimers:Number((db.prepare("SELECT COUNT(*) count FROM time_entries WHERE ended_at IS NULL AND deleted_at IS NULL").get() as {count:number}).count),
    failedReminders:Number((db.prepare("SELECT COUNT(*) count FROM reminders WHERE status='failed'").get() as {count:number}).count),
    admins:Number((db.prepare("SELECT COUNT(*) count FROM users WHERE role='Admin' AND status='Active'").get() as {count:number}).count),
    suspended:Number((db.prepare("SELECT COUNT(*) count FROM users WHERE status='Suspended'").get() as {count:number}).count),
  };
  const boards=db.prepare(`SELECT b.id,b.name,b.description,u.name ownerName,COUNT(DISTINCT bm.user_id) sharedUsers,COUNT(DISTINCT t.id) taskCount
    FROM boards b JOIN users u ON u.id=b.owner_id LEFT JOIN board_members bm ON bm.board_id=b.id LEFT JOIN tasks t ON t.board_id=b.id
    GROUP BY b.id ORDER BY b.updated_at DESC`).all();
  const audit=(db.prepare(`SELECT a.id,a.action,a.target,a.detail,a.created_at createdAt,COALESCE(u.name,'System') actorName
    FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 100`).all() as AuditRecord[]).map((item)=>describeAudit(admin,item));
  return NextResponse.json({metrics,boards,audit});
}
