import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import db from "@/lib/db";
import {
  auditTimeEntry,
  ensureNoOverlap,
  secondsBetween,
  elapsedSeconds,
  validateClockIn,
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
    entry = await db
      .prepare(
        "SELECT * FROM time_entries WHERE id=? AND user_id=?",
      )
      .get(id, user.id) as Record<string, unknown> | undefined;
  if (!entry)
    return NextResponse.json(
      { error: "Time entry not found" },
      { status: 404 },
    );
  const body = await request.json();
  try {
    if (body.action === "restore") {
      if (!entry.deleted_at)
        return NextResponse.json({ error: "This entry is not deleted" }, { status: 409 });
      await ensureNoOverlap(user.id, String(entry.started_at), String(entry.ended_at), id);
      await db.prepare("UPDATE time_entries SET deleted_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(id);
      auditTimeEntry(id, user.id, "RESTORE", entry, { deleted: false }, "Restored by time-card owner");
      return NextResponse.json({ ok: true });
    }
    if (entry.deleted_at)
      return NextResponse.json({ error: "Restore this entry before editing it" }, { status: 409 });
    if (body.action === "pause") {
      if (entry.ended_at) return NextResponse.json({ error: "This timer is already stopped" }, { status: 409 });
      if (entry.paused_at) return NextResponse.json({ error: "This timer is already paused" }, { status: 409 });
      const pausedAt = new Date().toISOString();
      await db.prepare("UPDATE time_entries SET paused_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(pausedAt, id);
      auditTimeEntry(id, user.id, "PAUSE", entry, { pausedAt });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "resume") {
      if (entry.ended_at) return NextResponse.json({ error: "This timer is already stopped" }, { status: 409 });
      if (!entry.paused_at) return NextResponse.json({ error: "This timer is not paused" }, { status: 409 });
      const resumedAt = new Date().toISOString();
      const pausedSeconds = Number(entry.paused_seconds || 0) + Math.max(0, Math.floor((Date.parse(resumedAt) - Date.parse(String(entry.paused_at))) / 1000));
      await db.prepare("UPDATE time_entries SET paused_at=NULL,paused_seconds=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(pausedSeconds, id);
      auditTimeEntry(id, user.id, "RESUME", entry, { resumedAt, pausedSeconds });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "edit-clock-in") {
      if (entry.ended_at) return NextResponse.json({ error: "Edit finished entries from your time card" }, { status: 409 });
      const reason = String(body.reason || "").trim();
      if (reason.length < 3) throw new Error("Enter a reason for changing time in");
      const startedAt = validateClockIn(new Date(body.startedAt).toISOString());
      if (entry.paused_at && Date.parse(startedAt) > Date.parse(String(entry.paused_at)))
        throw new Error("Time in must be before the current pause");
      await ensureNoOverlap(user.id, startedAt, new Date().toISOString(), id);
      await db.prepare("UPDATE time_entries SET started_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(startedAt, id);
      auditTimeEntry(id, user.id, "EDIT_CLOCK_IN", entry, { startedAt }, reason.slice(0, 300));
      return NextResponse.json({ ok: true });
    }
    if (body.action === "clock-out") {
      if (entry.ended_at)
        return NextResponse.json(
          { error: "This timer is already stopped" },
          { status: 409 },
        );
      const endedAt = new Date().toISOString();
      let pausedSeconds = Number(entry.paused_seconds || 0);
      if (entry.paused_at) pausedSeconds += Math.max(0, Math.floor((Date.parse(endedAt) - Date.parse(String(entry.paused_at))) / 1000));
      const duration = elapsedSeconds(String(entry.started_at), endedAt, pausedSeconds);
      if (duration <= 0 || duration > 7 * 24 * 60 * 60) throw new Error("Time entries must contain between one second and seven days of active work");
      await db.prepare(
        "UPDATE time_entries SET ended_at=?,duration_seconds=?,paused_at=NULL,paused_seconds=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      ).run(endedAt, duration, pausedSeconds, id);
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
      await ensureNoOverlap(user.id, startedAt, endedAt, id);
      const association = await validateAssociation(user, body.boardId, body.taskId),
        note = String(body.note || "")
          .trim()
          .slice(0, 500);
      const next = { startedAt, endedAt, duration, ...association, note };
      await db.prepare(
        "UPDATE time_entries SET workspace_id=?,board_id=?,task_id=?,started_at=?,ended_at=?,duration_seconds=?,paused_at=NULL,paused_seconds=0,note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
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
    entry = await db
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
  await db.prepare(
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
