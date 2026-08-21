"use client";
/* eslint-disable react-hooks/exhaustive-deps */

import { useEffect, useMemo, useState } from "react";
import { apiErrorMessage, resilientFetch } from "./client-fetch";

type ReminderStatus = "pending" | "sent" | "failed" | "cancelled";
type Reminder = {
  id: number;
  boardId: number;
  taskId: number | null;
  channelId: string;
  channelName: string;
  message: string;
  remindAt: string;
  status: ReminderStatus;
  error: string | null;
  createdAt: string;
  sentAt: string | null;
  boardName: string;
  taskTitle: string | null;
  canManage: number;
  kind: "scheduled" | "automatic";
  eventType: string | null;
};

async function request(url: string, options?: RequestInit) {
  const response = await resilientFetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(apiErrorMessage(response, data, "Something went wrong"));
  return data;
}
function localInput(iso: string) {
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
function timeParts(iso: string) {
  const date = new Date(iso),
    hours = date.getHours();
  return {
    date: localInput(iso).slice(0, 10),
    hour: String(hours % 12 || 12),
    minute: String(date.getMinutes()).padStart(2, "0"),
    period: hours >= 12 ? "PM" : "AM",
  };
}
function displayTime(iso: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function ReminderCenter({
  notify,
}: {
  notify: (message: string) => void;
}) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ReminderStatus | "all">("all");
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      setReminders((await request("/api/reminders")).reminders || []);
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    request("/api/reminders")
      .then((data) => setReminders(data.reminders || []))
      .catch((error) => notify(error.message))
      .finally(() => setLoading(false));
  }, []);
  const shown = useMemo(
    () =>
      reminders.filter((item) => filter === "all" || item.status === filter),
    [reminders, filter],
  );
  const count = (status: ReminderStatus) =>
    reminders.filter((item) => item.status === status).length;
  const act = async (action: () => Promise<void>, message: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      await load();
      notify(message);
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="content reminder-page">
      <div className="page-title">
        <div>
          <div className="eyebrow">TASK BUDDY</div>
          <h1>Reminder center</h1>
          <p>
            Track every scheduled private Discord delivery from creation through
            completion.
          </p>
        </div>
        <button className="secondary" onClick={() => void load()}>
          ↻ Refresh
        </button>
      </div>
      <div className="reminder-metrics">
        <Metric label="Scheduled" value={count("pending")} tone="purple" />
        <Metric label="Delivered" value={count("sent")} tone="green" />
        <Metric label="Needs attention" value={count("failed")} tone="red" />
        <Metric label="Cancelled" value={count("cancelled")} tone="gray" />
      </div>
      <div className="reminder-panel">
        <div className="reminder-filters">
          {(["all", "pending", "sent", "failed", "cancelled"] as const).map(
            (status) => (
              <button
                key={status}
                className={filter === status ? "active" : ""}
                onClick={() => setFilter(status)}
              >
                {status === "all"
                  ? "All"
                  : status[0].toUpperCase() + status.slice(1)}{" "}
                <span>
                  {status === "all" ? reminders.length : count(status)}
                </span>
              </button>
            ),
          )}
        </div>
        {loading ? (
          <div className="reminder-empty">Loading reminders…</div>
        ) : shown.length === 0 ? (
          <div className="reminder-empty">
            <b>
              No{" "}
              {filter === "all" ? "notifications" : filter + " notifications"}
            </b>
            <span>
              Scheduled reminders and automatic Task Buddy activity will appear
              here.
            </span>
          </div>
        ) : (
          <div className="reminder-list">
            {shown.map((item) => (
              <article className="reminder-item" key={item.id}>
                <div className={`reminder-status ${item.status}`}>
                  <i />
                  {item.status}
                </div>
                <div className="reminder-copy">
                  <div>
                    <b>{item.boardName}</b>
                    {item.taskTitle && <span>· {item.taskTitle}</span>}
                    {item.kind === "automatic" && (
                      <span>· {item.eventType}</span>
                    )}
                  </div>
                  <p>{item.message}</p>
                  <small>
                    {item.channelName} ·{" "}
                    {item.status === "sent" && item.sentAt
                      ? `Delivered ${displayTime(item.sentAt)}`
                      : `Scheduled ${displayTime(item.remindAt)}`}
                  </small>
                  {item.error && (
                    <div className="reminder-error">{item.error}</div>
                  )}
                </div>
                <div className="reminder-actions">
                  {item.canManage === 1 &&
                    item.kind === "scheduled" &&
                    item.status === "pending" && (
                      <>
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() => setEditing(item)}
                        >
                          Edit
                        </button>
                        <button
                          className="danger subtle"
                          disabled={busy}
                          onClick={() => {
                            if (confirm("Cancel this reminder?"))
                              void act(
                                () =>
                                  request(`/api/reminders/${item.id}`, {
                                    method: "DELETE",
                                  }),
                                "Reminder cancelled",
                              );
                          }}
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  {item.canManage === 1 && item.status === "failed" && (
                    <>
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() =>
                          void act(
                            () =>
                              request(`/api/reminders/${item.id}/retry`, {
                                method: "POST",
                              }),
                            "Notification queued for retry",
                          )
                        }
                      >
                        Retry now
                      </button>
                      <button
                        className="danger subtle"
                        disabled={busy}
                        onClick={() =>
                          void act(
                            () =>
                              request(`/api/reminders/${item.id}`, {
                                method: "DELETE",
                              }),
                            "Notification cancelled",
                          )
                        }
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
      {editing && (
        <EditReminder
          reminder={editing}
          close={() => setEditing(null)}
          saved={async () => {
            setEditing(null);
            await load();
            notify("Reminder updated");
          }}
          notify={notify}
        />
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className={`reminder-metric ${tone}`}>
      <span>{label}</span>
      <b>{value}</b>
      <i />
    </div>
  );
}

function EditReminder({
  reminder,
  close,
  saved,
  notify,
}: {
  reminder: Reminder;
  close: () => void;
  saved: () => Promise<void>;
  notify: (message: string) => void;
}) {
  const initial = timeParts(reminder.remindAt);
  const [message, setMessage] = useState(reminder.message);
  const [date, setDate] = useState(initial.date);
  const [hour, setHour] = useState(initial.hour);
  const [minute, setMinute] = useState(initial.minute);
  const [period, setPeriod] = useState(initial.period);
  const [busy, setBusy] = useState(false);
  const when = () =>
    new Date(
      `${date}T${String((Number(hour) % 12) + (period === "PM" ? 12 : 0)).padStart(2, "0")}:${minute}`,
    ).toISOString();
  const dirty =
    message !== reminder.message ||
    date !== initial.date ||
    hour !== initial.hour ||
    minute !== initial.minute ||
    period !== initial.period;
  const safeClose = () => {
    if (dirty && !confirm("Discard your unsaved changes?")) return;
    close();
  };
  const save = async () => {
    setBusy(true);
    try {
      await request(`/api/reminders/${reminder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, remindAt: when() }),
      });
      await saved();
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <button className="modal-close" onClick={safeClose}>
          ×
        </button>
        <span className="modal-icon discord-bg">#</span>
        <h2>Edit reminder</h2>
        <p>
          Update the time or message before Task Buddy sends the private DM.
        </p>
        <label>
          Date
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <fieldset className="time-field">
          <legend>Time</legend>
          <div>
            <select
              aria-label="Hour"
              value={hour}
              onChange={(event) => setHour(event.target.value)}
            >
              {Array.from({ length: 12 }, (_, index) => index + 1).map(
                (value) => (
                  <option key={value}>{value}</option>
                ),
              )}
            </select>
            <select
              aria-label="Minute"
              value={minute}
              onChange={(event) => setMinute(event.target.value)}
            >
              {Array.from({ length: 60 }, (_, index) =>
                String(index).padStart(2, "0"),
              ).map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
            <select
              aria-label="AM or PM"
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
            >
              <option>AM</option>
              <option>PM</option>
            </select>
          </div>
        </fieldset>
        <label>
          Message
          <textarea
            maxLength={1800}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
          <small>{message.length}/1,800</small>
        </label>
        <button
          className="discord-button wide"
          disabled={busy || !date || !message.trim()}
          onClick={() => void save()}
        >
          {busy ? "Saving…" : "Save reminder"}
        </button>
      </div>
    </div>
  );
}
