import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import db from "@/lib/db";
import {
  auditTimeEntry,
  ensureNoOverlap,
  secondsBetween,
  validateAssociation,
} from "@/lib/time-entries";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id),
    entry = db
      .prepare(
        "SELECT * FROM time_entries WHERE id=? AND user_id=? AND deleted_at IS NULL",
      )
      .get(id, user.id) as Record<string, unknown> | undefined;
  if (!entry)
    return NextResponse.json(
      { error: "Time entry not found" },
      { status: 404 },
    );
  const body = await request.json();
  try {
    if (body.action === "clock-out") {
      if (entry.ended_at)
        return NextResponse.json(
          { error: "This timer is already stopped" },
          { status: 409 },
        );
      const endedAt = new Date().toISOString(),
        duration = secondsBetween(String(entry.started_at), endedAt);
      db.prepare(
        "UPDATE time_entries SET ended_at=?,duration_seconds=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      ).run(endedAt, duration, id);
      auditTimeEntry(id, user.id, "CLOCK_OUT", entry, { endedAt, duration });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "correct") {
      const reason = String(body.reason || "").trim();
      if (reason.length < 3)
        throw new Error("Enter a reason for the correction");
      const startedAt = new Date(body.startedAt).toISOString(),
        endedAt = new Date(body.endedAt).toISOString();
      const duration = secondsBetween(startedAt, endedAt);
      ensureNoOverlap(user.id, startedAt, endedAt, id);
      const association = validateAssociation(user, body.boardId, body.taskId),
        note = String(body.note || "")
          .trim()
          .slice(0, 500);
      const next = { startedAt, endedAt, duration, ...association, note };
      db.prepare(
        "UPDATE time_entries SET workspace_id=?,board_id=?,task_id=?,started_at=?,ended_at=?,duration_seconds=?,note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      ).run(
        association.workspaceId,
        association.boardId,
        association.taskId,
        startedAt,
        endedAt,
        duration,
        note,
        id,
      );
      auditTimeEntry(id, user.id, "CORRECT", entry, next, reason.slice(0, 300));
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown time action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id),
    entry = db
      .prepare(
        "SELECT * FROM time_entries WHERE id=? AND user_id=? AND deleted_at IS NULL",
      )
      .get(id, user.id) as Record<string, unknown> | undefined;
  if (!entry)
    return NextResponse.json(
      { error: "Time entry not found" },
      { status: 404 },
    );
  if (!entry.ended_at)
    return NextResponse.json(
      { error: "Stop the active timer before deleting it" },
      { status: 409 },
    );
  db.prepare(
    "UPDATE time_entries SET deleted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?",
  ).run(id);
  auditTimeEntry(
    id,
    user.id,
    "DELETE",
    entry,
    { deleted: true },
    "Deleted by time-card owner",
  );
  return NextResponse.json({ ok: true });
}
