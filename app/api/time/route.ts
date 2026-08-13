import { NextResponse } from "next/server";
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

export async function GET() {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const entries = db
    .prepare(
      `${entrySelect} WHERE e.user_id=? AND e.deleted_at IS NULL ORDER BY e.started_at DESC LIMIT 250`,
    )
    .all(user.id);
  const active =
    db
      .prepare(
        `${entrySelect} WHERE e.user_id=? AND e.ended_at IS NULL AND e.deleted_at IS NULL LIMIT 1`,
      )
      .get(user.id) || null;
  return NextResponse.json({ active, entries, options: timeOptions(user) });
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
