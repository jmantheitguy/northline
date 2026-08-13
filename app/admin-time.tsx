"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps */

import { useEffect, useState } from "react";
import { formatDuration } from "./time-clock";

export function AdminTime({ notify }: { notify: (message: string) => void }) {
  const [data, setData] = useState<any>(null),
    [query, setQuery] = useState(""),
    [filters, setFilters] = useState({ userId: "", from: "", to: "" });
  const filterQuery = () => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => value && params.set(key, value));
    return params.toString();
  };
  const load = () =>
    fetch(`/api/admin/time?${filterQuery()}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        setData(body);
      })
      .catch((error) => notify(error.message));
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(timer);
  }, [filters]);
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
        <div className="time-report-filters compact">
          <label>User<select value={filters.userId} onChange={(event) => setFilters((current) => ({ ...current, userId: event.target.value }))}>
            <option value="">All users</option>
            {data.totals.map((item: any) => <option key={item.userId} value={item.userId}>{item.userName}</option>)}
          </select></label>
          <label>From<input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} /></label>
          <label>To<input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} /></label>
          <a className="secondary export-link" href={`/api/admin/time?${filterQuery()}&format=csv`}>Export CSV</a>
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
      <details className="time-audit-panel">
        <summary>Time-entry audit history ({data.audit.length})</summary>
        {data.audit.map((item: any) => (
          <div key={item.id}>
            <b>{item.action}</b>
            <span>Entry #{item.entryId} · {item.actorName || "System"}</span>
            <small>{new Date(`${item.createdAt}Z`).toLocaleString()}{item.reason ? ` · ${item.reason}` : ""}</small>
          </div>
        ))}
      </details>
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
