"use client";
/* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import { apiErrorMessage, resilientFetch } from "./client-fetch";

type OptionData = {
  boards: Array<{ id: number; name: string; workspaceName: string }>;
  tasks: Array<{ id: number; boardId: number; title: string }>;
};
type ActiveEntry = {
  id: number;
  startedAt: string;
  note: string;
  boardId: number | null;
  taskId: number | null;
  boardName: string | null;
  taskTitle: string | null;
  pausedAt: string | null;
  pausedSeconds: number;
};
const request = async (url: string, options?: RequestInit) => {
  const response = await resilientFetch(url, options),
    data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(apiErrorMessage(response, data, "Time clock request failed"));
  return data;
};
const LONG_TIMER_SECONDS = 12 * 60 * 60;
const localValue = (iso?: string | null) =>
  iso
    ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
    : "";
export const formatDuration = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds)),
    hours = Math.floor(safe / 3600),
    minutes = Math.floor((safe % 3600) / 60),
    secs = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

export function TimeClock({ notify }: { notify: (message: string) => void }) {
  const [open, setOpen] = useState(false),
    [active, setActive] = useState<ActiveEntry | null>(null),
    [options, setOptions] = useState<OptionData>({ boards: [], tasks: [] });
  const [boardId, setBoardId] = useState(""),
    [taskId, setTaskId] = useState(""),
    [note, setNote] = useState(""),
    [now, setNow] = useState(0),
    [editStartedAt, setEditStartedAt] = useState(""),
    [editReason, setEditReason] = useState(""),
    [busy, setBusy] = useState(false);
  const load = () =>
    request("/api/time")
      .then((data) => {
        setActive(data.active);
        if (data.active) setEditStartedAt(localValue(data.active.startedAt));
        setOptions(data.options);
      })
      .catch((error) => notify(error.message));
  useEffect(() => {
    void load();
    const listener = () => void load();
    window.addEventListener("northline-time-changed", listener);
    return () => window.removeEventListener("northline-time-changed", listener);
  }, []);
  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ boardId?: number; taskId?: number; note?: string }>).detail || {};
      if (active) {
        setOpen(true);
        notify("Stop your current timer before starting another task");
        return;
      }
      setBoardId(detail.boardId ? String(detail.boardId) : "");
      setTaskId(detail.taskId ? String(detail.taskId) : "");
      setNote(detail.note || "");
      setOpen(true);
    };
    window.addEventListener("northline-open-time-clock", listener);
    return () => window.removeEventListener("northline-open-time-clock", listener);
  }, [active, notify]);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  const elapsed = active
    ? Math.max(0, Math.floor((now - new Date(active.startedAt).getTime()) / 1000) - Number(active.pausedSeconds || 0) - (active.pausedAt ? Math.max(0, Math.floor((now - new Date(active.pausedAt).getTime()) / 1000)) : 0))
    : 0;
  const tasks = useMemo(
    () => options.tasks.filter((task) => String(task.boardId) === boardId),
    [options.tasks, boardId],
  );
  const action = async (kind: "clock-in" | "clock-out" | "pause" | "resume" | "edit-clock-in") => {
    setBusy(true);
    try {
      if (kind === "clock-in")
        await request("/api/time", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: kind,
            boardId: boardId || null,
            taskId: taskId || null,
            note,
          }),
        });
      else if (kind === "edit-clock-in")
        await request(`/api/time/${active?.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: kind, startedAt: new Date(editStartedAt).toISOString(), reason: editReason }),
        });
      else
        await request(`/api/time/${active?.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: kind }),
        });
      setNote("");
      if (kind === "edit-clock-in") setEditReason("");
      setBoardId("");
      setTaskId("");
      await load();
      window.dispatchEvent(new Event("northline-time-changed"));
      notify(kind === "clock-in" ? "Clocked in" : kind === "clock-out" ? "Clocked out" : kind === "pause" ? "Timer paused" : kind === "resume" ? "Timer resumed" : "Time in updated");
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button
        className={`time-clock-fab ${active ? "running" : ""}`}
        aria-label={
          active
            ? `Timer running for ${formatDuration(elapsed)}`
            : "Open time clock"
        }
        onClick={() => setOpen((value) => !value)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
        {active && <i />}
      </button>
      {open && (
        <aside className="time-clock-popover">
          <header>
            <span className="time-clock-symbol">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
            </span>
            <div>
              <small>MY TIME CLOCK</small>
              <h2>{active ? formatDuration(elapsed) : "Ready to work"}</h2>
            </div>
            <button
              aria-label="Close time clock"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </header>
          {active ? (
            <div className="active-punch">
              {elapsed >= LONG_TIMER_SECONDS && (
                <div className="time-warning" role="status">
                  This timer has been running for over 12 hours. Check that it is still accurate.
                </div>
              )}
              <span>
                {active.pausedAt ? "Paused since " : "Clocked in "}
                {new Date(active.pausedAt || active.startedAt).toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
              <b>
                {active.taskTitle ||
                  active.boardName ||
                  active.note ||
                  "General work"}
              </b>
              <label className="time-edit-start">
                Time in
                <input type="datetime-local" value={editStartedAt} onChange={(event) => setEditStartedAt(event.target.value)} />
              </label>
              <label className="time-edit-start">
                Why change it?
                <input value={editReason} onChange={(event) => setEditReason(event.target.value)} placeholder="Correction reason" />
              </label>
              <button className="secondary" disabled={busy || !editStartedAt || editReason.trim().length < 3} onClick={() => void action("edit-clock-in")}>Save time in</button>
              <div className="time-punch-actions">
                <button className="secondary" disabled={busy} onClick={() => void action(active.pausedAt ? "resume" : "pause")}>{active.pausedAt ? "Resume" : "Pause"}</button>
              <button
                className="time-out-button"
                disabled={busy}
                onClick={() => void action("clock-out")}
              >
                {busy ? "Stopping…" : "Time out"}
              </button>
              </div>
            </div>
          ) : (
            <div className="punch-form">
              <label>
                Board
                <select
                  value={boardId}
                  onChange={(event) => {
                    setBoardId(event.target.value);
                    setTaskId("");
                  }}
                >
                  <option value="">General / no board</option>
                  {options.boards.map((board) => (
                    <option key={board.id} value={board.id}>
                      {board.workspaceName} · {board.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Task
                <select
                  value={taskId}
                  disabled={!boardId}
                  onChange={(event) => setTaskId(event.target.value)}
                >
                  <option value="">No specific task</option>
                  {tasks.map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Work note
                <input
                  maxLength={500}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="What are you working on?"
                />
              </label>
              <button
                className="time-in-button"
                disabled={busy}
                onClick={() => void action("clock-in")}
              >
                {busy ? "Starting…" : "Time in"}
              </button>
            </div>
          )}
        </aside>
      )}
    </>
  );
}
