"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import { useEffect, useMemo, useState } from "react";
import { formatDuration } from "./time-clock";

type Entry = {
  id: number;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  note: string;
  source: string;
  boardId: number | null;
  taskId: number | null;
  workspaceName: string | null;
  boardName: string | null;
  taskTitle: string | null;
};
type Options = {
  boards: Array<{ id: number; name: string; workspaceName: string }>;
  tasks: Array<{ id: number; boardId: number; title: string }>;
};
const request = async (url: string, options?: RequestInit) => {
  const response = await fetch(url, options),
    data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Time card request failed");
  return data;
};
const localValue = (iso?: string | null) =>
  iso
    ? new Date(
        new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000,
      )
        .toISOString()
        .slice(0, 16)
    : "";
const initialForm = {
  startedAt: "",
  endedAt: "",
  boardId: "",
  taskId: "",
  note: "",
  reason: "",
};

export function TimeCard({ notify }: { notify: (message: string) => void }) {
  const [entries, setEntries] = useState<Entry[]>([]),
    [options, setOptions] = useState<Options>({ boards: [], tasks: [] }),
    [manual, setManual] = useState(false),
    [editing, setEditing] = useState<Entry | null>(null),
    [form, setForm] = useState(initialForm),
    [busy, setBusy] = useState(false);
  const load = () =>
    request("/api/time")
      .then((data) => {
        setEntries(data.entries);
        setOptions(data.options);
      })
      .catch((error) => notify(error.message));
  useEffect(() => {
    void load();
    const listener = () => void load();
    window.addEventListener("northline-time-changed", listener);
    return () => window.removeEventListener("northline-time-changed", listener);
  }, []);
  const finished = entries.filter((entry) => entry.endedAt),
    today = new Date().toDateString(),
    weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const todaySeconds = finished
      .filter((entry) => new Date(entry.startedAt).toDateString() === today)
      .reduce((sum, entry) => sum + (entry.durationSeconds || 0), 0),
    weekSeconds = finished
      .filter((entry) => new Date(entry.startedAt) >= weekStart)
      .reduce((sum, entry) => sum + (entry.durationSeconds || 0), 0);
  const tasks = useMemo(
    () => options.tasks.filter((task) => String(task.boardId) === form.boardId),
    [options.tasks, form.boardId],
  );
  const openEdit = (entry: Entry) => {
    setEditing(entry);
    setManual(true);
    setForm({
      startedAt: localValue(entry.startedAt),
      endedAt: localValue(entry.endedAt),
      boardId: String(entry.boardId || ""),
      taskId: String(entry.taskId || ""),
      note: entry.note,
      reason: "",
    });
  };
  const save = async () => {
    setBusy(true);
    try {
      const body = {
        action: editing ? "correct" : "manual",
        ...form,
        startedAt: new Date(form.startedAt).toISOString(),
        endedAt: new Date(form.endedAt).toISOString(),
        boardId: form.boardId || null,
        taskId: form.taskId || null,
      };
      await request(editing ? `/api/time/${editing.id}` : "/api/time", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setManual(false);
      setEditing(null);
      setForm(initialForm);
      await load();
      window.dispatchEvent(new Event("northline-time-changed"));
      notify(editing ? "Time entry corrected" : "Manual time added");
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="content time-card-page">
      <div className="page-title">
        <div>
          <span className="eyebrow">PERSONAL TIMESHEET</span>
          <h1>My time card</h1>
          <p>
            Track work sessions, review totals, and correct your own entries.
          </p>
        </div>
        <button
          className="primary"
          onClick={() => {
            setEditing(null);
            setForm(initialForm);
            setManual(true);
          }}
        >
          ＋ Manual entry
        </button>
      </div>
      <div className="time-summary-grid">
        <article>
          <small>TODAY</small>
          <b>{formatDuration(todaySeconds)}</b>
        </article>
        <article>
          <small>THIS WEEK</small>
          <b>{formatDuration(weekSeconds)}</b>
        </article>
        <article>
          <small>ENTRIES</small>
          <b>{finished.length}</b>
        </article>
      </div>
      <div className="time-card-table">
        <div className="time-card-row time-card-head">
          <span>Date</span>
          <span>In</span>
          <span>Out</span>
          <span>Total</span>
          <span>Work</span>
          <span>Source</span>
          <span />
        </div>
        {entries.map((entry) => (
          <div
            className={`time-card-row ${!entry.endedAt ? "active" : ""}`}
            key={entry.id}
          >
            <span>{new Date(entry.startedAt).toLocaleDateString()}</span>
            <span>
              {new Date(entry.startedAt).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
            <span>
              {entry.endedAt
                ? new Date(entry.endedAt).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : "Running"}
            </span>
            <b>
              {entry.durationSeconds === null
                ? "—"
                : formatDuration(entry.durationSeconds)}
            </b>
            <span className="time-work">
              <b>{entry.taskTitle || entry.boardName || "General work"}</b>
              <small>{entry.note || entry.workspaceName || ""}</small>
            </span>
            <span>
              <i className={`source-pill ${entry.source}`}>{entry.source}</i>
            </span>
            <span>
              {entry.endedAt && (
                <button
                  className="icon-button"
                  aria-label="Correct entry"
                  onClick={() => openEdit(entry)}
                >
                  Edit
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
      {manual && (
        <div className="modal-backdrop">
          <div className="modal time-entry-modal">
            <button className="modal-close" onClick={() => setManual(false)}>
              ×
            </button>
            <h2>{editing ? "Correct time entry" : "Add manual time"}</h2>
            <p>
              {editing
                ? "Corrections are recorded in the audit history."
                : "Record work that was not captured by the timer."}
            </p>
            <div className="modal-row">
              <label>
                Time in
                <input
                  type="datetime-local"
                  value={form.startedAt}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      startedAt: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Time out
                <input
                  type="datetime-local"
                  value={form.endedAt}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      endedAt: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <label>
              Board
              <select
                value={form.boardId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    boardId: event.target.value,
                    taskId: "",
                  }))
                }
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
                value={form.taskId}
                disabled={!form.boardId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    taskId: event.target.value,
                  }))
                }
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
              <textarea
                maxLength={500}
                value={form.note}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    note: event.target.value,
                  }))
                }
              />
            </label>
            {editing && (
              <label>
                Correction reason
                <input
                  value={form.reason}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      reason: event.target.value,
                    }))
                  }
                  placeholder="Why is this being changed?"
                />
              </label>
            )}
            <button
              className="primary wide"
              disabled={
                busy ||
                !form.startedAt ||
                !form.endedAt ||
                (!!editing && form.reason.trim().length < 3)
              }
              onClick={() => void save()}
            >
              {busy ? "Saving…" : editing ? "Save correction" : "Add time"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
