/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps, @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useState } from "react";

type Calendar = {
  id: string;
  name: string;
  permission: string;
  calendarType: string;
  visibility: string;
};
type Person = {
  id: number;
  name: string;
  email: string;
  avatar: string | null;
  timezone: string;
};
type ScheduleEvent = {
  id: string;
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  timezone: string;
  kind: string;
  visibility: string;
  platform: string;
  game: string;
  streamUrl: string;
  collabEnabled: number;
  calendarId: string;
  calendarName: string;
  color: string;
  ownerId: number;
  ownerName: string;
  ownerAvatar: string | null;
  participantNames?: string[];
};
type CollabRequest = {
  id: string;
  requesterId: number;
  requesterName: string;
  requesterAvatar: string | null;
  startAt: string;
  endAt: string;
  timezone: string;
  title: string;
  message: string;
  status: string;
  responseMessage: string;
  sourceEventId: string | null;
  participants: Array<{
    userId: number;
    name: string;
    avatar: string | null;
    status: string;
    proposedStartAt: string | null;
    proposedEndAt: string | null;
    timezone: string | null;
    responseMessage: string;
  }>;
  reschedule: null | {
    id: string;
    proposedBy: number;
    proposedByName: string;
    startAt: string;
    endAt: string;
    timezone: string;
    message: string;
    status: string;
    responses: Array<{ userId: number; name: string; status: string }>;
  };
};
const jsonHeaders = { "Content-Type": "application/json" };
const call = async (url: string, options?: RequestInit) => {
  const response = await fetch(url, options),
    body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body;
};
const localInput = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const blank = () => {
  const start = new Date(Date.now() + 86400000);
  start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 7200000);
  return {
    recipientIds: [] as string[],
    calendarId: "",
    sourceEventId: "",
    title: "Collaboration stream",
    message: "",
    startAt: localInput(start),
    endAt: localInput(end),
  };
};

export function CollabPlanner({
  notify,
}: {
  notify: (message: string) => void;
}) {
  const [events, setEvents] = useState<ScheduleEvent[]>([]),
    [people, setPeople] = useState<Person[]>([]),
    [calendars, setCalendars] = useState<Calendar[]>([]),
    [requests, setRequests] = useState<CollabRequest[]>([]),
    [me, setMe] = useState(0),
    [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<
      "request" | "availability" | "reschedule" | null
    >(null),
    [form, setForm] = useState(blank()),
    [rescheduling, setRescheduling] = useState<CollabRequest | null>(null),
    [responseCalendars, setResponseCalendars] = useState<
      Record<string, string>
    >({});
  const ownedStreaming = calendars.filter(
    (c) => c.calendarType === "streaming" && c.permission !== "viewer",
  );
  const load = async () => {
    setLoading(true);
    try {
      const start = new Date(),
        end = new Date(Date.now() + 90 * 86400000);
      const [schedule, requestData, calendarData] = await Promise.all([
        call(
          `/api/collab/schedule?from=${start.toISOString()}&to=${end.toISOString()}`,
        ),
        call("/api/collab/requests"),
        call("/api/calendars"),
      ]);
      setEvents(schedule.events);
      setPeople(schedule.people);
      setRequests(requestData.requests);
      setMe(requestData.currentUserId);
      setCalendars(calendarData.calendars);
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const incoming = requests.filter((r) =>
      r.participants.some((p) => p.userId === me),
    ),
    outgoing = requests.filter((r) => r.requesterId === me);
  const grouped = useMemo(
    () =>
      Object.entries(
        events.reduce<Record<string, ScheduleEvent[]>>((all, event) => {
          const key = new Date(event.startAt).toLocaleDateString([], {
            weekday: "long",
            month: "long",
            day: "numeric",
          });
          (all[key] ||= []).push(event);
          return all;
        }, {}),
      ),
    [events],
  );
  const openRequest = (event?: ScheduleEvent) => {
    const next = blank();
    if (event) {
      next.recipientIds = [String(event.ownerId)];
      next.sourceEventId = event.id;
      next.title = `Collab with ${event.ownerName}`;
      next.startAt = localInput(new Date(event.startAt));
      next.endAt = localInput(new Date(event.endAt));
    }
    next.calendarId = ownedStreaming[0]?.id || "";
    setForm(next);
    setModal("request");
  };
  const submitRequest = async () => {
    try {
      await call("/api/collab/requests", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          ...form,
          recipientIds: form.recipientIds.map(Number),
          startAt: new Date(form.startAt).toISOString(),
          endAt: new Date(form.endAt).toISOString(),
          timezone: zone,
        }),
      });
      setModal(null);
      notify("Collaboration request sent");
      await load();
    } catch (error) {
      notify((error as Error).message);
    }
  };
  const offer = async () => {
    try {
      await call(`/api/calendars/${form.calendarId}/events`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          title: form.title || "Available for collabs",
          description: form.message,
          startAt: new Date(form.startAt).toISOString(),
          endAt: new Date(form.endAt).toISOString(),
          timezone: zone,
          kind: "availability",
          visibility: "team",
          collabEnabled: true,
          status: "confirmed",
        }),
      });
      setModal(null);
      notify("Availability published to the team schedule");
      await load();
    } catch (error) {
      notify((error as Error).message);
    }
  };
  const respond = async (
    item: CollabRequest,
    action: string,
    participantUserId?: number,
  ) => {
    try {
      const body: Record<string, unknown> = {
        action,
        participantUserId,
        calendarId:
          responseCalendars[item.id] ||
          ownedStreaming[0]?.id ||
          calendars.find((c) => c.permission !== "viewer")?.id,
      };
      if (action === "counter") {
        const start = window.prompt(
          "New start (YYYY-MM-DD HH:MM)",
          localInput(new Date(item.startAt)).replace("T", " "),
        );
        const end = window.prompt(
          "New end (YYYY-MM-DD HH:MM)",
          localInput(new Date(item.endAt)).replace("T", " "),
        );
        if (!start || !end) return;
        body.startAt = new Date(start).toISOString();
        body.endAt = new Date(end).toISOString();
        body.timezone = zone;
      }
      await call(`/api/collab/requests/${item.id}`, {
        method: "PATCH",
        headers: jsonHeaders,
        body: JSON.stringify(body),
      });
      notify(`Collaboration request ${action}ed`);
      await load();
    } catch (error) {
      notify((error as Error).message);
    }
  };
  const openReschedule = (item: CollabRequest) => {
    const next = blank();
    next.title = `Reschedule ${item.title}`;
    next.startAt = localInput(new Date(item.startAt));
    next.endAt = localInput(new Date(item.endAt));
    setForm(next);
    setRescheduling(item);
    setModal("reschedule");
  };
  const submitReschedule = async () => {
    if (!rescheduling) return;
    try {
      await call(`/api/collab/requests/${rescheduling.id}/reschedule`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          startAt: new Date(form.startAt).toISOString(),
          endAt: new Date(form.endAt).toISOString(),
          timezone: zone,
          message: form.message,
        }),
      });
      setModal(null);
      setRescheduling(null);
      notify("New collab time proposed");
      await load();
    } catch (error) {
      notify((error as Error).message);
    }
  };
  const respondReschedule = async (
    item: CollabRequest,
    action: "accept" | "decline",
  ) => {
    if (!item.reschedule) return;
    try {
      await call(`/api/collab/reschedule/${item.reschedule.id}`, {
        method: "PATCH",
        headers: jsonHeaders,
        body: JSON.stringify({ action }),
      });
      notify(action === "accept" ? "New time accepted" : "New time declined");
      await load();
    } catch (error) {
      notify((error as Error).message);
    }
  };
  return (
    <div className="collab-planner">
      <header className="collab-hero">
        <div>
          <span className="eyebrow">STREAMER COLLABORATION</span>
          <h2>Team stream schedule</h2>
          <p>
            Share only the schedule windows you choose, find open time, and
            coordinate collabs without exposing private calendars.
          </p>
        </div>
        <div>
          <button className="secondary" onClick={() => void load()}>
            Refresh
          </button>
          <button
            className="secondary"
            onClick={() => {
              const next = blank();
              next.calendarId = ownedStreaming[0]?.id || "";
              next.title = "Available for collabs";
              setForm(next);
              setModal("availability");
            }}
          >
            ＋ Availability
          </button>
          <button className="primary" onClick={() => openRequest()}>
            Request collab
          </button>
        </div>
      </header>
      {!ownedStreaming.length && (
        <div className="collab-callout">
          <b>Create a team-visible streaming calendar first.</b>
          <span>
            In Calendar settings, choose “Streaming schedule” and Team
            visibility. Your personal calendars stay private.
          </span>
        </div>
      )}
      <section className="collab-grid">
        <div className="collab-schedule">
          <h3>Next 90 days</h3>
          {loading ? (
            <p>Loading schedule…</p>
          ) : grouped.length ? (
            grouped.map(([day, items]) => (
              <section key={day}>
                <header>{day}</header>
                {items.map((event) => (
                  <article key={event.id}>
                    <span className="avatar">
                      {event.ownerAvatar ? (
                        <img src={event.ownerAvatar} alt="" />
                      ) : (
                        event.ownerName.slice(0, 1)
                      )}
                    </span>
                    <div>
                      <b>{event.title}</b>
                      <small>
                        {event.ownerName} ·{" "}
                        {new Date(event.startAt).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                        –
                        {new Date(event.endAt).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </small>
                      {event.participantNames?.length ? (
                        <small>With {event.participantNames.join(", ")}</small>
                      ) : null}
                      <em>
                        {[event.kind, event.platform, event.game]
                          .filter(Boolean)
                          .join(" · ")}
                      </em>
                    </div>
                    {event.ownerId !== me && event.collabEnabled === 1 && (
                      <button
                        className="secondary"
                        onClick={() => openRequest(event)}
                      >
                        Ask to collab
                      </button>
                    )}
                  </article>
                ))}
              </section>
            ))
          ) : (
            <div className="calendar-empty">
              <b>No team schedule entries yet</b>
              <span>
                Publish an availability window or a stream from a team-visible
                streaming calendar.
              </span>
            </div>
          )}
        </div>
        <aside className="collab-inbox">
          <h3>Collab inbox</h3>
          {incoming.map((item) => (
            <RequestCard
              key={item.id}
              item={item}
              incoming
              calendars={calendars}
              selected={responseCalendars[item.id] || ""}
              select={(value) =>
                setResponseCalendars((current) => ({
                  ...current,
                  [item.id]: value,
                }))
              }
              respond={respond}
              currentUserId={me}
              openReschedule={openReschedule}
              respondReschedule={respondReschedule}
            />
          ))}
          {!incoming.length && <p>No incoming requests.</p>}
          <h3>Sent requests</h3>
          {outgoing.map((item) => (
            <RequestCard
              key={item.id}
              item={item}
              calendars={calendars}
              selected=""
              select={() => {}}
              respond={respond}
              currentUserId={me}
              openReschedule={openReschedule}
              respondReschedule={respondReschedule}
            />
          ))}
          {!outgoing.length && <p>No sent requests.</p>}
        </aside>
      </section>
      {modal && (
        <div className="modal-backdrop">
          <div className="modal calendar-modal">
            <button className="modal-close" onClick={() => setModal(null)}>
              ×
            </button>
            <h2>
              {modal === "availability"
                ? "Share availability"
                : modal === "reschedule"
                  ? "Propose a new collab time"
                  : "Request a collaboration"}
            </h2>
            <p>Times are shown in {zone} and stored in UTC.</p>
            {modal === "request" && (
              <label>
                Invited streamers
                <div className="collab-person-picker">
                  {people
                    .filter((p) => p.id !== me)
                    .map((p) => (
                      <label key={p.id}>
                        <input
                          type="checkbox"
                          checked={form.recipientIds.includes(String(p.id))}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              recipientIds: e.target.checked
                                ? [...form.recipientIds, String(p.id)]
                                : form.recipientIds.filter(
                                    (id) => id !== String(p.id),
                                  ),
                            })
                          }
                        />
                        <span className="avatar">
                          {p.avatar ? (
                            <img src={p.avatar} alt="" />
                          ) : (
                            p.name.slice(0, 1)
                          )}
                        </span>
                        <span>
                          {p.name}
                          <small>{p.timezone}</small>
                        </span>
                      </label>
                    ))}
                </div>
              </label>
            )}
            {modal !== "reschedule" && (
              <label>
                Your streaming calendar
                <select
                  value={form.calendarId}
                  onChange={(e) =>
                    setForm({ ...form, calendarId: e.target.value })
                  }
                >
                  <option value="">Choose a calendar</option>
                  {ownedStreaming.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {modal !== "reschedule" && (
              <label>
                {modal === "availability" ? "Label" : "Collab idea"}
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </label>
            )}
            <div className="modal-row">
              <label>
                Starts
                <input
                  type="datetime-local"
                  value={form.startAt}
                  onChange={(e) =>
                    setForm({ ...form, startAt: e.target.value })
                  }
                />
              </label>
              <label>
                Ends
                <input
                  type="datetime-local"
                  value={form.endAt}
                  onChange={(e) => setForm({ ...form, endAt: e.target.value })}
                />
              </label>
            </div>
            <label>
              Details
              <textarea
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                placeholder={
                  modal === "reschedule"
                    ? "Why is a new time needed?"
                    : "Game, format, participants, or anything the team should know"
                }
              />
            </label>
            <div className="modal-actions">
              <button className="secondary" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button
                className="primary"
                disabled={
                  (modal !== "reschedule" && !form.calendarId) ||
                  (modal === "request" && !form.recipientIds.length)
                }
                onClick={() =>
                  void (modal === "availability"
                    ? offer()
                    : modal === "reschedule"
                      ? submitReschedule()
                      : submitRequest())
                }
              >
                {modal === "availability"
                  ? "Publish availability"
                  : modal === "reschedule"
                    ? "Propose new time"
                    : "Send request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RequestCard({
  item,
  incoming = false,
  calendars,
  selected,
  select,
  respond,
  currentUserId,
  openReschedule,
  respondReschedule,
}: {
  item: CollabRequest;
  incoming?: boolean;
  calendars: Calendar[];
  selected: string;
  select: (value: string) => void;
  respond: (
    item: CollabRequest,
    action: string,
    participantUserId?: number,
  ) => Promise<void>;
  currentUserId: number;
  openReschedule: (item: CollabRequest) => void;
  respondReschedule: (
    item: CollabRequest,
    action: "accept" | "decline",
  ) => Promise<void>;
}) {
  const open = ["pending", "countered"].includes(item.status);
  const myParticipant = item.participants.find(
    (p) => p.userId === currentUserId,
  );
  return (
    <article className="collab-request">
      <header>
        <b>{item.title}</b>
        <span className={`request-status ${item.status}`}>{item.status}</span>
      </header>
      <small>
        {incoming
          ? `From ${item.requesterName}`
          : `${item.participants.length} invited streamer${item.participants.length === 1 ? "" : "s"}`}{" "}
        ·{" "}
        {new Date(item.startAt).toLocaleString([], {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}
      </small>
      {item.message && <p>{item.message}</p>}
      <div className="collab-participants">
        {item.participants.map((p) => (
          <span key={p.userId} title={`${p.name}: ${p.status}`}>
            <span className="avatar">
              {p.avatar ? <img src={p.avatar} alt="" /> : p.name.slice(0, 1)}
            </span>
            <small>{p.name}</small>
            <em className={`request-status ${p.status}`}>{p.status}</em>
          </span>
        ))}
      </div>
      {item.reschedule && (
        <section className="collab-reschedule">
          <b>New time proposed by {item.reschedule.proposedByName}</b>
          <small>
            {new Date(item.reschedule.startAt).toLocaleString([], {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
            –
            {new Date(item.reschedule.endAt).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
          </small>
          {item.reschedule.message && <p>{item.reschedule.message}</p>}
          <div className="reschedule-responses">
            {item.reschedule.responses.map((response) => (
              <span key={response.userId}>
                {response.name}: {response.status}
              </span>
            ))}
          </div>
          {item.reschedule.responses.some(
            (response) =>
              response.userId === currentUserId &&
              response.status === "pending",
          ) && (
            <div>
              <button
                className="primary"
                onClick={() => void respondReschedule(item, "accept")}
              >
                Accept new time
              </button>
              <button
                className="secondary"
                onClick={() => void respondReschedule(item, "decline")}
              >
                Can&apos;t make it
              </button>
            </div>
          )}
        </section>
      )}
      {incoming && myParticipant?.status === "pending" && (
        <>
          <select value={selected} onChange={(e) => select(e.target.value)}>
            <option value="">Calendar for accepted event</option>
            {calendars
              .filter((c) => c.permission !== "viewer")
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
          <div>
            <button
              className="primary"
              onClick={() => void respond(item, "accept")}
            >
              Accept
            </button>
            <button
              className="secondary"
              onClick={() => void respond(item, "counter")}
            >
              New time
            </button>
            <button
              className="secondary"
              onClick={() => void respond(item, "decline")}
            >
              Decline
            </button>
          </div>
        </>
      )}
      {!incoming && open && (
        <div>
          {item.participants
            .filter((p) => p.status === "countered")
            .map((p) => (
              <button
                key={p.userId}
                className="primary"
                onClick={() => void respond(item, "accept", p.userId)}
              >
                Accept {p.name}&apos;s new time
              </button>
            ))}
          <button
            className="secondary"
            onClick={() => void respond(item, "cancel")}
          >
            Cancel request
          </button>
        </div>
      )}
      {item.status === "accepted" && !item.reschedule && (
        <button
          className="secondary wide collab-reschedule-button"
          onClick={() => openReschedule(item)}
          title="I can't make this time — propose another"
        >
          Reschedule collab
        </button>
      )}
    </article>
  );
}
