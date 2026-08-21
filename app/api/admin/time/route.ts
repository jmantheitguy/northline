import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import db from "@/lib/db";
import { entrySelect } from "@/lib/time-entries";
import { zonedDateTimeToUtc } from "@/lib/timezones";

const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

export async function GET(request: NextRequest) {
  const admin=await requireAdmin();
  if (!admin)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const search = request.nextUrl.searchParams;
  const conditions = ["e.deleted_at IS NULL"];
  const values: Array<string | number> = [];
  if (search.get("userId")) { conditions.push("e.user_id=?"); values.push(Number(search.get("userId"))); }
  if (search.get("from")) { conditions.push("e.started_at>=?"); values.push(zonedDateTimeToUtc(search.get("from")!,"00:00:00",admin.timezone).toISOString()); }
  if (search.get("to")) { const nextDay=new Date(`${search.get("to")}T12:00:00Z`);nextDay.setUTCDate(nextDay.getUTCDate()+1);conditions.push("e.started_at<?"); values.push(zonedDateTimeToUtc(nextDay.toISOString().slice(0,10),"00:00:00",admin.timezone).toISOString()); }
  if (search.get("boardId")) { conditions.push("e.board_id=?"); values.push(Number(search.get("boardId"))); }
  const entries = await db
    .prepare(
      `${entrySelect} WHERE ${conditions.join(" AND ")} ORDER BY e.started_at DESC LIMIT 2000`,
    )
    .all(...values) as Array<Record<string, unknown>>;
  if (search.get("format") === "csv") {
    const header = ["User", "Time in", "Time out", "Duration seconds", "Paused seconds", "Workspace", "Board", "Task", "Note", "Source"];
    const lines = entries.map((entry) => [entry.userName, entry.startedAt, entry.endedAt, entry.durationSeconds, entry.pausedSeconds, entry.workspaceName, entry.boardName, entry.taskTitle, entry.note, entry.source].map(csvCell).join(","));
    return new Response([header.map(csvCell).join(","), ...lines].join("\r\n"), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="northline-organization-time.csv"' },
    });
  }
  const totals = await db
    .prepare(
      `SELECT u.id AS "userId",u.name AS "userName",u.avatar AS "userAvatar",
    COALESCE(SUM(CASE WHEN e.ended_at IS NOT NULL THEN e.duration_seconds ELSE 0 END),0) AS "totalSeconds",
    COALESCE(SUM(CASE WHEN e.ended_at IS NOT NULL AND e.started_at>=datetime('now','-7 days') THEN e.duration_seconds ELSE 0 END),0) AS "weekSeconds",
    MAX(CASE WHEN e.ended_at IS NULL THEN e.started_at END) AS "activeSince"
    FROM users u LEFT JOIN time_entries e ON e.user_id=u.id AND e.deleted_at IS NULL WHERE u.status='Active' GROUP BY u.id ORDER BY u.name`,
    )
    .all();
  const audit = await db
    .prepare(
      `SELECT a.id,a.time_entry_id AS "entryId",a.action,a.reason,a.created_at AS "createdAt",u.name AS "actorName"
    FROM time_entry_audit a LEFT JOIN users u ON u.id=a.actor_user_id ORDER BY a.id DESC LIMIT 200`,
    )
    .all();
  return NextResponse.json({ entries, totals, audit });
}
