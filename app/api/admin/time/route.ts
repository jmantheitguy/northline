import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import db from "@/lib/db";
import { entrySelect } from "@/lib/time-entries";

export async function GET() {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const entries = db
    .prepare(
      `${entrySelect} WHERE e.deleted_at IS NULL ORDER BY e.started_at DESC LIMIT 1000`,
    )
    .all();
  const totals = db
    .prepare(
      `SELECT u.id userId,u.name userName,u.avatar userAvatar,
    COALESCE(SUM(CASE WHEN e.ended_at IS NOT NULL THEN e.duration_seconds ELSE 0 END),0) totalSeconds,
    COALESCE(SUM(CASE WHEN e.ended_at IS NOT NULL AND e.started_at>=datetime('now','-7 days') THEN e.duration_seconds ELSE 0 END),0) weekSeconds,
    MAX(CASE WHEN e.ended_at IS NULL THEN e.started_at END) activeSince
    FROM users u LEFT JOIN time_entries e ON e.user_id=u.id AND e.deleted_at IS NULL WHERE u.status='Active' GROUP BY u.id ORDER BY u.name`,
    )
    .all();
  const audit = db
    .prepare(
      `SELECT a.id,a.time_entry_id entryId,a.action,a.reason,a.created_at createdAt,u.name actorName
    FROM time_entry_audit a LEFT JOIN users u ON u.id=a.actor_user_id ORDER BY a.id DESC LIMIT 200`,
    )
    .all();
  return NextResponse.json({ entries, totals, audit });
}
