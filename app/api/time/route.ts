import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import db from "@/lib/db";
import {
  auditTimeEntry,
  ensureNoOverlap,
  entrySelect,
  secondsBetween,
  timeOptions,
  validateAssociation,
} from "@/lib/time-entries";

const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const search = request.nextUrl.searchParams;
  const conditions = ["e.user_id=?", "e.deleted_at IS NULL"];
  const values: Array<string | number> = [user.id];
  if (search.get("from")) {
    conditions.push("e.started_at>=?");
    values.push(`${search.get("from")}T00:00:00.000Z`);
  }
  if (search.get("to")) {
    conditions.push("e.started_at<?");
    values.push(`${search.get("to")}T23:59:59.999Z`);
  }
  if (search.get("boardId")) {
    conditions.push("e.board_id=?");
    values.push(Number(search.get("boardId")));
  }
  if (search.get("taskId")) {
    conditions.push("e.task_id=?");
    values.push(Number(search.get("taskId")));
  }
  const entries = db
    .prepare(
      `${entrySelect} WHERE ${conditions.join(" AND ")} ORDER BY e.started_at DESC LIMIT 1000`,
    )
    .all(...values) as Array<Record<string, unknown>>;
  if (search.get("format") === "csv") {
    const header = ["Date", "Time in", "Time out", "Duration seconds", "Workspace", "Board", "Task", "Note", "Source"];
    const lines = entries.map((entry) =>
      [entry.startedAt, entry.startedAt, entry.endedAt, entry.durationSeconds, entry.workspaceName, entry.boardName, entry.taskTitle, entry.note, entry.source]
        .map(csvCell)
        .join(","),
    );
    return new Response([header.map(csvCell).join(","), ...lines].join("\r\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="northline-my-time.csv"',
      },
    });
  }
  const active =
    db
      .prepare(
        `${entrySelect} WHERE e.user_id=? AND e.ended_at IS NULL AND e.deleted_at IS NULL LIMIT 1`,
      )
      .get(user.id) || null;
  const deleted = db
    .prepare(`${entrySelect} WHERE e.user_id=? AND e.deleted_at IS NOT NULL AND e.deleted_at>=datetime('now','-30 days') ORDER BY e.deleted_at DESC LIMIT 50`)
    .all(user.id);
  return NextResponse.json({ active, entries, deleted, options: timeOptions(user) });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  try {
    const association = validateAssociation(user, body.boardId, body.taskId);
    const note = String(body.note || "")
      .trim()
      .slice(0, 500);
    if (body.action === "clock-in") {
      const startedAt = new Date().toISOString();
      const result = db
        .prepare(
          "INSERT INTO time_entries(user_id,workspace_id,board_id,task_id,started_at,note,source) VALUES(?,?,?,?,?,?, 'timer')",
        )
        .run(
          user.id,
          association.workspaceId,
          association.boardId,
          association.taskId,
          startedAt,
          note,
        );
      auditTimeEntry(
        Number(result.lastInsertRowid),
        user.id,
        "CLOCK_IN",
        null,
        { startedAt, ...association, note },
      );
      return NextResponse.json(
        { id: Number(result.lastInsertRowid) },
        { status: 201 },
      );
    }
    if (body.action === "manual") {
      const startedAt = new Date(body.startedAt).toISOString(),
        endedAt = new Date(body.endedAt).toISOString();
      const duration = secondsBetween(startedAt, endedAt);
      ensureNoOverlap(user.id, startedAt, endedAt);
      const result = db
        .prepare(
          "INSERT INTO time_entries(user_id,workspace_id,board_id,task_id,started_at,ended_at,duration_seconds,note,source) VALUES(?,?,?,?,?,?,?,?, 'manual')",
        )
        .run(
          user.id,
          association.workspaceId,
          association.boardId,
          association.taskId,
          startedAt,
          endedAt,
          duration,
          note,
        );
      auditTimeEntry(
        Number(result.lastInsertRowid),
        user.id,
        "MANUAL_CREATE",
        null,
        { startedAt, endedAt, duration, ...association, note },
        String(body.reason || "Manual entry").slice(0, 300),
      );
      return NextResponse.json(
        { id: Number(result.lastInsertRowid) },
        { status: 201 },
      );
    }
    return NextResponse.json({ error: "Unknown time action" }, { status: 400 });
  } catch (error) {
    if ((error as Error).message.includes("time_entries.user_id"))
      return NextResponse.json(
        { error: "You are already clocked in" },
        { status: 409 },
      );
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
