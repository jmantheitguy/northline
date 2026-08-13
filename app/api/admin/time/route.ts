import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import db from "@/lib/db";
import { entrySelect } from "@/lib/time-entries";

const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

export async function GET(request: NextRequest) {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const search = request.nextUrl.searchParams;
  const conditions = ["e.deleted_at IS NULL"];
  const values: Array<string | number> = [];
  if (search.get("userId")) { conditions.push("e.user_id=?"); values.push(Number(search.get("userId"))); }
  if (search.get("from")) { conditions.push("e.started_at>=?"); values.push(`${search.get("from")}T00:00:00.000Z`); }
  if (search.get("to")) { conditions.push("e.started_at<=?"); values.push(`${search.get("to")}T23:59:59.999Z`); }
  if (search.get("boardId")) { conditions.push("e.board_id=?"); values.push(Number(search.get("boardId"))); }
  const entries = db
    .prepare(
      `${entrySelect} WHERE ${conditions.join(" AND ")} ORDER BY e.started_at DESC LIMIT 2000`,
    )
    .all(...values) as Array<Record<string, unknown>>;
  if (search.get("format") === "csv") {
    const header = ["User", "Time in", "Time out", "Duration seconds", "Workspace", "Board", "Task", "Note", "Source"];
    const lines = entries.map((entry) => [entry.userName, entry.startedAt, entry.endedAt, entry.durationSeconds, entry.workspaceName, entry.boardName, entry.taskTitle, entry.note, entry.source].map(csvCell).join(","));
    return new Response([header.map(csvCell).join(","), ...lines].join("\r\n"), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="northline-organization-time.csv"' },
    });
  }
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
