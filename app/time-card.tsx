"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import { useEffect, useMemo, useState } from "react";
import { formatDuration } from "./time-clock";
import { apiErrorMessage, resilientFetch } from "./client-fetch";
import { browserTimezone, localInput, shiftEndWithStartChange } from "./date-time";

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
  const response = await resilientFetch(url, options),
    data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(apiErrorMessage(response, data, "Time card request failed"));
  return data;
};
const localValue = (iso?: string | null, timezone = browserTimezone) =>
  iso ? localInput(new Date(iso), timezone) : "";
const localNow = (offsetMinutes = 0, timezone = browserTimezone) => {
  return localInput(new Date(Date.now() + offsetMinutes * 60000), timezone);
};
function TimePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [date = "", time = "12:00"] = value.split("T"),
    [rawHour = "12", minute = "00"] = time.split(":"),
    hour24 = Number(rawHour),
    hour = String(hour24 % 12 || 12),
    period = hour24 >= 12 ? "PM" : "AM";
  const update = (
    nextDate: string,
    nextHour: string,
    nextMinute: string,
    nextPeriod: string,
  ) => {
    const converted = (Number(nextHour) % 12) + (nextPeriod === "PM" ? 12 : 0);
    onChange(`${nextDate}T${String(converted).padStart(2, "0")}:${nextMinute}`);
  };
  return (
    <fieldset className="manual-time-field">
      <legend>{label}</legend>
      <input
        aria-label={`${label} date`}
        type="date"
        value={date}
        onChange={(event) => update(event.target.value, hour, minute, period)}
      />
      <div>
        <select
          aria-label={`${label} hour`}
          value={hour}
          onChange={(event) => update(date, event.target.value, minute, period)}
        >
          {Array.from({ length: 12 }, (_, index) => index + 1).map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select
          aria-label={`${label} minute`}
          value={minute}
          onChange={(event) => update(date, hour, event.target.value, period)}
        >
          {Array.from({ length: 60 }, (_, index) =>
            String(index).padStart(2, "0"),
          ).map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select
          aria-label={`${label} AM or PM`}
          value={period}
          onChange={(event) => update(date, hour, minute, event.target.value)}
        >
          <option>AM</option>
          <option>PM</option>
        </select>
      </div>
    </fieldset>
  );
}
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
    [deleted, setDeleted] = useState<Entry[]>([]),
    [options, setOptions] = useState<Options>({ boards: [], tasks: [] }),
    [timezone, setTimezone] = useState(browserTimezone),
    [manual, setManual] = useState(false),
    [editing, setEditing] = useState<Entry | null>(null),
    [form, setForm] = useState(initialForm),
    [busy, setBusy] = useState(false),
    [filters, setFilters] = useState({ from: "", to: "", boardId: "", taskId: "" });
  const filterQuery = () => {
    const query = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => value && query.set(key, value));
    return query.toString();
  };
  const load = () =>
    request(`/api/time?${filterQuery()}`)
      .then((data) => {
        setTimezone(data.timezone || browserTimezone);
        setEntries(data.entries);
        setDeleted(data.deleted || []);
        setOptions(data.options);
      })
      .catch((error) => notify(error.message));
  useEffect(() => {
    const listener = () => void load();
    window.addEventListener("northline-time-changed", listener);
    return () => window.removeEventListener("northline-time-changed", listener);
  }, [filters]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(timer);
  }, [filters]);
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
      startedAt: localValue(entry.startedAt, timezone),
      endedAt: localValue(entry.endedAt, timezone),
      boardId: String(entry.boardId || ""),
      taskId: String(entry.taskId || ""),
      note: entry.note,
      reason: "",
    });
  };
  const remove = async (entry: Entry) => {
    if (
      !window.confirm(
        "Delete this time entry? Its audit record will be retained.",
      )
    )
      return;
    try {
      await request(`/api/time/${entry.id}`, { method: "DELETE" });
      await load();
      window.dispatchEvent(new Event("northline-time-changed"));
      notify("Time entry deleted");
    } catch (error) {
      notify((error as Error).message);
    }
  };
  const restore = async (entry: Entry) => {
    try {
      await request(`/api/time/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore" }),
      });
      await load();
      window.dispatchEvent(new Event("northline-time-changed"));
      notify("Time entry restored");
    } catch (error) {
      notify((error as Error).message);
    }
  };
  const save = async () => {
    setBusy(true);
    try {
      const body = {
        action: editing ? "correct" : "manual",
        ...form,
        startedAt: form.startedAt,
        endedAt: form.endedAt,
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
  const updateTimeIn = (value: string) => {
    setForm((current) => {
      let endedAt = current.endedAt;
      if (current.startedAt && current.endedAt) {
        endedAt = shiftEndWithStartChange(current.startedAt, current.endedAt, value);
      }
      return { ...current, startedAt: value, endedAt };
    });
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
            setForm({
              ...initialForm,
              startedAt: localNow(0, timezone),
              endedAt: localNow(60, timezone),
            });
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
      <div className="time-report-filters">
        <label>From<input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} /></label>
        <label>To<input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} /></label>
        <label>Board<select value={filters.boardId} onChange={(event) => setFilters((current) => ({ ...current, boardId: event.target.value, taskId: "" }))}>
          <option value="">All boards</option>
          {options.boards.map((board) => <option key={board.id} value={board.id}>{board.workspaceName} · {board.name}</option>)}
        </select></label>
        <label>Task<select value={filters.taskId} disabled={!filters.boardId} onChange={(event) => setFilters((current) => ({ ...current, taskId: event.target.value }))}>
          <option value="">All tasks</option>
          {options.tasks.filter((task) => String(task.boardId) === filters.boardId).map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
        </select></label>
        <a className="secondary export-link" href={`/api/time?${filterQuery()}&format=csv`}>Export CSV</a>
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
            <span>{new Date(entry.startedAt).toLocaleDateString([], { timeZone: timezone })}</span>
            <span>
              {new Date(entry.startedAt).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
                timeZone: timezone,
              })}
            </span>
            <span>
              {entry.endedAt
                ? new Date(entry.endedAt).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                    timeZone: timezone,
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
                <span className="time-entry-actions">
                  <button
                    className="icon-button"
                    aria-label="Correct entry"
                    onClick={() => openEdit(entry)}
                  >
                    Edit
                  </button>
                  <button
                    className="icon-button danger-text"
                    aria-label="Delete entry"
                    onClick={() => void remove(entry)}
                  >
                    Delete
                  </button>
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
      {deleted.length > 0 && (
        <details className="deleted-time-entries">
          <summary>Recently deleted ({deleted.length})</summary>
          <p>Deleted entries remain recoverable here for 30 days.</p>
          {deleted.map((entry) => (
            <div key={entry.id}>
              <span>{new Date(entry.startedAt).toLocaleString([], { timeZone: timezone })} · {entry.taskTitle || entry.boardName || "General work"}</span>
              <button className="secondary" onClick={() => void restore(entry)}>Restore</button>
            </div>
          ))}
        </details>
      )}
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
              <TimePicker
                label="Time in"
                value={form.startedAt}
                onChange={updateTimeIn}
              />
              <TimePicker
                label="Time out"
                value={form.endedAt}
                onChange={(value) =>
                  setForm((current) => ({ ...current, endedAt: value }))
                }
              />
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
