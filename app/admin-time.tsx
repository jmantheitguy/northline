"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps */

import { useEffect, useState } from "react";
import { formatDuration } from "./time-clock";

export function AdminTime({ notify }: { notify: (message: string) => void }) {
  const [data, setData] = useState<any>(null),
    [query, setQuery] = useState("");
  useEffect(() => {
    fetch("/api/admin/time")
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        setData(body);
      })
      .catch((error) => notify(error.message));
  }, []);
  if (!data) return <div className="admin-empty">Loading time data…</div>;
  const totals = data.totals.filter((item: any) =>
    item.userName.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="admin-time">
      <div className="admin-toolbar">
        <div className="global-search">
          ⌕
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search time cards…"
          />
        </div>
      </div>
      <div className="admin-time-summary">
        {totals.map((item: any) => (
          <article key={item.userId}>
            <span className="avatar">
              {item.userName.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <b>{item.userName}</b>
              <small>
                {item.activeSince
                  ? `Clocked in since ${new Date(item.activeSince).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                  : "Not clocked in"}
              </small>
            </div>
            <span>
              <small>LAST 7 DAYS</small>
              <b>{formatDuration(item.weekSeconds)}</b>
            </span>
            <span>
              <small>ALL RECORDED</small>
              <b>{formatDuration(item.totalSeconds)}</b>
            </span>
          </article>
        ))}
      </div>
      <h3>Recent organization time</h3>
      <div className="time-card-table admin-time-table">
        <div className="time-card-row time-card-head">
          <span>User</span>
          <span>In</span>
          <span>Out</span>
          <span>Total</span>
          <span>Work</span>
          <span>Source</span>
          <span />
        </div>
        {data.entries.slice(0, 250).map((entry: any) => (
          <div className="time-card-row" key={entry.id}>
            <span>{entry.userName}</span>
            <span>{new Date(entry.startedAt).toLocaleString()}</span>
            <span>
              {entry.endedAt
                ? new Date(entry.endedAt).toLocaleString()
                : "Running"}
            </span>
            <b>
              {entry.durationSeconds === null
                ? "—"
                : formatDuration(entry.durationSeconds)}
            </b>
            <span className="time-work">
              <b>{entry.taskTitle || entry.boardName || "General"}</b>
              <small>{entry.note}</small>
            </span>
            <span>
              <i className={`source-pill ${entry.source}`}>{entry.source}</i>
            </span>
            <span />
          </div>
        ))}
      </div>
    </div>
  );
}
