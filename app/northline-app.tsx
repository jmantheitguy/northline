/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect, react-hooks/exhaustive-deps, jsx-a11y/no-autofocus, jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-static-element-interactions */
"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { NORTHLINE_VERSION } from "@/lib/version";
import { ReminderCenter } from "./reminder-center";

type Status = "ideas" | "ready" | "progress" | "hold" | "done";
type Priority = "Low" | "Medium" | "High";
type Task = {
  id: number;
  title: string;
  description: string;
  status: Status;
  ownerId: number | null;
  ownerName: string | null;
  ownerAvatar: string | null;
  due: string | null;
  tag: string;
  priority: Priority;
  comments: number;
};
type BoardSummary = {
  id: number;
  name: string;
  description: string;
  ownerId: number;
  ownerName: string;
  permission: "owner" | "admin" | "editor" | "viewer";
  taskCount: number;
};
type Member = {
  id: number;
  name: string;
  email: string;
  avatar: string | null;
  permission: "viewer" | "editor";
};
type BoardDetail = {
  board: { id: number; name: string; description: string; ownerId: number };
  tasks: Task[];
  members: Member[];
  permission: string;
  canEdit: boolean;
  canShare: boolean;
  notifications?: {channelId:string;channelName:string;assignmentEnabled:number;statusEnabled:number;commentEnabled:number;mentionEnabled:number;dueEnabled:number;dueWarningHours:number};
};
type WorkspaceUser = {
  id: number;
  name: string;
  email: string;
  avatar: string | null;
  role: "Admin" | "Member" | "Guest";
  status: "Active" | "Invited" | "Suspended";
  boards: number;
  initials: string;
  color: string;
  authSource?: "local" | "oidc";
};
type SessionUser = {
  id: number;
  name: string;
  email: string;
  avatar: string | null;
  role: "Admin" | "Member" | "Guest";
};
type Modal =
  | "task-create"
  | "task-detail"
  | "board-create"
  | "board-settings"
  | "share"
  | "reminder"
  | null;
type View = "board" | "directory" | "reminders" | "settings" | "admin";
type BoardMode = "board" | "list" | "timeline" | "calendar";

const columns: { id: Status; label: string; color: string }[] = [
  { id: "ideas", label: "Ideas", color: "#a78bfa" },
  { id: "ready", label: "Ready", color: "#60a5fa" },
  { id: "progress", label: "In progress", color: "#f59e0b" },
  { id: "hold", label: "On hold", color: "#f472b6" },
  { id: "done", label: "Done", color: "#34d399" },
];

function BrandMark({ priority = false }: { priority?: boolean }) {
  return (
    <Image
      className="brand-mark brand-image"
      src="/brand/northline-mark.png"
      alt=""
      width={40}
      height={40}
      priority={priority}
    />
  );
}
const emptyTask = {
  title: "",
  description: "",
  status: "ideas" as Status,
  priority: "Medium" as Priority,
  tag: "General",
  dueDate: "",
  assigneeId: "",
};

function decorateUsers(list: any[]): WorkspaceUser[] {
  return list.map((u) => ({
    ...u,
    boards: Number(u.boards || 0),
    initials: String(u.name)
      .split(" ")
      .map((x: string) => x[0])
      .join("")
      .slice(0, 2)
      .toUpperCase(),
    color:
      u.role === "Admin"
        ? "#7961e8"
        : u.role === "Member"
          ? "#2f9dde"
          : "#ef9d31",
  }));
}
async function jsonFetch(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

export function NorthlineApp() {
  const [authUser, setAuthUser] = useState<SessionUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<number | null>(null);
  const [boardData, setBoardData] = useState<BoardDetail | null>(null);
  const [view, setView] = useState<View>("board");
  const [mode, setMode] = useState<BoardMode>("board");
  const [modal, setModal] = useState<Modal>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "all">("all");
  const [sort, setSort] = useState<"created" | "due" | "priority">("created");
  const [directoryUsers, setDirectoryUsers] = useState<WorkspaceUser[]>([]);
  const [users, setUsers] = useState<WorkspaceUser[]>([]);
  const [sidebar, setSidebar] = useState(true);
  const [dragged, setDragged] = useState<number | null>(null);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [deepLinkTaskId,setDeepLinkTaskId]=useState<number|null>(null);
  const isAdmin = authUser?.role === "Admin";
  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3000);
  };
  const loadBoards = async () => {
    try {
      const d = await jsonFetch("/api/boards");
      setBoards(d.boards);
      setActiveBoardId((current) =>
        current && d.boards.some((b: BoardSummary) => b.id === current)
          ? current
          : d.boards[0]?.id || null,
      );
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const loadBoard = async (id: number) => {
    setBoardData(null);
    try {
      setBoardData(await jsonFetch(`/api/boards/${id}`));
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const loadDirectory = async () => {
    try {
      setDirectoryUsers(
        decorateUsers((await jsonFetch("/api/directory")).users || []),
      );
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const loadAdminUsers = async () => {
    if (!isAdmin) return;
    try {
      setUsers(
        decorateUsers((await jsonFetch("/api/admin/users")).users || []),
      );
    } catch (e) {
      notify((e as Error).message);
    }
  };
  useEffect(() => {
    jsonFetch("/api/auth/me")
      .then((d) => setAuthUser(d.user))
      .finally(() => setAuthLoading(false));
  }, []);
  useEffect(() => {
    if (window.matchMedia("(max-width: 950px)").matches) setSidebar(false);
    const query=new URLSearchParams(window.location.search),board=Number(query.get("board")),task=Number(query.get("task"));
    if(board>0)setActiveBoardId(board);if(task>0)setDeepLinkTaskId(task);
  }, []);
  useEffect(() => {
    if (authUser) void loadBoards();
  }, [authUser]);
  useEffect(() => {
    if (activeBoardId && view === "board") void loadBoard(activeBoardId);
  }, [activeBoardId, view]);
  useEffect(()=>{if(!deepLinkTaskId||!boardData)return;const linked=boardData.tasks.find(task=>task.id===deepLinkTaskId);if(linked){setSelectedTask(linked);setModal("task-detail");}setDeepLinkTaskId(null);window.history.replaceState({},"",window.location.pathname);},[boardData,deepLinkTaskId]);
  useEffect(() => {
    if (
      view === "directory" ||
      modal === "share" ||
      modal === "task-create" ||
      modal === "task-detail"
    )
      void loadDirectory();
  }, [view, modal]);
  useEffect(() => {
    if (isAdmin && view === "admin") void loadAdminUsers();
  }, [isAdmin, view]);
  const tasks = useMemo(() => {
    const list = [...(boardData?.tasks || [])].filter(
      (t) =>
        (t.title + t.description + t.tag + (t.ownerName || ""))
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (statusFilter === "all" || t.status === statusFilter) &&
        (priorityFilter === "all" || t.priority === priorityFilter),
    );
    if (sort === "due")
      list.sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
    if (sort === "priority")
      list.sort(
        (a, b) =>
          ({ High: 0, Medium: 1, Low: 2 })[a.priority] -
          { High: 0, Medium: 1, Low: 2 }[b.priority],
      );
    return list;
  }, [boardData, search, statusFilter, priorityFilter, sort]);
  const mutate = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const moveTask = (taskId: number, status: Status) =>
    mutate(async () => {
      if (!boardData?.canEdit) return;
      const previous = boardData;
      setBoardData({
        ...boardData,
        tasks: boardData.tasks.map((t) =>
          t.id === taskId ? { ...t, status } : t,
        ),
      });
      try {
        await jsonFetch(`/api/tasks/${taskId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
      } catch (e) {
        setBoardData(previous);
        throw e;
      }
    });
  const refresh = async () => {
    if (activeBoardId) await loadBoard(activeBoardId);
    await loadBoards();
  };
  if (authLoading) return <LoadingScreen />;
  if (!authUser) return <Login onLogin={setAuthUser} />;
  return (
    <div className="app-shell">
      <aside className={sidebar ? "sidebar" : "sidebar collapsed"}>
        <div className="brand">
          <BrandMark priority />
          <span>northline</span>
          <small>{NORTHLINE_VERSION}</small>
          <button
            className="icon-button close-side"
            onClick={() => setSidebar(false)}
          >
            ‹
          </button>
        </div>
        <button className="workspace">
          <span className="workspace-icon">V</span>
          <span>
            <b>VTuber Offices</b>
            <small>Private workspace</small>
          </span>
          <i>⌄</i>
        </button>
        <nav>
          <button
            className={view === "board" ? "active" : ""}
            onClick={() => setView("board")}
          >
            <span>⌂</span>Boards
          </button>
          <button
            className={view === "directory" ? "active" : ""}
            onClick={() => setView("directory")}
          >
            <span>♙</span>People
          </button>
          <button
            className={view === "reminders" ? "active" : ""}
            onClick={() => setView("reminders")}
          >
            <span>◷</span>Reminders
          </button>
        </nav>
        <div className="nav-label">
          <span>MY BOARDS</span>
          <button onClick={() => setModal("board-create")}>＋</button>
        </div>
        <nav className="boards">
          {boards
            .filter((b) => b.permission === "owner" || b.permission === "admin")
            .map((b) => (
              <BoardNav
                key={b.id}
                board={b}
                active={view === "board" && activeBoardId === b.id}
                open={() => {
                  setActiveBoardId(b.id);
                  setView("board");
                }}
              />
            ))}
        </nav>
        <div className="nav-label">
          <span>SHARED WITH ME</span>
        </div>
        <nav className="boards">
          {boards
            .filter(
              (b) => b.permission === "editor" || b.permission === "viewer",
            )
            .map((b) => (
              <BoardNav
                key={b.id}
                board={b}
                active={view === "board" && activeBoardId === b.id}
                shared
                open={() => {
                  setActiveBoardId(b.id);
                  setView("board");
                }}
              />
            ))}
          {!boards.some(
            (b) => b.permission === "editor" || b.permission === "viewer",
          ) && <span className="nav-empty">No shared boards</span>}
        </nav>
        <div className="sidebar-bottom">
          {isAdmin && (
            <button
              className={view === "admin" ? "admin-nav active" : "admin-nav"}
              onClick={() => setView("admin")}
            >
              <span>♜</span>Administration <em>Admin</em>
            </button>
          )}
          <button
            className={view === "settings" ? "active" : ""}
            onClick={() => setView("settings")}
          >
            <span>⚙</span>Settings
          </button>
          <div className="profile">
            <Avatar name={authUser.name} avatar={authUser.avatar} />
            <span>
              <b>{authUser.name}</b>
              <small>{authUser.role}</small>
            </span>
            <button
              aria-label="Sign out"
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                setAuthUser(null);
              }}
            >
              ↪
            </button>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          {!sidebar && (
            <button className="icon-button" onClick={() => setSidebar(true)}>
              ☰
            </button>
          )}
          <div className="global-search">
            ⌕
            <input
              aria-label="Global task search"
              placeholder="Search this board…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <kbd>⌘ K</kbd>
          </div>
          <div className="top-actions">
            <span className="version-pill">{NORTHLINE_VERSION}</span>
            <Avatar name={authUser.name} avatar={authUser.avatar} />
          </div>
        </header>
        {view === "board" &&
          (!activeBoardId ? (
            <Empty
              title="Create your first board"
              copy="Boards keep launches, projects, and collaborations organized."
              action={() => setModal("board-create")}
            />
          ) : !boardData ? (
            <PageLoading />
          ) : (
            <BoardView
              data={boardData}
              tasks={tasks}
              mode={mode}
              setMode={setMode}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              priorityFilter={priorityFilter}
              setPriorityFilter={setPriorityFilter}
              sort={sort}
              setSort={setSort}
              dragged={dragged}
              setDragged={setDragged}
              moveTask={moveTask}
              openTask={(task: Task) => {
                setSelectedTask(task);
                setModal("task-detail");
              }}
              openModal={setModal}
            />
          ))}
        {view === "directory" && <Directory users={directoryUsers} />}
        {view === "reminders" && <ReminderCenter notify={notify} />}
        {view === "settings" && <Settings notify={notify} />}
        {view === "admin" && isAdmin && (
          <Admin users={users} reloadUsers={loadAdminUsers} notify={notify} />
        )}
      </main>
      {modal && (
        <NorthlineModal
          type={modal}
          close={() => {
            setModal(null);
            setSelectedTask(null);
          }}
          board={boardData}
          task={selectedTask}
          people={directoryUsers}
          busy={busy}
          run={mutate}
          refresh={refresh}
          notify={notify}
        />
      )}{" "}
      {toast && (
        <div className="toast">
          <b>✓</b>
          {toast}
        </div>
      )}
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <BrandMark priority />
          northline
        </div>
        <p>Opening your workspace…</p>
      </div>
    </div>
  );
}
function Login({ onLogin }: { onLogin: (u: SessionUser) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onLogin(
        (
          await jsonFetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
          })
        ).user,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="auth-screen">
      <div className="auth-aside">
        <div className="auth-brand light">
          <BrandMark priority />
          northline
        </div>
        <div>
          <span>CREATIVE WORK, CLEARLY ORGANIZED</span>
          <h1>One calm place for your whole community.</h1>
          <p>
            Plan launches, coordinate collaborators, and keep everyone moving in
            the same direction.
          </p>
        </div>
        <small>Self-hosted · Private by design</small>
      </div>
      <form className="auth-card login-card" onSubmit={submit}>
        <div className="auth-brand">
          <BrandMark priority />
          northline
        </div>
        <div className="login-copy">
          <span>WELCOME BACK</span>
          <h2>Sign in to your workspace</h2>
          <p>Use your VTuber Offices identity.</p>
        </div>
        {error && <div className="auth-error">{error}</div>}
        <a className="primary wide" href="/api/auth/oidc/start">
          Sign in with Authentik
        </a>
        <div className="login-help">Emergency local administrator access</div>
        <label>
          Username or email
          <input
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button className="wide" disabled={busy}>
          {busy ? "Signing in…" : "Local sign in"}
        </button>
      </form>
    </div>
  );
}
function Avatar({
  name,
  avatar,
  color = "#745edb",
}: {
  name: string;
  avatar?: string | null;
  color?: string;
}) {
  const initials = name
    .split(" ")
    .map((x) => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className="avatar" style={{ background: color }} title={name}>
      {avatar ? (
        <Image src={avatar} alt="" width={50} height={50} unoptimized />
      ) : (
        initials
      )}
    </span>
  );
}
function BoardNav({
  board,
  active,
  shared,
  open,
}: {
  board: BoardSummary;
  active: boolean;
  shared?: boolean;
  open: () => void;
}) {
  return (
    <button className={active ? "active" : ""} onClick={open}>
      <i className={`dot ${shared ? "cyan" : "purple"}`} />
      <span className="nav-board-name">{board.name}</span>
      <em>{board.taskCount}</em>
    </button>
  );
}
function PageLoading() {
  return (
    <section className="content">
      <div className="skeleton hero-skeleton" />
      <div className="skeleton board-skeleton" />
    </section>
  );
}
function Empty({
  title,
  copy,
  action,
}: {
  title: string;
  copy: string;
  action?: () => void;
}) {
  return (
    <section className="content">
      <div className="empty-state large">
        <span className="empty-icon">◎</span>
        <b>{title}</b>
        <span>{copy}</span>
        {action && (
          <button className="primary" onClick={action}>
            Get started
          </button>
        )}
      </div>
    </section>
  );
}

function BoardView({
  data,
  tasks,
  mode,
  setMode,
  statusFilter,
  setStatusFilter,
  priorityFilter,
  setPriorityFilter,
  sort,
  setSort,
  dragged,
  setDragged,
  moveTask,
  openTask,
  openModal,
}: any) {
  const done = tasks.filter((t: Task) => t.status === "done").length;
  const pct = Math.round((done / Math.max(tasks.length, 1)) * 100);
  return (
    <section className="content board-page">
      <div className="board-head">
        <div>
          <div className="eyebrow">
            VTUBER OFFICES <span>/</span>{" "}
            {data.permission === "viewer" ? "SHARED WITH ME" : "BOARDS"}
          </div>
          <h1>{data.board.name}</h1>
          <p>
            {data.board.description ||
              "Add tasks and shape a workflow that fits your team."}
          </p>
        </div>
        <div className="head-actions">
          <div className="avatar-stack">
            {data.members.slice(0, 4).map((m: Member) => (
              <Avatar
                key={m.id}
                name={m.name}
                avatar={m.avatar}
                color="#2f9dde"
              />
            ))}
          </div>
          {data.canShare && (
            <button className="secondary" onClick={() => openModal("share")}>
              ♙ Share
            </button>
          )}
          {data.canShare && (
            <button
              className="secondary"
              onClick={() => openModal("board-settings")}
            >
              ⚙
            </button>
          )}
          {data.canEdit && (
            <button
              className="primary"
              onClick={() => openModal("task-create")}
            >
              ＋ Add task
            </button>
          )}
        </div>
      </div>
      <div className="board-tabs">
        <button
          className={mode === "board" ? "active" : ""}
          onClick={() => setMode("board")}
        >
          ▦ Board
        </button>
        <button
          className={mode === "list" ? "active" : ""}
          onClick={() => setMode("list")}
        >
          ☷ List
        </button>
        <button
          className={mode === "timeline" ? "active" : ""}
          onClick={() => setMode("timeline")}
        >
          ▥ Timeline
        </button>
        <button
          className={mode === "calendar" ? "active" : ""}
          onClick={() => setMode("calendar")}
        >
          ▣ Calendar
        </button>
        <span />
        <label>
          Status
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All</option>
            {columns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Priority
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
          >
            <option value="all">All</option>
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </select>
        </label>
        <label>
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="created">Created</option>
            <option value="due">Due date</option>
            <option value="priority">Priority</option>
          </select>
        </label>
      </div>
      <div className="board-stats">
        <span>
          <b>{tasks.length}</b> tasks
        </span>
        <span>
          <b>{done}</b> completed
        </span>
        <div className="progress">
          <i style={{ width: `${pct}%` }} />
        </div>
        <strong>{pct}%</strong>
        <button
          className="reminder-link"
          disabled={!data.canEdit}
          onClick={() => openModal("reminder")}
        >
          ◷ Schedule Discord reminder
        </button>
      </div>
      {mode === "board" && (
        <Kanban
          data={data}
          tasks={tasks}
          dragged={dragged}
          setDragged={setDragged}
          moveTask={moveTask}
          openTask={openTask}
          add={() => openModal("task-create")}
        />
      )}{" "}
      {mode === "list" && <TaskList tasks={tasks} openTask={openTask} />}{" "}
      {mode === "timeline" && <Timeline tasks={tasks} openTask={openTask} />}{" "}
      {mode === "calendar" && <Calendar tasks={tasks} openTask={openTask} />}{" "}
      {tasks.length === 0 && (
        <div className="empty-state">
          <b>No tasks match this view</b>
          <span>Clear filters or create a new task.</span>
        </div>
      )}
    </section>
  );
}
function Kanban({
  data,
  tasks,
  dragged,
  setDragged,
  moveTask,
  openTask,
  add,
}: any) {
  return (
    <div className="kanban">
      {columns.map((col) => (
        <div
          className="column"
          key={col.id}
          onDragOver={(e) => data.canEdit && e.preventDefault()}
          onDrop={() => {
            if (dragged) void moveTask(dragged, col.id);
            setDragged(null);
          }}
        >
          <div className="column-head">
            <span style={{ background: col.color }} />
            {col.label}
            <em>{tasks.filter((t: Task) => t.status === col.id).length}</em>
          </div>
          <div className="cards">
            {tasks
              .filter((t: Task) => t.status === col.id)
              .map((task: Task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  canEdit={data.canEdit}
                  setDragged={setDragged}
                  open={() => openTask(task)}
                />
              ))}
          </div>
          {data.canEdit && (
            <button className="add-inline" onClick={add}>
              ＋ Add task
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
function TaskCard({
  task,
  canEdit,
  setDragged,
  open,
}: {
  task: Task;
  canEdit: boolean;
  setDragged: (id: number) => void;
  open: () => void;
}) {
  return (
    <article
      className="task-card"
      draggable={canEdit}
      onDragStart={() => setDragged(task.id)}
      onClick={open}
    >
      <div className="card-top">
        <span className={`priority ${task.priority.toLowerCase()}`}>
          {task.priority}
        </span>
        <button aria-label="Open task">•••</button>
      </div>
      <h3>{task.title}</h3>
      {task.description && <p className="task-excerpt">{task.description}</p>}
      <span className="tag">{task.tag}</span>
      <div className="card-foot">
        <Avatar
          name={task.ownerName || "Unassigned"}
          avatar={task.ownerAvatar}
        />
        <span>◷ {task.due || "No date"}</span>
        <span className="comments">◌ {task.comments}</span>
      </div>
    </article>
  );
}
function TaskList({
  tasks,
  openTask,
}: {
  tasks: Task[];
  openTask: (task: Task) => void;
}) {
  return (
    <div className="task-table">
      <div className="task-row task-head">
        <span>Task</span>
        <span>Status</span>
        <span>Owner</span>
        <span>Due</span>
        <span>Priority</span>
      </div>
      {tasks.map((t) => (
        <button className="task-row" key={t.id} onClick={() => openTask(t)}>
          <span>
            <b>{t.title}</b>
            <small>{t.tag}</small>
          </span>
          <span className={`status-dot ${t.status}`}>
            {columns.find((c) => c.id === t.status)?.label}
          </span>
          <span>{t.ownerName || "Unassigned"}</span>
          <span>{t.due || "No date"}</span>
          <span className={`priority ${t.priority.toLowerCase()}`}>
            {t.priority}
          </span>
        </button>
      ))}
    </div>
  );
}
function Timeline({
  tasks,
  openTask,
}: {
  tasks: Task[];
  openTask: (task: Task) => void;
}) {
  const dated = tasks
    .filter((t) => t.due)
    .sort((a, b) => a.due!.localeCompare(b.due!));
  return (
    <div className="timeline-view">
      <div className="timeline-axis">
        <span>Upcoming work</span>
        <i />
      </div>
      {dated.map((t, index) => (
        <button key={t.id} onClick={() => openTask(t)}>
          <time>
            {new Date(`${t.due}T12:00:00`).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </time>
          <i className={`timeline-dot ${t.status}`} />
          <span>
            <b>{t.title}</b>
            <small>
              {t.ownerName || "Unassigned"} ·{" "}
              {columns.find((c) => c.id === t.status)?.label}
            </small>
          </span>
          <em style={{ width: `${Math.max(15, 100 - index * 8)}%` }} />
        </button>
      ))}
      {!dated.length && (
        <div className="empty-state">
          <b>No timeline yet</b>
          <span>Add due dates to map upcoming work.</span>
        </div>
      )}
    </div>
  );
}
function Calendar({
  tasks,
  openTask,
}: {
  tasks: Task[];
  openTask: (task: Task) => void;
}) {
  const groups = Object.entries(
    tasks
      .filter((t) => t.due)
      .reduce<Record<string, Task[]>>((a, t) => {
        (a[t.due!] = a[t.due!] || []).push(t);
        return a;
      }, {}),
  ).sort(([a], [b]) => a.localeCompare(b));
  return (
    <div className="calendar-view">
      {groups.map(([date, list]) => (
        <section key={date}>
          <time>
            {new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </time>
          <div>
            {list.map((t) => (
              <button key={t.id} onClick={() => openTask(t)}>
                <i className={`status-dot ${t.status}`} />
                <span>
                  <b>{t.title}</b>
                  <small>{t.ownerName || "Unassigned"}</small>
                </span>
                <em>{t.priority}</em>
              </button>
            ))}
          </div>
        </section>
      ))}
      {!groups.length && (
        <div className="empty-state">
          <b>No scheduled tasks</b>
          <span>Add due dates to see work on the calendar.</span>
        </div>
      )}
    </div>
  );
}

function Directory({ users }: { users: WorkspaceUser[] }) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const list = users.filter(
    (p) =>
      (p.name + p.email).toLowerCase().includes(query.toLowerCase()) &&
      (role === "all" || p.role === role),
  );
  return (
    <section className="content directory">
      <div className="page-title">
        <div>
          <div className="eyebrow">AUTHENTIK DIRECTORY</div>
          <h1>People</h1>
          <p>Find active community members and collaborators.</p>
        </div>
        <span className="status-pill active">● Synced</span>
      </div>
      <div className="directory-tools">
        <div className="global-search">
          ⌕
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or email…"
          />
        </div>
        <select
          className="secondary"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          <option value="all">All roles</option>
          <option>Admin</option>
          <option>Member</option>
          <option>Guest</option>
        </select>
      </div>
      <div className="people-grid">
        {list.map((p) => (
          <article className="person" key={p.id}>
            <Avatar name={p.name} avatar={p.avatar} color={p.color} />
            <i className="online" />
            <h3>{p.name}</h3>
            <p>{p.email}</p>
            <span>{p.role}</span>
            <small>
              {p.boards} board{p.boards === 1 ? "" : "s"}
            </small>
          </article>
        ))}
      </div>
      {!list.length && (
        <Empty
          title="No matching people"
          copy="Try a different name, email, or role."
        />
      )}
    </section>
  );
}

function Settings({ notify }: { notify: (s: string) => void }) {
  const [discord, setDiscord] = useState<{
    configured: boolean;
    channels: { id: string; name: string }[];
    error?: string;
  } | null>(null);
  const [preferences,setPreferences]=useState({assignmentEnabled:true,statusEnabled:true,commentEnabled:true,mentionEnabled:true,dueEnabled:true});
  useEffect(() => {
    jsonFetch("/api/discord/channels")
      .then(setDiscord)
      .catch((e) =>
        setDiscord({ configured: false, channels: [], error: e.message }),
      );
    jsonFetch("/api/settings/notifications").then(data=>setPreferences(Object.fromEntries(Object.entries(data.settings).map(([key,value])=>[key,value!==0])) as typeof preferences)).catch(()=>{});
  }, []);
  return (
    <section className="content settings">
      <div className="page-title">
        <div>
          <div className="eyebrow">WORKSPACE SETTINGS</div>
          <h1>Integrations</h1>
          <p>
            Connect community tools and choose where Northline sends updates.
          </p>
        </div>
      </div>
      <div className="settings-card">
        <div className="discord-logo">☁</div>
        <div>
          <h2>Discord</h2>
          <p>
            Scheduled reminders are delivered by the private Task Buddy bot.
          </p>
        </div>
        <span className={discord?.configured ? "connected" : "not-connected"}>
          {discord?.configured ? "● Connected" : "Not configured"}
        </span>
      </div>
      <div className="settings-body">
        <div>
          <h3>Bot connection</h3>
          <p>
            {discord?.error ||
              `${discord?.channels.length || 0} text channels are available to Northline. Bot credentials are managed only through the server environment.`}
          </p>
        </div>
        <button
          className="secondary"
          onClick={() => {
            jsonFetch("/api/discord/channels")
              .then(setDiscord)
              .then(() => notify("Discord connection refreshed"))
              .catch((e) => notify(e.message));
          }}
        >
          Refresh
        </button>
      </div>
      <div className="settings-body">
        <div>
          <h3>Security boundary</h3>
          <p>
            Northline never exposes the Discord bot token to browsers or stores
            it in the application database.
          </p>
        </div>
        <span className="connected">● Server-side</span>
      </div>
      <div className="settings-body notification-preferences">
        <div><h3>My Task Buddy preferences</h3><p>Choose which board-channel events should include activity involving you.</p><div className="notification-options">{([['assignmentEnabled','Assignments'],['statusEnabled','Status changes'],['commentEnabled','Comments'],['mentionEnabled','Mentions'],['dueEnabled','Due-date warnings']] as const).map(([key,label])=><label className="notification-toggle" key={key}><input type="checkbox" checked={preferences[key]} onChange={(e)=>setPreferences({...preferences,[key]:e.target.checked})}/><span>{label}</span></label>)}</div></div>
        <button className="secondary" onClick={()=>jsonFetch('/api/settings/notifications',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(preferences)}).then(()=>notify('Notification preferences saved')).catch(e=>notify(e.message))}>Save preferences</button>
      </div>
      <div className="settings-body">
        <div>
          <h3>Identity provider</h3>
          <p>
            Authentik controls workspace membership, profile pictures, and
            linked Discord accounts.
          </p>
        </div>
        <a
          className="secondary settings-link"
          href="https://auth.vtuberoffices.com/if/user/#/settings"
        >
          Manage profile &amp; Discord
        </a>
      </div>
    </section>
  );
}

function Admin({
  users,
  reloadUsers,
  notify,
}: {
  users: WorkspaceUser[];
  reloadUsers: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [tab, setTab] = useState<"users" | "boards" | "audit" | "security">(
    "users",
  );
  const [query, setQuery] = useState("");
  const [create, setCreate] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "Member",
  });
  const [overview, setOverview] = useState<any>(null);
  const loadOverview = () =>
    jsonFetch("/api/admin/overview")
      .then(setOverview)
      .catch((e) => notify(e.message));
  useEffect(() => {
    void loadOverview();
  }, []);
  const updateUser = async (id: number, body: any) => {
    await jsonFetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await reloadUsers();
    await loadOverview();
  };
  const createUser = async () => {
    await jsonFetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setCreate(false);
    setForm({ name: "", email: "", password: "", role: "Member" });
    await reloadUsers();
    await loadOverview();
    notify("Local recovery user created");
  };
  const shown = users.filter((u) =>
    (u.name + u.email + u.role).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className="content admin-page">
      <div className="admin-banner">
        <div>
          <span className="admin-kicker">ADMIN CONSOLE</span>
          <h1>Workspace administration</h1>
          <p>Control members, access, security, and workspace-wide activity.</p>
        </div>
        <div className="shield">♜</div>
      </div>
      <div className="metric-grid">
        <Metric
          label="WORKSPACE MEMBERS"
          value={overview?.metrics.users ?? users.length}
        />
        <Metric
          label="ACTIVE BOARDS"
          value={overview?.metrics.activeBoards ?? 0}
        />
        <Metric
          label="ADMINS"
          value={
            overview?.metrics.admins ??
            users.filter((u) => u.role === "Admin").length
          }
        />
        <Metric label="SUSPENDED" value={overview?.metrics.suspended ?? 0} />
      </div>
      <div className="admin-panel">
        <div className="admin-tabs">
          {(["users", "boards", "audit", "security"] as const).map((name) => (
            <button
              key={name}
              className={tab === name ? "active" : ""}
              onClick={() => setTab(name)}
            >
              {name[0].toUpperCase() + name.slice(1)}
            </button>
          ))}
        </div>
        {tab === "users" && (
          <>
            <div className="admin-toolbar">
              <div className="global-search">
                ⌕
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search users…"
                />
              </div>
              <button
                className="secondary"
                onClick={async () => {
                  await jsonFetch("/api/admin/directory-sync", {
                    method: "POST",
                  });
                  await reloadUsers();
                  notify("Authentik synchronized");
                }}
              >
                ↻ Sync Authentik
              </button>
              <button className="primary" onClick={() => setCreate(true)}>
                ＋ Recovery user
              </button>
            </div>
            <div className="user-table">
              <div className="table-row table-head">
                <span>User</span>
                <span>Role</span>
                <span>Status</span>
                <span>Board access</span>
                <span>Identity</span>
                <span />
              </div>
              {shown.map((u) => (
                <div className="table-row" key={u.id}>
                  <div className="user-cell">
                    <Avatar name={u.name} avatar={u.avatar} color={u.color} />
                    <span>
                      <b>{u.name}</b>
                      <small>{u.email}</small>
                    </span>
                  </div>
                  <select
                    className="role-select"
                    value={u.role}
                    disabled={u.authSource === "oidc"}
                    onChange={(e) =>
                      void updateUser(u.id, { role: e.target.value })
                    }
                  >
                    <option>Admin</option>
                    <option>Member</option>
                    <option>Guest</option>
                  </select>
                  <span className={`status-pill ${u.status.toLowerCase()}`}>
                    ● {u.status}
                  </span>
                  <span>{u.boards} boards</span>
                  <span className="muted">
                    {u.authSource === "oidc" ? "Authentik" : "Local"}
                  </span>
                  <button
                    className="row-action"
                    disabled={u.authSource === "oidc"}
                    onClick={() =>
                      void updateUser(u.id, {
                        status:
                          u.status === "Suspended" ? "Active" : "Suspended",
                      })
                    }
                  >
                    {u.status === "Suspended" ? "Restore" : "Suspend"}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
        {tab === "boards" && (
          <div className="admin-section">
            <div className="section-copy">
              <h2>Board access</h2>
              <p>Live ownership, membership, and task totals.</p>
            </div>
            {overview?.boards.map((b: any) => (
              <div className="access-row" key={b.id}>
                <i />
                <span>
                  <b>{b.name}</b>
                  <small>{b.description || "No description"}</small>
                </span>
                <strong>{b.ownerName}</strong>
                <em>{b.sharedUsers} shared</em>
                <em>{b.taskCount} tasks</em>
              </div>
            ))}
          </div>
        )}
        {tab === "audit" && (
          <div className="admin-section">
            <div className="section-copy">
              <h2>Audit history</h2>
              <p>Recent administrative and collaboration events.</p>
            </div>
            {overview?.audit.map((a: any) => (
              <div className="audit-row" key={a.id}>
                <code>{a.action}</code>
                <span>
                  <b>{a.actorName}</b>
                  <small>{a.target || "Workspace"}</small>
                </span>
                <time>{new Date(`${a.createdAt}Z`).toLocaleString()}</time>
              </div>
            ))}
          </div>
        )}
        {tab === "security" && (
          <div className="admin-section security-grid">
            <Security
              title="Identity lifecycle"
              copy="Authentik groups grant and revoke Northline access."
            />
            <Security
              title="Invite policy"
              copy="Only administrators can create local recovery users."
            />
            <Security
              title="Discord secrets"
              copy="Bot credentials stay in the Linux VM environment."
            />
            <Security
              title="Session protection"
              copy="Sessions are hashed and use HTTP-only cookies."
            />
          </div>
        )}
      </div>
      {create && (
        <div className="modal-backdrop">
          <div className="modal">
            <button className="modal-close" onClick={() => setCreate(false)}>
              ×
            </button>
            <h2>Create recovery user</h2>
            <p>
              Use Authentik for normal users. This account is for emergency
              access.
            </p>
            <label>
              Full name
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <label>
              Temporary password
              <input
                type="password"
                minLength={10}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </label>
            <label>
              Role
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                <option>Admin</option>
                <option>Member</option>
                <option>Guest</option>
              </select>
            </label>
            <button
              className="primary wide"
              disabled={!form.name || !form.email || form.password.length < 10}
              onClick={() => void createUser()}
            >
              Create user
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span>{label}</span>
      <b>{value}</b>
      <small>Live workspace data</small>
    </div>
  );
}
function Security({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="security-item">
      <span className="security-icon">✓</span>
      <div>
        <h3>{title}</h3>
        <p>{copy}</p>
      </div>
      <span className="status-pill active">Active</span>
    </div>
  );
}

function NorthlineModal({
  type,
  close,
  board,
  task,
  people,
  busy,
  run,
  refresh,
  notify,
}: any) {
  const [taskForm, setTaskForm] = useState(
    task
      ? {
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          tag: task.tag,
          dueDate: task.due || "",
          assigneeId: task.ownerId ? String(task.ownerId) : "",
        }
      : emptyTask,
  );
  const [boardForm, setBoardForm] = useState({
    name: board?.board.name || "",
    description: board?.board.description || "",
  });
  const [selectedUser, setSelectedUser] = useState("");
  const [permission, setPermission] = useState("editor");
  const [comments, setComments] = useState<any[]>([]);
  const [comment, setComment] = useState("");
  const [channels, setChannels] = useState<{ id: string; name: string }[]>([]);
  const [notificationSettings, setNotificationSettings] = useState({
    channelId: board?.notifications?.channelId || "",
    assignmentEnabled: board?.notifications?.assignmentEnabled !== 0,
    statusEnabled: board?.notifications?.statusEnabled !== 0,
    commentEnabled: board?.notifications?.commentEnabled !== 0,
    mentionEnabled: board?.notifications?.mentionEnabled !== 0,
    dueEnabled: board?.notifications?.dueEnabled !== 0,
    dueWarningHours: board?.notifications?.dueWarningHours || 24,
  });
  const [reminder, setReminder] = useState({
    channelId: "",
    taskId: task?.id ? String(task.id) : "",
    date: "",
    time: "",
    message: "",
  });
  useEffect(() => {
    if (type === "task-detail" && task)
      jsonFetch(`/api/tasks/${task.id}/comments`).then((d) =>
        setComments(d.comments),
      );
    if (type === "reminder" || type === "board-settings")
      jsonFetch("/api/discord/channels")
        .then((d) => setChannels(d.channels || []))
        .catch((e) => notify(e.message));
  }, [type, task]);
  const saveTask = () =>
    run(async () => {
      if (type === "task-create") {
        await jsonFetch(`/api/boards/${board.board.id}/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...taskForm,
            assigneeId: taskForm.assigneeId
              ? Number(taskForm.assigneeId)
              : null,
            dueDate: taskForm.dueDate || null,
          }),
        });
      } else {
        await jsonFetch(`/api/tasks/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: taskForm.title,
            description: taskForm.description,
            status: taskForm.status,
            priority: taskForm.priority,
            tag: taskForm.tag,
            due_date: taskForm.dueDate || null,
            assignee_id: taskForm.assigneeId
              ? Number(taskForm.assigneeId)
              : null,
          }),
        });
      }
      await refresh();
      close();
      notify(type === "task-create" ? "Task created" : "Task updated");
    });
  const deleteTask = () =>
    run(async () => {
      if (!confirm("Delete this task and its comments?")) return;
      await jsonFetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      await refresh();
      close();
      notify("Task deleted");
    });
  const addComment = () =>
    run(async () => {
      await jsonFetch(`/api/tasks/${task.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: comment }),
      });
      setComment("");
      setComments((await jsonFetch(`/api/tasks/${task.id}/comments`)).comments);
      await refresh();
    });
  const share = () =>
    run(async () => {
      await jsonFetch(`/api/boards/${board.board.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: Number(selectedUser), permission }),
      });
      await refresh();
      notify("Board access updated");
    });
  const removeMember = (id: number) =>
    run(async () => {
      await jsonFetch(`/api/boards/${board.board.id}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id }),
      });
      await refresh();
      notify("Board access removed");
    });
  const saveBoard = () =>
    run(async () => {
      await jsonFetch(`/api/boards/${board.board.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(boardForm),
      });
      await jsonFetch(`/api/boards/${board.board.id}/notifications`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notificationSettings),
      });
      await refresh();
      close();
      notify("Board updated");
    });
  const deleteBoard = () =>
    run(async () => {
      if (!confirm("Delete this board, all tasks, comments, and reminders?"))
        return;
      await jsonFetch(`/api/boards/${board.board.id}`, { method: "DELETE" });
      await refresh();
      close();
      notify("Board deleted");
    });
  const schedule = () =>
    run(async () => {
      await jsonFetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boardId: board.board.id,
          taskId: reminder.taskId ? Number(reminder.taskId) : null,
          channelId: reminder.channelId,
          message: reminder.message,
          remindAt: new Date(`${reminder.date}T${reminder.time}`).toISOString(),
        }),
      });
      close();
      notify("Discord reminder scheduled");
    });
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div className={`modal ${type === "task-detail" ? "modal-large" : ""}`}>
        <button className="modal-close" onClick={close}>
          ×
        </button>
        {(type === "task-create" || type === "task-detail") && (
          <>
            <span className="modal-icon purple-bg">
              {type === "task-create" ? "＋" : "✓"}
            </span>
            <h2>{type === "task-create" ? "Create task" : "Task details"}</h2>
            <p>
              {type === "task-create"
                ? "Capture the work with enough context for collaborators."
                : "Edit fields, ownership, and discussion."}
            </p>
            <label>
              Title
              <input
                autoFocus
                value={taskForm.title}
                onChange={(e) =>
                  setTaskForm((f: any) => ({ ...f, title: e.target.value }))
                }
              />
            </label>
            <label>
              Description
              <textarea
                value={taskForm.description}
                onChange={(e) =>
                  setTaskForm((f: any) => ({
                    ...f,
                    description: e.target.value,
                  }))
                }
              />
            </label>
            <label>
              Task Buddy channel
              <select value={notificationSettings.channelId} onChange={(e)=>setNotificationSettings({...notificationSettings,channelId:e.target.value})}>
                <option value="">Automatic notifications off</option>
                {channels.map(channel=><option key={channel.id} value={channel.id}>#{channel.name}</option>)}
              </select>
            </label>
            <div className="notification-options">
              <h3>Automatic notifications</h3>
              {([
                ["assignmentEnabled","Assignments"],
                ["statusEnabled","Status changes"],
                ["commentEnabled","Comments"],
                ["mentionEnabled","Mentions"],
                ["dueEnabled","Due-date warnings"],
              ] as const).map(([key,label])=><label className="notification-toggle" key={key}><input type="checkbox" checked={notificationSettings[key] as boolean} onChange={(e)=>setNotificationSettings({...notificationSettings,[key]:e.target.checked})}/><span>{label}</span></label>)}
            </div>
            <label>
              Due-date warning
              <select value={notificationSettings.dueWarningHours} onChange={(e)=>setNotificationSettings({...notificationSettings,dueWarningHours:Number(e.target.value)})}>
                <option value={1}>1 hour before</option><option value={6}>6 hours before</option><option value={12}>12 hours before</option><option value={24}>1 day before</option><option value={48}>2 days before</option><option value={168}>1 week before</option>
              </select>
            </label>
            <div className="modal-row three">
              <label>
                Status
                <select
                  value={taskForm.status}
                  onChange={(e) =>
                    setTaskForm((f: any) => ({ ...f, status: e.target.value }))
                  }
                >
                  {columns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Priority
                <select
                  value={taskForm.priority}
                  onChange={(e) =>
                    setTaskForm((f: any) => ({
                      ...f,
                      priority: e.target.value,
                    }))
                  }
                >
                  <option>Low</option>
                  <option>Medium</option>
                  <option>High</option>
                </select>
              </label>
              <label>
                Category
                <input
                  value={taskForm.tag}
                  onChange={(e) =>
                    setTaskForm((f: any) => ({ ...f, tag: e.target.value }))
                  }
                />
              </label>
            </div>
            <div className="modal-row">
              <label>
                Due date
                <input
                  type="date"
                  value={taskForm.dueDate}
                  onChange={(e) =>
                    setTaskForm((f: any) => ({ ...f, dueDate: e.target.value }))
                  }
                />
              </label>
              <label>
                Owner
                <select
                  value={taskForm.assigneeId}
                  onChange={(e) =>
                    setTaskForm((f: any) => ({
                      ...f,
                      assigneeId: e.target.value,
                    }))
                  }
                >
                  <option value="">Unassigned</option>
                  {people.map((p: WorkspaceUser) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="modal-actions">
              {type === "task-detail" && (
                <button className="danger" onClick={deleteTask}>
                  Delete
                </button>
              )}
              <button
                className="primary"
                disabled={busy || !taskForm.title.trim()}
                onClick={saveTask}
              >
                {busy ? "Saving…" : "Save task"}
              </button>
            </div>
            {type === "task-detail" && (
              <div className="comment-panel">
                <h3>
                  Discussion <span>{comments.length}</span>
                </h3>
                {comments.map((c) => (
                  <div className="comment" key={c.id}>
                    <Avatar name={c.authorName} avatar={c.authorAvatar} />
                    <span>
                      <b>{c.authorName}</b>
                      <small>
                        {new Date(`${c.createdAt}Z`).toLocaleString()}
                      </small>
                      <p>{c.body}</p>
                    </span>
                  </div>
                ))}
                <div className="comment-compose">
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Add context or an update…"
                  />
                  <button
                    className="secondary"
                    disabled={!comment.trim()}
                    onClick={addComment}
                  >
                    Comment
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        {type === "board-create" && (
          <>
            <h2>Create board</h2>
            <p>Start a private board and share it when ready.</p>
            <label>
              Name
              <input
                autoFocus
                value={boardForm.name}
                onChange={(e) =>
                  setBoardForm({ ...boardForm, name: e.target.value })
                }
              />
            </label>
            <label>
              Description
              <textarea
                value={boardForm.description}
                onChange={(e) =>
                  setBoardForm({ ...boardForm, description: e.target.value })
                }
              />
            </label>
            <button
              className="primary wide"
              disabled={!boardForm.name.trim()}
              onClick={() =>
                run(async () => {
                  await jsonFetch("/api/boards", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(boardForm),
                  });
                  await refresh();
                  close();
                  notify("Board created");
                })
              }
            >
              Create board
            </button>
          </>
        )}
        {type === "board-settings" && (
          <>
            <h2>Board settings</h2>
            <p>Update this board or permanently remove it.</p>
            <label>
              Name
              <input
                value={boardForm.name}
                onChange={(e) =>
                  setBoardForm({ ...boardForm, name: e.target.value })
                }
              />
            </label>
            <label>
              Description
              <textarea
                value={boardForm.description}
                onChange={(e) =>
                  setBoardForm({ ...boardForm, description: e.target.value })
                }
              />
            </label>
            <div className="modal-actions">
              <button className="danger" onClick={deleteBoard}>
                Delete board
              </button>
              <button className="primary" onClick={saveBoard}>
                Save changes
              </button>
            </div>
          </>
        )}
        {type === "share" && (
          <>
            <h2>Share {board.board.name}</h2>
            <p>Grant active workspace members access.</p>
            <div className="modal-row">
              <label>
                Member
                <select
                  value={selectedUser}
                  onChange={(e) => setSelectedUser(e.target.value)}
                >
                  <option value="">Choose a person…</option>
                  {people
                    .filter(
                      (p: WorkspaceUser) =>
                        p.id !== board.board.ownerId &&
                        !board.members.some((m: Member) => m.id === p.id),
                    )
                    .map((p: WorkspaceUser) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Permission
                <select
                  value={permission}
                  onChange={(e) => setPermission(e.target.value)}
                >
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
              </label>
            </div>
            <button
              className="primary wide"
              disabled={!selectedUser}
              onClick={share}
            >
              Grant access
            </button>
            <div className="shared-list">
              {board.members.map((m: Member) => (
                <div className="share-person" key={m.id}>
                  <Avatar name={m.name} avatar={m.avatar} />
                  <span>
                    <b>{m.name}</b>
                    <small>{m.email}</small>
                  </span>
                  <em>{m.permission}</em>
                  <button
                    className="icon-button"
                    onClick={() => removeMember(m.id)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
        {type === "reminder" && (
          <>
            <span className="modal-icon discord-bg">#</span>
            <h2>Schedule Discord reminder</h2>
            <p>Task Buddy will post without mentioning users or roles.</p>
            <label>
              Channel
              <select
                value={reminder.channelId}
                onChange={(e) =>
                  setReminder({ ...reminder, channelId: e.target.value })
                }
              >
                <option value="">Choose a channel…</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Task (optional)
              <select
                value={reminder.taskId}
                onChange={(e) =>
                  setReminder({ ...reminder, taskId: e.target.value })
                }
              >
                <option value="">Board-wide reminder</option>
                {board.tasks.map((t: Task) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="modal-row">
              <label>
                Date
                <input
                  type="date"
                  value={reminder.date}
                  onChange={(e) =>
                    setReminder({ ...reminder, date: e.target.value })
                  }
                />
              </label>
              <label>
                Time
                <input
                  type="time"
                  value={reminder.time}
                  onChange={(e) =>
                    setReminder({ ...reminder, time: e.target.value })
                  }
                />
              </label>
            </div>
            <label>
              Message
              <textarea
                value={reminder.message}
                onChange={(e) =>
                  setReminder({ ...reminder, message: e.target.value })
                }
                placeholder="What should the team know?"
              />
            </label>
            <button
              className="discord-button wide"
              disabled={
                !reminder.channelId ||
                !reminder.date ||
                !reminder.time ||
                !reminder.message.trim()
              }
              onClick={schedule}
            >
              Schedule reminder
            </button>
          </>
        )}
      </div>
    </div>
  );
}
