/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect, react-hooks/exhaustive-deps, jsx-a11y/no-autofocus, jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */
"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { NORTHLINE_VERSION } from "@/lib/version";
import { ReminderCenter } from "./reminder-center";
import { TimeClock } from "./time-clock";
import { TimeCard } from "./time-card";
import { AdminTime } from "./admin-time";
import { CalendarHub } from "./calendar-hub";
import { CollabPlanner } from "./collab-planner";
import { Teams } from "./teams";
import { HelpCenter, WelcomeGuide, type HelpDestination } from "./help-center";
import { apiErrorMessage, resilientFetch } from "./client-fetch";

type Status = string;
type TextSize = "small" | "default" | "large" | "xlarge";
type Priority = "Low" | "Medium" | "High";
type BoardColumn = {
  id: number;
  key: string;
  name: string;
  color: string;
  position: number;
  isDone: number;
};
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
  assigneeIds?: number[];
  assignees?: Array<{ id: number; name: string; avatar: string | null }>;
};
type BoardSummary = {
  id: number;
  boardKey: string;
  name: string;
  description: string;
  ownerId: number;
  ownerName: string;
  permission: "owner" | "editor" | "viewer";
  taskCount: number;
  workspaceId: number;
  workspaceName: string;
  navigationWorkspaceId: number;
};
type Workspace = {
  id: number;
  workspaceKey: string;
  name: string;
  kind: "personal" | "shared";
  ownerId: number;
  ownerName: string;
  permission: "owner" | "editor" | "viewer";
  boardCount: number;
  memberCount: number;
  virtual?: boolean;
};
type Member = {
  id: number;
  name: string;
  email: string;
  avatar: string | null;
  permission: "viewer" | "editor";
};
type BoardAccess = Omit<Member, "permission"> & {
  permission: "owner" | "viewer" | "editor";
  source: string;
};
type BoardDetail = {
  board: {
    id: number;
    boardKey: string;
    name: string;
    description: string;
    ownerId: number;
    createdBy: number;
    workspaceId: number;
  };
  tasks: Task[];
  members: Member[];
  boardOwner: BoardAccess;
  sharedWith: BoardAccess[];
  assignees: Array<{
    id: number;
    name: string;
    email: string;
    avatar: string | null;
  }>;
  columns: BoardColumn[];
  permission: string;
  canEdit: boolean;
  canShare: boolean;
  notifications?: {
    channelId: string;
    channelName: string;
    assignmentEnabled: number;
    statusEnabled: number;
    commentEnabled: number;
    mentionEnabled: number;
    dueEnabled: number;
    dueWarningHours: number;
  };
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
  discordUsername: string | null;
  publicStreamCalendarCount: number;
  publicStreamCalendarName: string | null;
  teamNames?: string[];
};
type PublicStreamSchedule = {
  owner: { id: number; name: string; avatar: string | null; timezone: string };
  calendars: Array<{
    id: string;
    name: string;
    color: string;
    description: string;
    timezone: string;
  }>;
  events: Array<{
    id: string;
    title: string;
    description: string;
    startAt: string;
    endAt: string;
    timezone: string;
    allDay: number;
    kind: string;
    platform: string;
    game: string;
    streamUrl: string;
    calendarId: string;
    calendarName: string;
    color: string;
  }>;
};
type SessionUser = {
  id: number;
  name: string;
  email: string;
  avatar: string | null;
  role: "Admin" | "Member" | "Guest";
  timezone: string;
};
type Modal =
  | "task-create"
  | "task-detail"
  | "task-comments"
  | "board-create"
  | "board-settings"
  | "share"
  | "members"
  | "activity"
  | "columns"
  | "workspace-create"
  | "workspace-manage"
  | "archive"
  | "reminder"
  | null;
type View =
  | "board"
  | "my-work"
  | "time"
  | "calendars"
  | "collabs"
  | "teams"
  | "directory"
  | "reminders"
  | "help"
  | "settings"
  | "admin";
type BoardMode = "board" | "list" | "timeline" | "calendar";
type SearchResult = {
  id: number;
  title: string;
  status: string;
  priority: string;
  boardId: number;
  boardKey: string;
  boardName: string;
};
type MyWorkTask = {
  id: number;
  title: string;
  description: string;
  status: string;
  statusName: string;
  statusColor: string;
  isDone: number;
  priority: Priority;
  tag: string;
  due: string | null;
  updatedAt: string;
  boardId: number;
  boardKey: string;
  boardName: string;
  workspaceId: number;
  workspaceKey: string;
  workspaceName: string;
  permission: "owner" | "editor" | "viewer";
};

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
function SearchIcon() {
  return (
    <svg
      className="search-icon"
      viewBox="0 0 20 20"
      aria-hidden="true"
    >
      <circle cx="8.5" cy="8.5" r="5" />
      <path d="m12.2 12.2 4 4" />
    </svg>
  );
}
const emptyTask = {
  title: "",
  description: "",
  status: "" as Status,
  priority: "Medium" as Priority,
  tag: "General",
  dueDate: "",
  assigneeId: "",
  assigneeIds: [] as string[],
};

function decorateUsers(list: any[]): WorkspaceUser[] {
  return list.map((u) => ({
    ...u,
    boards: Number(u.boards || 0),
    publicStreamCalendarCount: Number(u.publicStreamCalendarCount || 0),
    publicStreamCalendarName: u.publicStreamCalendarName || null,
    discordUsername: u.discordUsername || null,
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
  const response = await resilientFetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(apiErrorMessage(response, data, "Something went wrong"));
  return data;
}

export function NorthlineApp() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [textSize, setTextSize] = useState<TextSize>("default");
  const [authUser, setAuthUser] = useState<SessionUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<number | null>(
    null,
  );
  const [workspaceMenu, setWorkspaceMenu] = useState(false);
  const [activeBoardId, setActiveBoardId] = useState<number | null>(null);
  const [boardData, setBoardData] = useState<BoardDetail | null>(null);
  const [view, setView] = useState<View>("board");
  const [mode, setMode] = useState<BoardMode>("board");
  const [modal, setModal] = useState<Modal>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [search, setSearch] = useState("");
  const [globalResults, setGlobalResults] = useState<SearchResult[]>([]);
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "all">("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [sort, setSort] = useState<"created" | "due" | "priority">("created");
  const [directoryUsers, setDirectoryUsers] = useState<WorkspaceUser[]>([]);
  const [users, setUsers] = useState<WorkspaceUser[]>([]);
  const [sidebar, setSidebar] = useState(true);
  const [sidebarBoardSearch, setSidebarBoardSearch] = useState("");
  const [myBoardsExpanded, setMyBoardsExpanded] = useState(true);
  const [sharedBoardsExpanded, setSharedBoardsExpanded] = useState(true);
  const [showWelcome, setShowWelcome] = useState(false);
  const [dragged, setDragged] = useState<number | null>(null);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [deepLinkTaskId, setDeepLinkTaskId] = useState<number | null>(null);
  const isAdmin = authUser?.role === "Admin";
  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3000);
  };
  const loadBoards = async () => {
    try {
      const d = await jsonFetch("/api/boards");
      const normalizedBoards = (d.boards || []).map((board: BoardSummary) => ({
        ...board,
        id: Number(board.id),
        ownerId: Number(board.ownerId),
        workspaceId: Number(board.workspaceId),
        navigationWorkspaceId: Number(
          board.navigationWorkspaceId ?? board.workspaceId,
        ),
        taskCount: Number(board.taskCount || 0),
      }));
      // Direct shares remain permission-filtered by the API, but are shown in
      // a global Shared with me section rather than as a selectable workspace.
      const normalizedWorkspaces = (d.workspaces || [])
        .filter((workspace: Workspace) => !workspace.virtual)
        .map((workspace: Workspace) => ({
          ...workspace,
          id: Number(workspace.id),
          ownerId: Number(workspace.ownerId),
          boardCount: Number(workspace.boardCount || 0),
          memberCount: Number(workspace.memberCount || 0),
        }));
      setBoards(normalizedBoards);
      setWorkspaces(normalizedWorkspaces);
      const requested = new URLSearchParams(window.location.search).get(
          "board",
        ),
        requestedBoard = normalizedBoards.find(
          (board: BoardSummary) =>
            board.boardKey === requested || String(board.id) === requested,
        );
      const boardWorkspaceIds = new Set(
          normalizedBoards.map(
            (board: BoardSummary) =>
              board.navigationWorkspaceId ?? board.workspaceId,
          ),
        ),
        requestedWorkspaceId =
          requestedBoard &&
          (requestedBoard.navigationWorkspaceId ?? requestedBoard.workspaceId) !==
            0
            ? (requestedBoard.navigationWorkspaceId ??
              requestedBoard.workspaceId)
            : null,
        fallbackWorkspaceId =
          normalizedWorkspaces.find((workspace: Workspace) =>
            boardWorkspaceIds.has(workspace.id),
          )?.id ?? normalizedWorkspaces[0]?.id ?? null;
      setActiveWorkspaceId(
        (current) =>
          requestedWorkspaceId ??
          (current &&
          normalizedWorkspaces.some(
            (workspace: Workspace) => workspace.id === current,
          )
            ? current
            : fallbackWorkspaceId),
      );
      setActiveBoardId(
        (current) =>
          requestedBoard?.id ||
          (current &&
          normalizedBoards.some((b: BoardSummary) => b.id === current)
            ? current
            : normalizedBoards[0]?.id || null),
      );
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const loadBoard = async (id: number) => {
    setBoardData((current) =>
      current?.board.id === id ? current : null,
    );
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
    const saved = window.localStorage.getItem("northline-theme");
    const savedTextSize = window.localStorage.getItem("northline-text-size");
    const savedMyBoards = window.localStorage.getItem("northline-my-boards");
    const savedSharedBoards = window.localStorage.getItem(
      "northline-shared-boards",
    );
    const preferred = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
    setTheme(saved === "dark" || saved === "light" ? saved : preferred);
    if (
      savedTextSize === "small" ||
      savedTextSize === "default" ||
      savedTextSize === "large" ||
      savedTextSize === "xlarge"
    ) {
      setTextSize(savedTextSize);
    }
    if (savedMyBoards === "collapsed") setMyBoardsExpanded(false);
    if (savedSharedBoards === "collapsed") setSharedBoardsExpanded(false);
    jsonFetch("/api/auth/me")
      .then((d) => setAuthUser(d.user))
      .finally(() => setAuthLoading(false));
  }, []);
  const navigateFromHelp = (destination: HelpDestination) => setView(destination);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem("northline-theme", theme);
  }, [theme]);
  useEffect(() => {
    window.localStorage.setItem("northline-text-size", textSize);
  }, [textSize]);
  useEffect(() => {
    window.localStorage.setItem(
      "northline-my-boards",
      myBoardsExpanded ? "expanded" : "collapsed",
    );
  }, [myBoardsExpanded]);
  useEffect(() => {
    window.localStorage.setItem(
      "northline-shared-boards",
      sharedBoardsExpanded ? "expanded" : "collapsed",
    );
  }, [sharedBoardsExpanded]);
  useEffect(() => {
    if (window.matchMedia("(max-width: 950px)").matches) setSidebar(false);
    const query = new URLSearchParams(window.location.search),
      task = Number(query.get("task"));
    if (task > 0) setDeepLinkTaskId(task);
    if (query.has("collab")) setView("collabs");
    else if (query.get("view") === "calendars") setView("calendars");
  }, []);
  useEffect(() => {
    if (authUser) void loadBoards();
  }, [authUser]);
  useEffect(() => {
    if (!authUser) return;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    document.documentElement.dataset.timezone = timezone;
    window.localStorage.setItem("northline-timezone", timezone);
    if (authUser.timezone === timezone) return;
    jsonFetch("/api/settings/timezone", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone }),
    })
      .then(() =>
        setAuthUser((current) =>
          current ? { ...current, timezone } : current,
        ),
      )
      .catch((error) => notify(error.message));
  }, [authUser?.id, authUser?.timezone]);
  useEffect(() => {
    if (activeBoardId && view === "board") void loadBoard(activeBoardId);
  }, [activeBoardId, view]);
  useEffect(() => {
    const active = boards.find((board) => board.id === activeBoardId);
    if (!active || view !== "board") return;
    const query = new URLSearchParams(window.location.search);
    query.set("board", active.boardKey);
    window.history.replaceState({}, "", `${window.location.pathname}?${query}`);
  }, [activeBoardId, boards, view]);
  useEffect(() => {
    if (!deepLinkTaskId || !boardData) return;
    const linked = boardData.tasks.find((task) => task.id === deepLinkTaskId);
    if (linked) {
      setSelectedTask(linked);
      setModal("task-detail");
    }
    setDeepLinkTaskId(null);
    const query = new URLSearchParams(window.location.search);
    query.delete("task");
    query.set("board", boardData.board.boardKey);
    window.history.replaceState({}, "", `${window.location.pathname}?${query}`);
  }, [boardData, deepLinkTaskId]);
  useEffect(() => {
    if (
      view === "directory" ||
      view === "teams" ||
      modal === "share" ||
      modal === "workspace-manage" ||
      modal === "task-create" ||
      modal === "task-detail"
    )
      void loadDirectory();
  }, [view, modal]);
  useEffect(() => {
    if (isAdmin && view === "admin") void loadAdminUsers();
  }, [isAdmin, view]);
  useEffect(() => {
    if (search.trim().length < 2) {
      setGlobalResults([]);
      return;
    }
    const timer = window.setTimeout(
      () =>
        jsonFetch(`/api/search?q=${encodeURIComponent(search)}`)
          .then((data) => setGlobalResults(data.results || []))
          .catch(() => setGlobalResults([])),
      250,
    );
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    if (
      statusFilter !== "all" &&
      boardData &&
      !boardData.columns.some((column) => column.key === statusFilter)
    )
      setStatusFilter("all");
  }, [boardData, statusFilter]);
  const tasks = useMemo(() => {
    const list = [...(boardData?.tasks || [])].filter(
      (t) =>
        (t.title + t.description + t.tag + (t.ownerName || ""))
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (statusFilter === "all" || t.status === statusFilter) &&
        (priorityFilter === "all" || t.priority === priorityFilter) &&
        (assigneeFilter === "all" || (t.assigneeIds || (t.ownerId ? [t.ownerId] : [])).includes(Number(assigneeFilter))),
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
  }, [boardData, search, statusFilter, priorityFilter, assigneeFilter, sort]);
  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ||
    workspaces[0];
  const workspaceBoards = boards.filter(
    (board) =>
      Number(board.navigationWorkspaceId ?? board.workspaceId) ===
      Number(activeWorkspace?.id),
  );
  const sharedBoards = Array.from(
    new Map(
      [
        ...workspaceBoards.filter((board) => board.permission !== "owner"),
        ...boards.filter(
          (board) =>
            board.navigationWorkspaceId === 0 &&
            (board.permission === "editor" || board.permission === "viewer"),
        ),
      ].map((board) => [board.id, board]),
    ).values(),
  );
  const visibleBoards = workspaceBoards;
  const boardSearch = sidebarBoardSearch.trim().toLowerCase();
  const matchesSidebarBoard = (board: BoardSummary) =>
    !boardSearch ||
    [board.name, board.description, board.ownerName, board.workspaceName]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(boardSearch));
  const filteredVisibleBoards = visibleBoards.filter(matchesSidebarBoard);
  const filteredSharedBoards = sharedBoards.filter(matchesSidebarBoard);
  const showMyBoards = myBoardsExpanded || Boolean(boardSearch);
  const showSharedBoards = sharedBoardsExpanded || Boolean(boardSearch);
  // The API is the authorization boundary, while the selected workspace
  // controls navigation. Never mix boards from another workspace into this
  // view when a workspace has no boards of its own.
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
  const toggleTheme = () =>
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  if (authLoading)
    return <LoadingScreen theme={theme} toggleTheme={toggleTheme} />;
  if (!authUser)
    return (
      <Login onLogin={setAuthUser} theme={theme} toggleTheme={toggleTheme} />
    );
  return (
    <div className={`app-shell text-size-${textSize}`}>
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
        <button
          className="workspace"
          onClick={() => setWorkspaceMenu((open) => !open)}
          aria-expanded={workspaceMenu}
        >
          <span className="workspace-icon">
            {activeWorkspace?.kind === "personal" ? "P" : "W"}
          </span>
          <span>
            <b>{activeWorkspace?.name || "Workspace"}</b>
            <small>
              {activeWorkspace?.kind === "personal"
                ? "Personal workspace"
                : `${activeWorkspace?.memberCount || 0} shared members`}
            </small>
          </span>
          <i>⌄</i>
        </button>
        {workspaceMenu && (
          <div className="workspace-menu">
            <div className="workspace-menu-list">
              {workspaces.map((workspace) => (
                <button
                  className={workspace.id === activeWorkspace?.id ? "active" : ""}
                  key={workspace.id}
                  onClick={() => {
                    setActiveWorkspaceId(workspace.id);
                    const first = boards.find(
                      (board) =>
                        (board.navigationWorkspaceId ?? board.workspaceId) ===
                        workspace.id,
                    );
                    setActiveBoardId(first?.id || null);
                    setView("board");
                    setWorkspaceMenu(false);
                  }}
                >
                  <span>{workspace.kind === "personal" ? "♙" : "♜"}</span>
                  <b>{workspace.name}</b>
                  <small>{workspace.permission}</small>
                </button>
              ))}
            </div>
            <div>
              <button
                onClick={() => {
                  setModal("workspace-create");
                  setWorkspaceMenu(false);
                }}
              >
                ＋ New shared workspace
              </button>
              {activeWorkspace?.permission === "owner" && (
                  <button
                    onClick={() => {
                      setModal("workspace-manage");
                      setWorkspaceMenu(false);
                    }}
                  >
                    ⚙ Manage workspace
                  </button>
                )}
            </div>
          </div>
        )}
        <nav>
          <button
            className={view === "board" ? "active" : ""}
            onClick={() => setView("board")}
          >
            <span>⌂</span>Boards
          </button>
          <button
            className={view === "my-work" ? "active" : ""}
            onClick={() => setView("my-work")}
          >
            <span>✓</span>My Work
          </button>
          <button
            className={view === "time" ? "active" : ""}
            onClick={() => setView("time")}
          >
            <span>◷</span>My Time
          </button>
          <button
            className={view === "calendars" ? "active" : ""}
            onClick={() => setView("calendars")}
          >
            <span>▦</span>Calendars
          </button>
          <button
            className={view === "collabs" ? "active" : ""}
            onClick={() => setView("collabs")}
          >
            <span>♢</span>Collab planner
          </button>
          <button
            className={view === "teams" ? "active" : ""}
            onClick={() => setView("teams")}
          >
            <span>♧</span>Teams
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
        <label className="sidebar-board-search">
          <span aria-hidden="true">⌕</span>
          <input
            value={sidebarBoardSearch}
            onChange={(event) => setSidebarBoardSearch(event.target.value)}
            placeholder="Search boards..."
            aria-label="Search current workspace and shared boards"
          />
          {sidebarBoardSearch && (
            <button
              type="button"
              aria-label="Clear board search"
              onClick={() => setSidebarBoardSearch("")}
            >
              ×
            </button>
          )}
        </label>
        <div className="nav-label">
          <button
            type="button"
            className="nav-section-toggle"
            aria-expanded={showMyBoards}
            aria-controls="my-boards-navigation"
            onClick={() => setMyBoardsExpanded((expanded) => !expanded)}
          >
            <span>MY BOARDS</span>
            <span aria-hidden="true">{showMyBoards ? "⌄" : "›"}</span>
          </button>
          {activeWorkspace?.permission !== "viewer" && (
            <button
              type="button"
              aria-label="Create board"
              onClick={() => setModal("board-create")}
            >
              ＋
            </button>
          )}
        </div>
        {showMyBoards && (
          <nav className="boards" id="my-boards-navigation">
            {filteredVisibleBoards
            .filter((b) => b.permission === "owner")
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
            {!filteredVisibleBoards.filter((b) => b.permission === "owner").length && (
              <span className="nav-empty">
                {boardSearch ? "No matching boards" : "No boards in this workspace"}
              </span>
            )}
          </nav>
        )}
        <div className="nav-label">
          <button
            type="button"
            className="nav-section-toggle"
            aria-expanded={showSharedBoards}
            aria-controls="shared-boards-navigation"
            onClick={() => setSharedBoardsExpanded((expanded) => !expanded)}
          >
            <span>SHARED WITH ME</span>
            <span aria-hidden="true">{showSharedBoards ? "⌄" : "›"}</span>
          </button>
        </div>
        {showSharedBoards && (
          <nav className="boards" id="shared-boards-navigation">
            {filteredSharedBoards.map((b) => (
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
            {!filteredSharedBoards.length && (
              <span className="nav-empty">
                {boardSearch ? "No matching boards" : "No shared boards"}
              </span>
            )}
          </nav>
        )}
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
            className={view === "help" ? "active" : ""}
            onClick={() => setView("help")}
          >
            <span>?</span>Help Center
          </button>
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
            <SearchIcon />
            <input
              aria-label="Global task search"
              placeholder="Search every board…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <kbd>⌘ K</kbd>
            {globalResults.length > 0 && (
              <div className="global-results">
                {globalResults.map((result) => (
                  <button
                    key={result.id}
                    onClick={() => {
                      setActiveBoardId(result.boardId);
                      setView("board");
                      setDeepLinkTaskId(result.id);
                      setGlobalResults([]);
                      setSearch("");
                    }}
                  >
                    <b>{result.title}</b>
                    <span>
                      {result.boardName} · {result.status}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="top-actions">
            <ThemeToggle theme={theme} toggle={toggleTheme} />
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
              assigneeFilter={assigneeFilter}
              setAssigneeFilter={setAssigneeFilter}
              sort={sort}
              setSort={setSort}
              dragged={dragged}
              setDragged={setDragged}
              moveTask={moveTask}
              openTask={(task: Task) => {
                setSelectedTask(task);
                setModal("task-detail");
              }}
              openDiscussion={(task: Task) => {
                setSelectedTask(task);
                setModal("task-comments");
              }}
              openModal={setModal}
            />
          ))}
        {view === "directory" && <Directory users={directoryUsers} />}
        {view === "my-work" && (
          <MyWork
            notify={notify}
            openTask={(task) => {
              const summary = boards.find((board) => board.id === task.boardId);
              setActiveWorkspaceId(
                summary?.navigationWorkspaceId ?? task.workspaceId,
              );
              setActiveBoardId(task.boardId);
              setView("board");
              setDeepLinkTaskId(task.id);
            }}
          />
        )}
        {view === "time" && <TimeCard notify={notify} />}
        {view === "calendars" && <CalendarHub notify={notify} userTimezone={authUser.timezone} />}
        {view === "collabs" && <CollabPlanner notify={notify} userTimezone={authUser.timezone} />}
        {view === "teams" && <Teams notify={notify} workspaces={workspaces} people={directoryUsers} onWorkspacesChanged={loadBoards} />}
        {view === "reminders" && <ReminderCenter notify={notify} />}
        {view === "help" && (
          <HelpCenter
            navigate={navigateFromHelp}
            showWelcome={() => setShowWelcome(true)}
          />
        )}
        {view === "settings" && (
          <Settings
            notify={notify}
            timezone={authUser.timezone}
            textSize={textSize}
            setTextSize={setTextSize}
          />
        )}
        {view === "admin" && isAdmin && (
          <Admin users={users} reloadUsers={loadAdminUsers} notify={notify} />
        )}
      </main>
      <TimeClock notify={notify} />
      {showWelcome && (
        <WelcomeGuide
          name={authUser.name}
          navigate={navigateFromHelp}
          openHelp={() => setView("help")}
          dismiss={() => setShowWelcome(false)}
        />
      )}
      {modal && (
        <NorthlineModal
          type={modal}
          close={() => {
            setModal(null);
            setSelectedTask(null);
          }}
          board={boardData}
          task={selectedTask}
          people={boardData?.assignees || []}
          directoryPeople={directoryUsers}
          workspaces={workspaces}
          activeWorkspace={activeWorkspace}
          setActiveWorkspaceId={setActiveWorkspaceId}
          busy={busy}
          run={mutate}
          refresh={refresh}
          notify={notify}
          openTaskReminder={() => setModal("reminder")}
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

function ThemeToggle({
  theme,
  toggle,
}: {
  theme: "light" | "dark";
  toggle: () => void;
}) {
  return (
    <button
      className="theme-toggle"
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
      <em>{theme === "dark" ? "Light" : "Dark"}</em>
    </button>
  );
}
function LoadingScreen({
  theme,
  toggleTheme,
}: {
  theme: "light" | "dark";
  toggleTheme: () => void;
}) {
  return (
    <div className="auth-screen">
      <div className="auth-theme">
        <ThemeToggle theme={theme} toggle={toggleTheme} />
      </div>
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
function Login({
  onLogin,
  theme,
  toggleTheme,
}: {
  onLogin: (u: SessionUser) => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("auth_error");
    if (!code) return;
    const messages: Record<string, string> = {
      invalid_state: "Your sign-in session expired. Please try again.",
      access_denied:
        "Your Authentik account is not in Northline Users or Northline Admins. Ask the site owner to add the correct access group, then try again.",
      identity_conflict:
        "Northline could not safely match this identity. Ask an administrator to review the account.",
      token_exchange: "Authentik could not complete sign-in. Please try again.",
      userinfo: "Authentik could not load your profile. Please try again.",
      incomplete_profile:
        "Your Authentik profile needs an email address before you can sign in.",
      oidc_not_configured: "Authentik sign-in is not configured.",
    };
    setError(
      messages[code] || "Sign-in could not be completed. Please try again.",
    );
    window.history.replaceState({}, "", window.location.pathname);
  }, []);
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
      <div className="auth-theme">
        <ThemeToggle theme={theme} toggle={toggleTheme} />
      </div>
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
      <span className="nav-board-copy">
        <span className="nav-board-name">{board.name}</span>
        {shared && (
          <small>
            {board.ownerName}
            {board.workspaceName ? ` · ${board.workspaceName}` : ""}
          </small>
        )}
      </span>
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

function MyWork({
  notify,
  openTask,
}: {
  notify: (message: string) => void;
  openTask: (task: MyWorkTask) => void;
}) {
  const [tasks, setTasks] = useState<MyWorkTask[]>([]);
  const [columns, setColumns] = useState<
    Array<{
      boardId: number;
      key: string;
      name: string;
      color: string;
      position: number;
      isDone: number;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [workspace, setWorkspace] = useState("all");
  const [board, setBoard] = useState("all");
  const [priority, setPriority] = useState("all");
  const [status, setStatus] = useState("all");
  const load = async () => {
    setLoading(true);
    try {
      const data = await jsonFetch("/api/my-work");
      setTasks(data.tasks || []);
      setColumns(data.columns || []);
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const update = async (task: MyWorkTask, changes: Record<string, unknown>) => {
    setSaving(task.id);
    try {
      await jsonFetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      await load();
      notify("Task updated");
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setSaving(null);
    }
  };
  const workspaces = [
    ...new Map(
      tasks.map((task) => [
        task.workspaceId,
        { id: task.workspaceId, name: task.workspaceName },
      ]),
    ).values(),
  ];
  const boards = [
    ...new Map(
      tasks
        .filter(
          (task) =>
            workspace === "all" || String(task.workspaceId) === workspace,
        )
        .map((task) => [
          task.boardId,
          { id: task.boardId, name: task.boardName },
        ]),
    ).values(),
  ];
  const statuses = [...new Set(tasks.map((task) => task.statusName))].sort();
  const filtered = tasks.filter(
    (task) =>
      (workspace === "all" || String(task.workspaceId) === workspace) &&
      (board === "all" || String(task.boardId) === board) &&
      (priority === "all" || task.priority === priority) &&
      (status === "all" || task.statusName === status) &&
      (
        task.title +
        task.description +
        task.tag +
        task.boardName +
        task.workspaceName
      )
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const localDate = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const today = localDate(new Date()),
    soonDate = new Date();
  soonDate.setDate(soonDate.getDate() + 7);
  const soon = localDate(soonDate);
  const groups = [
    {
      key: "overdue",
      title: "Overdue",
      copy: "Past due and still open",
      tasks: filtered.filter(
        (task) => !task.isDone && !!task.due && task.due < today,
      ),
    },
    {
      key: "soon",
      title: "Due soon",
      copy: "Due in the next seven days",
      tasks: filtered.filter(
        (task) =>
          !task.isDone && !!task.due && task.due >= today && task.due <= soon,
      ),
    },
    {
      key: "later",
      title: "Later",
      copy: "Scheduled beyond the next seven days",
      tasks: filtered.filter(
        (task) => !task.isDone && !!task.due && task.due > soon,
      ),
    },
    {
      key: "unscheduled",
      title: "Unscheduled",
      copy: "Open work without a due date",
      tasks: filtered.filter((task) => !task.isDone && !task.due),
    },
    {
      key: "completed",
      title: "Completed",
      copy: "Finished assigned work",
      tasks: filtered.filter((task) => !!task.isDone),
    },
  ];
  if (loading) return <PageLoading />;
  return (
    <div className="content my-work-page">
      <div className="page-title">
        <div>
          <span className="eyebrow">PERSONAL TASK VIEW</span>
          <h1>My Work</h1>
          <p>
            Everything assigned to you across the boards and workspaces you can
            access.
          </p>
        </div>
        <button className="secondary" onClick={() => void load()}>
          ↻ Refresh
        </button>
      </div>
      <div className="my-work-metrics">
        <article>
          <b>{filtered.filter((task) => !task.isDone).length}</b>
          <span>Open</span>
        </article>
        <article className="danger">
          <b>
            {
              filtered.filter(
                (task) => !task.isDone && !!task.due && task.due < today,
              ).length
            }
          </b>
          <span>Overdue</span>
        </article>
        <article>
          <b>
            {
              filtered.filter(
                (task) =>
                  !task.isDone &&
                  !!task.due &&
                  task.due >= today &&
                  task.due <= soon,
              ).length
            }
          </b>
          <span>Due soon</span>
        </article>
        <article>
          <b>{filtered.filter((task) => !!task.isDone).length}</b>
          <span>Completed</span>
        </article>
      </div>
      <div className="my-work-filters">
        <label className="my-work-search">
          ⌕
          <input
            aria-label="Search assigned tasks"
            placeholder="Search my tasks…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <select
          aria-label="Filter by workspace"
          value={workspace}
          onChange={(event) => {
            setWorkspace(event.target.value);
            setBoard("all");
          }}
        >
          <option value="all">All workspaces</option>
          {workspaces.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by board"
          value={board}
          onChange={(event) => setBoard(event.target.value)}
        >
          <option value="all">All boards</option>
          {boards.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by priority"
          value={priority}
          onChange={(event) => setPriority(event.target.value)}
        >
          <option value="all">All priorities</option>
          <option>High</option>
          <option>Medium</option>
          <option>Low</option>
        </select>
        <select
          aria-label="Filter by status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="all">All statuses</option>
          {statuses.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </div>
      {!filtered.length ? (
        <div className="empty-state large">
          <span className="empty-icon">◎</span>
          <b>No assigned tasks</b>
          <span>
            Tasks assigned to you will appear here across every accessible
            workspace.
          </span>
        </div>
      ) : (
        <div className="my-work-groups">
          {groups
            .filter((group) => group.tasks.length)
            .map((group) => (
              <section key={group.key} className={`my-work-group ${group.key}`}>
                <header>
                  <div>
                    <h2>{group.title}</h2>
                    <p>{group.copy}</p>
                  </div>
                  <span>{group.tasks.length}</span>
                </header>
                <div>
                  {group.tasks.map((task) => {
                    const editable = task.permission !== "viewer",
                      taskColumns = columns.filter(
                        (column) => column.boardId === task.boardId,
                      );
                    return (
                      <article className="my-work-task" key={task.id}>
                        <button
                          className="my-work-task-title"
                          onClick={() => openTask(task)}
                        >
                          <i style={{ background: task.statusColor }} />
                          <span>
                            <b>{task.title}</b>
                            <small>
                              {task.workspaceName} / {task.boardName} ·{" "}
                              {task.tag}
                            </small>
                          </span>
                        </button>
                        <div className="my-work-task-controls">
                          <select
                            aria-label={`Status for ${task.title}`}
                            value={task.status}
                            disabled={!editable || saving === task.id}
                            onChange={(event) =>
                              void update(task, { status: event.target.value })
                            }
                          >
                            {taskColumns.map((column) => (
                              <option key={column.key} value={column.key}>
                                {column.name}
                              </option>
                            ))}
                          </select>
                          <select
                            aria-label={`Priority for ${task.title}`}
                            value={task.priority}
                            disabled={!editable || saving === task.id}
                            onChange={(event) =>
                              void update(task, {
                                priority: event.target.value,
                              })
                            }
                          >
                            <option>High</option>
                            <option>Medium</option>
                            <option>Low</option>
                          </select>
                          <input
                            aria-label={`Due date for ${task.title}`}
                            type="date"
                            value={task.due || ""}
                            disabled={!editable || saving === task.id}
                            onChange={(event) =>
                              void update(task, {
                                due_date: event.target.value || null,
                              })
                            }
                          />
                          <button
                            className="icon-button"
                            aria-label={`Open ${task.title}`}
                            onClick={() => openTask(task)}
                          >
                            ›
                          </button>
                        </div>
                        {!editable && (
                          <small className="read-only-note">View only</small>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
        </div>
      )}
    </div>
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
  assigneeFilter,
  setAssigneeFilter,
  sort,
  setSort,
  dragged,
  setDragged,
  moveTask,
  openTask,
  openDiscussion,
  openModal,
}: any) {
  const columns = data.columns as BoardColumn[];
  const [showCompleted, setShowCompleted] = useState(false);
  const done = tasks.filter(
    (t: Task) =>
      columns.find((column) => column.key === t.status)?.isDone === 1,
  ).length;
  const visibleTasks = showCompleted
    ? tasks
    : tasks.filter(
        (t: Task) =>
          columns.find((column) => column.key === t.status)?.isDone !== 1,
      );
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
            {(data.sharedWith || data.members).slice(0, 4).map((m: BoardAccess | Member) => (
              <Avatar
                key={m.id}
                name={m.name}
                avatar={m.avatar}
                color="#2f9dde"
              />
            ))}
            {(data.sharedWith || data.members).length > 4 && (
              <span className="avatar-more">+{(data.sharedWith || data.members).length - 4}</span>
            )}
          </div>
          <button
            className="secondary"
            onClick={() => openModal("members")}
            aria-label="View board owner and members"
          >
            Members
          </button>
          {data.canShare && (
            <button className="secondary" onClick={() => openModal("share")}>
              ♙ Share
            </button>
          )}
          {data.canEdit && (
            <button className="secondary" onClick={() => openModal("columns")}>
              ☷ Columns
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
          <button
            className="secondary"
            onClick={() => openModal("activity")}
            aria-label="View board activity"
          >
            ◷ Activity
          </button>
          {data.canEdit && (
            <button className="secondary" onClick={() => openModal("archive")}>
              Archive
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
              <option key={c.id} value={c.key}>
                {c.name}
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
          Assigned to
          <select
            aria-label="Filter by assigned user"
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
          >
            <option value="all">Everyone</option>
            {data.assignees.map((person: { id: number; name: string }) => (
              <option key={person.id} value={person.id}>{person.name}</option>
            ))}
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
        <label className="completed-toggle">
          <input
            type="checkbox"
            checked={showCompleted}
            onChange={(event) => setShowCompleted(event.target.checked)}
          />{" "}
          Show completed
        </label>
        <button
          className="reminder-link"
          disabled={!data.canEdit}
          onClick={() => openModal("reminder")}
        >
          ◷ Schedule reminder
        </button>
      </div>
      {mode === "board" && (
        <Kanban
          data={data}
          tasks={visibleTasks}
          dragged={dragged}
          setDragged={setDragged}
          moveTask={moveTask}
          openTask={openTask}
          openComments={openDiscussion}
          add={() => openModal("task-create")}
        />
      )}{" "}
      {mode === "list" && (
        <TaskList
          tasks={visibleTasks}
          columns={columns}
          openTask={openTask}
          canEdit={data.canEdit}
          dragged={dragged}
          setDragged={setDragged}
          moveTask={moveTask}
          add={() => openModal("task-create")}
        />
      )}{" "}
      {mode === "timeline" && (
        <Timeline tasks={visibleTasks} columns={columns} openTask={openTask} />
      )}{" "}
      {mode === "calendar" && (
        <Calendar tasks={visibleTasks} columns={columns} openTask={openTask} />
      )}{" "}
      {visibleTasks.length === 0 && (
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
  openComments,
  add,
}: any) {
  return (
    <div
      className="kanban"
      style={{
        gridTemplateColumns: `repeat(${data.columns.length}, minmax(210px, 1fr))`,
      }}
    >
      {data.columns.map((col: BoardColumn) => (
        <div
          className="column"
          key={col.id}
          onDragOver={(e) => data.canEdit && e.preventDefault()}
          onDrop={() => {
            if (dragged) void moveTask(dragged, col.key);
            setDragged(null);
          }}
        >
          <div className="column-head">
            <span style={{ background: col.color }} />
            {col.name}
            <em>{tasks.filter((t: Task) => t.status === col.key).length}</em>
          </div>
          <div className="cards">
            {tasks
              .filter((t: Task) => t.status === col.key)
              .map((task: Task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  canEdit={data.canEdit}
                  setDragged={setDragged}
                  open={() => openTask(task)}
                  openComments={() => openComments(task)}
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
  openComments,
}: {
  task: Task;
  canEdit: boolean;
  setDragged: (id: number) => void;
  open: () => void;
  openComments: () => void;
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
        <span className="task-assignee-stack">
          {(task.assignees?.length ? task.assignees.slice(0, 3) : [{ id: 0, name: task.ownerName || "Unassigned", avatar: task.ownerAvatar }]).map((person) => (
            <Avatar key={person.id} name={person.name} avatar={person.avatar} />
          ))}
          {(task.assignees?.length || 0) > 3 && <small>+{task.assignees!.length - 3}</small>}
        </span>
        <span>◷ {task.due || "No date"}</span>
        <button
          className="comments comment-quick-button"
          aria-label={`Open discussion for ${task.title}`}
          title="Open discussion"
          onClick={(event) => {
            event.stopPropagation();
            openComments();
          }}
        >
          ◌ {task.comments}
        </button>
      </div>
    </article>
  );
}
function TaskList({
  tasks,
  columns,
  openTask,
  canEdit,
  dragged,
  setDragged,
  moveTask,
  add,
}: {
  tasks: Task[];
  columns: BoardColumn[];
  openTask: (task: Task) => void;
  canEdit: boolean;
  dragged: number | null;
  setDragged: (id: number | null) => void;
  moveTask: (taskId: number, status: Status) => void;
  add: () => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const toggle = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const dueLabel = (due: string | null) => {
    if (!due) return "";
    const date = new Date(`${due}T00:00:00`);
    return Number.isNaN(date.getTime())
      ? due
      : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };
  return (
    <div className="grouped-list">
      {columns.map((column) => {
        const group = tasks.filter((task) => task.status === column.key);
        const isCollapsed = collapsed.has(column.key);
        return (
          <section
            className={`list-group${dropTarget === column.key ? " drop-target" : ""}`}
            key={column.id}
            style={{ "--group-color": column.color } as React.CSSProperties}
            onDragEnter={(event) => {
              if (!canEdit || dragged === null) return;
              event.preventDefault();
              setDropTarget(column.key);
            }}
            onDragOver={(event) => {
              if (!canEdit || dragged === null) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node))
                setDropTarget((current) =>
                  current === column.key ? null : current,
                );
            }}
            onDrop={(event) => {
              event.preventDefault();
              const task = tasks.find((item) => item.id === dragged);
              if (canEdit && task && task.status !== column.key)
                void moveTask(task.id, column.key);
              setDropTarget(null);
              setDragged(null);
            }}
          >
            <button
              className="list-group-title"
              aria-expanded={!isCollapsed}
              onClick={() => toggle(column.key)}
            >
              <span className={isCollapsed ? "collapsed" : ""}>⌄</span>
              <b>{column.name}</b>
              <em>{group.length}</em>
            </button>
            {!isCollapsed && (
              <div className="list-table-wrap">
                <div className="list-table">
                  <div className="list-table-row list-table-head">
                    <span className="list-check" aria-hidden="true" />
                    <span>Task</span>
                    <span>Person</span>
                    <span>Status</span>
                    <span>Date</span>
                    <span>Priority</span>
                  </div>
                  {group.map((task) => (
                    <button
                      className={`list-table-row list-task-row${dragged === task.id ? " dragging" : ""}`}
                      key={task.id}
                      draggable={canEdit}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData(
                          "text/plain",
                          String(task.id),
                        );
                        setDragged(task.id);
                      }}
                      onDragEnd={() => {
                        setDragged(null);
                        setDropTarget(null);
                      }}
                      onClick={() => openTask(task)}
                      title={
                        canEdit
                          ? "Open task, or drag it to another category"
                          : "Open task"
                      }
                    >
                      <span className="list-check" aria-hidden="true" />
                      <span className="list-task-title">
                        <b>{task.title}</b>
                        {task.comments > 0 && (
                          <small title={`${task.comments} comments`}>
                            ◌ {task.comments}
                          </small>
                        )}
                      </span>
                      <span className="list-person">
                        <span className="task-assignee-stack">
                          {(task.assignees?.length ? task.assignees.slice(0, 3) : [{ id: 0, name: task.ownerName || "Unassigned", avatar: task.ownerAvatar }]).map((person) => (
                            <Avatar key={person.id} name={person.name} avatar={person.avatar} />
                          ))}
                        </span>
                        <span>{task.assignees?.length ? task.assignees.map((person) => person.name).join(", ") : task.ownerName || "Unassigned"}</span>
                      </span>
                      <span
                        className="list-status"
                        style={{ backgroundColor: column.color }}
                      >
                        {column.name}
                      </span>
                      <span>{dueLabel(task.due)}</span>
                      <span
                        className={`priority ${task.priority.toLowerCase()}`}
                      >
                        {task.priority}
                      </span>
                    </button>
                  ))}
                  {canEdit && (
                    <button className="list-add-row" onClick={add}>
                      <span className="list-check" aria-hidden="true" />
                      <span>+ Add task</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
function Timeline({
  tasks,
  columns,
  openTask,
}: {
  tasks: Task[];
  columns: BoardColumn[];
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
          <i
            className="timeline-dot"
            style={{
              background: columns.find((c) => c.key === t.status)?.color,
            }}
          />
          <span>
            <b>{t.title}</b>
            <small>
              {t.ownerName || "Unassigned"} ·{" "}
              {columns.find((c) => c.key === t.status)?.name || "Unknown"}
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
  columns,
  openTask,
}: {
  tasks: Task[];
  columns: BoardColumn[];
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
                <i
                  className="status-dot"
                  style={
                    {
                      "--status-color": columns.find((c) => c.key === t.status)
                        ?.color,
                    } as React.CSSProperties
                  }
                />
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
  const [schedule, setSchedule] = useState<PublicStreamSchedule | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState<number | null>(null);
  const [scheduleError, setScheduleError] = useState("");
  const [contact, setContact] = useState<WorkspaceUser | null>(null);
  const list = users.filter(
    (p) =>
      (p.name + p.email).toLowerCase().includes(query.toLowerCase()) &&
      (role === "all" || p.role === role),
  );
  const openSchedule = async (person: WorkspaceUser) => {
    if (!person.publicStreamCalendarCount) return;
    setScheduleLoading(person.id);
    setScheduleError("");
    try {
      setSchedule(
        await jsonFetch(`/api/directory/${person.id}/stream-schedule`),
      );
    } catch (error) {
      setScheduleError((error as Error).message);
    } finally {
      setScheduleLoading(null);
    }
  };
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
          <SearchIcon />
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
            <div className="person-identity">
              <span className="person-avatar">
                <Avatar name={p.name} avatar={p.avatar} color={p.color} />
                <i className="online" title="Active" />
              </span>
              <div>
                <h3>{p.name}</h3>
                <p>{p.role === "Admin" ? "Northline administrator" : "Community member"}</p>
              </div>
            </div>
            <div className="person-meta">
              <span>{p.role}</span>
              <small>
                {p.boards} board{p.boards === 1 ? "" : "s"}
              </small>
            </div>
            {p.teamNames?.length ? <div className="person-teams"><small>Teams</small><span>{p.teamNames.join(" · ")}</span></div> : null}
            <div className="person-actions">
              <button className="secondary" onClick={() => setContact(p)}>
                Contact card
              </button>
              <button
                className="secondary person-schedule-button"
                disabled={
                  !p.publicStreamCalendarCount || scheduleLoading === p.id
                }
                title={
                  p.publicStreamCalendarCount
                    ? `View ${p.name}'s public stream schedule`
                    : `${p.name} does not have a public stream schedule`
                }
                onClick={() => void openSchedule(p)}
              >
                {scheduleLoading === p.id
                  ? "Loading schedule…"
                  : p.publicStreamCalendarCount
                    ? "View public stream schedule"
                    : "No public stream schedule"}
              </button>
            </div>
          </article>
        ))}
      </div>
      {!list.length && (
        <Empty
          title="No matching people"
          copy="Try a different name, email, or role."
        />
      )}
      {scheduleError && (
        <div className="toast error" role="alert">
          {scheduleError}
        </div>
      )}
      {contact && (
        <div className="modal-backdrop">
          <div
            className="modal contact-card-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="contact-card-title"
          >
            <button
              className="modal-close"
              aria-label="Close contact card"
              onClick={() => setContact(null)}
            >
              ×
            </button>
            <div className="contact-card-profile">
              <Avatar
                name={contact.name}
                avatar={contact.avatar}
                color={contact.color}
              />
              <div>
                <div className="eyebrow">CONTACT CARD</div>
                <h2 id="contact-card-title">{contact.name}</h2>
                <span>{contact.role}</span>
              </div>
            </div>
            <dl className="contact-card-details">
              <div>
                <dt>Email</dt>
                <dd>
                  <a href={`mailto:${contact.email}`}>{contact.email}</a>
                </dd>
              </div>
              <div>
                <dt>Discord</dt>
                <dd>
                  {contact.discordUsername
                    ? `@${contact.discordUsername}`
                    : "Discord not linked"}
                </dd>
              </div>
            </dl>
            <button
              className="primary wide"
              disabled={!contact.publicStreamCalendarCount}
              onClick={() => {
                setContact(null);
                void openSchedule(contact);
              }}
            >
              {contact.publicStreamCalendarCount
                ? "View public stream schedule"
                : "No public stream schedule"}
            </button>
          </div>
        </div>
      )}
      {schedule && (
        <div className="modal-backdrop">
          <div
            className="modal public-schedule-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="public-schedule-title"
          >
            <button
              className="modal-close"
              aria-label="Close public stream schedule"
              onClick={() => setSchedule(null)}
            >
              ×
            </button>
            <div className="public-schedule-heading">
              <Avatar
                name={schedule.owner.name}
                avatar={schedule.owner.avatar}
                color="#7961e8"
              />
              <div>
                <div className="eyebrow">PUBLIC STREAM SCHEDULE</div>
                <h2 id="public-schedule-title">{schedule.owner.name}</h2>
                <p>
                  {schedule.calendars
                    .map((calendar) => calendar.name)
                    .join(", ")}
                </p>
              </div>
            </div>
            <div className="public-schedule-events">
              {schedule.events.map((event) => (
                <article key={event.id}>
                  <i style={{ background: event.color }} />
                  <time>
                    {new Date(event.startAt).toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                    <small>
                      {new Date(event.startAt).toLocaleTimeString(undefined, {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                      {" – "}
                      {new Date(event.endAt).toLocaleTimeString(undefined, {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </small>
                  </time>
                  <div>
                    <b>{event.title}</b>
                    <span>
                      {[event.game, event.platform]
                        .filter(Boolean)
                        .join(" · ") || event.calendarName}
                    </span>
                    {event.description && <p>{event.description}</p>}
                  </div>
                  {/^https?:\/\//i.test(event.streamUrl) && (
                    <a
                      className="secondary"
                      href={event.streamUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Stream link
                    </a>
                  )}
                </article>
              ))}
              {!schedule.events.length && (
                <div className="empty-state">
                  <b>No upcoming public streams</b>
                  <span>
                    This calendar is public but has no upcoming events.
                  </span>
                </div>
              )}
            </div>
            <p className="field-note">
              Times are shown in your current device time zone.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function Settings({
  notify,
  timezone,
  textSize,
  setTextSize,
}: {
  notify: (s: string) => void;
  timezone: string;
  textSize: TextSize;
  setTextSize: (value: TextSize) => void;
}) {
  const [discord, setDiscord] = useState<{
    configured: boolean;
    channels: { id: string; name: string }[];
    error?: string;
  } | null>(null);
  const [preferences, setPreferences] = useState({
    assignmentEnabled: true,
    statusEnabled: true,
    commentEnabled: true,
    mentionEnabled: true,
    dueEnabled: true,
  });
  const [sessions, setSessions] = useState<
    Array<{
      id: string;
      createdAt: string;
      expiresAt: string;
      lastSeenAt: string | null;
      userAgent: string | null;
      createdIp: string | null;
      current: number;
    }>
  >([]);
  const loadSessions = () =>
    jsonFetch("/api/settings/sessions")
      .then((data) => setSessions(data.sessions || []))
      .catch((error) => notify(error.message));
  useEffect(() => {
    jsonFetch("/api/discord/channels")
      .then(setDiscord)
      .catch((e) =>
        setDiscord({ configured: false, channels: [], error: e.message }),
      );
    jsonFetch("/api/settings/notifications")
      .then((data) =>
        setPreferences(
          Object.fromEntries(
            Object.entries(data.settings).map(([key, value]) => [
              key,
              value !== 0,
            ]),
          ) as typeof preferences,
        ),
      )
      .catch(() => {});
    void loadSessions();
  }, []);
  return (
    <section className="content settings">
      <div className="page-title">
        <div>
          <div className="eyebrow">WORKSPACE SETTINGS</div>
          <h1>Integrations</h1>
          <p>Connect community tools and manage private Northline updates.</p>
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
              `Task Buddy is available in ${discord?.channels.length || 0} shared-server channels and delivers reminders privately. Bot credentials are managed only through the server environment.`}
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
      <div className="settings-body session-settings">
        <div>
          <h3>Active sessions</h3>
          <p>
            Review browsers currently signed into your account and revoke any
            session you do not recognize.
          </p>
          <div className="session-list">
            {sessions.map((session) => (
              <article key={session.id}>
                <span>
                  <b>
                    {session.current
                      ? "This browser"
                      : session.userAgent?.split(" ").slice(0, 4).join(" ") ||
                        "Unknown browser"}
                  </b>
                  <small>
                    Started {new Date(`${session.createdAt}Z`).toLocaleString()}{" "}
                    · expires{" "}
                    {new Date(`${session.expiresAt}Z`).toLocaleDateString()}
                    {session.createdIp ? ` · ${session.createdIp}` : ""}
                  </small>
                </span>
                {session.current ? (
                  <em>Current</em>
                ) : (
                  <button
                    className="danger subtle"
                    onClick={() =>
                      jsonFetch("/api/settings/sessions", {
                        method: "DELETE",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: session.id }),
                      })
                        .then(loadSessions)
                        .then(() => notify("Session revoked"))
                        .catch((error) => notify(error.message))
                    }
                  >
                    Revoke
                  </button>
                )}
              </article>
            ))}
          </div>
        </div>
        {sessions.length > 1 && (
          <button
            className="secondary"
            onClick={() =>
              jsonFetch("/api/settings/sessions", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ allOthers: true }),
              })
                .then(loadSessions)
                .then(() => notify("Other sessions revoked"))
                .catch((error) => notify(error.message))
            }
          >
            Revoke all others
          </button>
        )}
      </div>
      <div className="settings-body">
        <div>
          <h3>Local time zone</h3>
          <p>
            Northline detected <b>{timezone}</b> from this device. Shared
            timestamps are stored in UTC and displayed in this time zone.
          </p>
        </div>
        <span className="connected">● Device synchronized</span>
      </div>
      <div className="settings-body settings-accessibility">
        <div>
          <h3>Accessibility</h3>
          <p>
            Adjust text and controls across Northline to make them easier to
            read. This preference is saved on this device only.
          </p>
        </div>
        <label className="settings-select">
          <span className="sr-only">Application text size</span>
          <select
            value={textSize}
            aria-label="Application text size"
            onChange={(event) => setTextSize(event.target.value as TextSize)}
          >
            <option value="small">Small</option>
            <option value="default">Default</option>
            <option value="large">Large</option>
            <option value="xlarge">Extra large</option>
          </select>
        </label>
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
        <div>
          <h3>My Task Buddy preferences</h3>
          <p>Choose which task events Task Buddy may deliver privately.</p>
          <div className="notification-options">
            {(
              [
                ["assignmentEnabled", "Assignments"],
                ["statusEnabled", "Status changes"],
                ["commentEnabled", "Comments"],
                ["mentionEnabled", "Mentions"],
                ["dueEnabled", "Due-date warnings"],
              ] as const
            ).map(([key, label]) => (
              <label className="notification-toggle" key={key}>
                <input
                  type="checkbox"
                  checked={preferences[key]}
                  onChange={(e) =>
                    setPreferences({ ...preferences, [key]: e.target.checked })
                  }
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>
        <button
          className="secondary"
          onClick={() =>
            jsonFetch("/api/settings/notifications", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(preferences),
            })
              .then(() => notify("Notification preferences saved"))
              .catch((e) => notify(e.message))
          }
        >
          Save preferences
        </button>
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
  const [tab, setTab] = useState<
    "overview" | "users" | "boards" | "audit" | "time" | "security" | "health"
  >("overview");
  const [query, setQuery] = useState("");
  const [create, setCreate] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "Member",
  });
  const [overview, setOverview] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [adminTime, setAdminTime] = useState<any>(null);
  const [adminTeamSettings, setAdminTeamSettings] = useState<any>(null);
  const [mainTeamDraft, setMainTeamDraft] = useState("");
  const [healthLive, setHealthLive] = useState(true);
  const loadOverview = () =>
    jsonFetch("/api/admin/overview")
      .then(setOverview)
      .catch((e) => notify(e.message));
  const loadAdminTeamSettings = () =>
    jsonFetch("/api/admin/settings")
      .then((data) => {
        setAdminTeamSettings(data);
        setMainTeamDraft(data.mainTeamId ? String(data.mainTeamId) : "");
      })
      .catch((e) => notify(e.message));
  useEffect(() => {
    void loadOverview();
    void loadAdminTeamSettings();
    jsonFetch("/api/admin/health")
      .then(setHealth)
      .catch((e) => notify(e.message));
    jsonFetch("/api/admin/time")
      .then(setAdminTime)
      .catch((e) => notify(e.message));
  }, []);
  useEffect(() => {
    if (tab !== "health" || !healthLive) return;
    const timer = window.setInterval(
      () =>
        jsonFetch("/api/admin/health")
          .then(setHealth)
          .catch(() => undefined),
      5000,
    );
    return () => window.clearInterval(timer);
  }, [tab, healthLive]);
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
  const saveMainTeam = async () => {
    await jsonFetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mainTeamId: mainTeamDraft || null }),
    });
    await loadAdminTeamSettings();
    notify(mainTeamDraft ? "Main team updated" : "Main team cleared");
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
          <p>One place for operations, people, access, time, and recovery.</p>
        </div>
        <div
          className={`admin-live-status ${health && Object.values([health.database?.status, health.storage?.status, health.discord?.status, health.backup?.status, health.restore?.status]).some((status) => status === "degraded" || status === "unknown") ? "degraded" : "healthy"}`}
        >
          <i />
          <span>{health ? "Live system status" : "Loading status"}</span>
        </div>
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
        <Metric
          label="ACTIVE TIMERS"
          value={overview?.metrics.activeTimers ?? 0}
        />
      </div>
      <div className="admin-panel">
        <div className="admin-tabs">
          {(
            [
              "overview",
              "users",
              "boards",
              "time",
              "health",
              "audit",
              "security",
            ] as const
          ).map((name) => (
            <button
              key={name}
              className={tab === name ? "active" : ""}
              onClick={() => setTab(name)}
            >
              {name[0].toUpperCase() + name.slice(1)}
            </button>
          ))}
        </div>
        {tab === "overview" && (
          <div className="admin-dashboard">
            <div className="admin-dashboard-heading">
              <div>
                <span className="eyebrow">LIVE OPERATIONS</span>
                <h2>Administration overview</h2>
                <p>Current service health and the tools that need attention.</p>
              </div>
              <button
                className="secondary"
                onClick={() => {
                  void loadOverview();
                  jsonFetch("/api/admin/health")
                    .then(setHealth)
                    .catch((e) => notify(e.message));
                  jsonFetch("/api/admin/time")
                    .then(setAdminTime)
                    .catch((e) => notify(e.message));
                  void loadAdminTeamSettings();
                  notify("Dashboard refreshed");
                }}
              >
                Refresh dashboard
              </button>
            </div>
            <div className="admin-status-grid">
              <DashboardStatus
                title="Application"
                status="healthy"
                detail={
                  health
                    ? `${health.application.version} · up ${Math.floor(health.application.uptimeSeconds / 60)} min`
                    : "Loading"
                }
              />
              <DashboardStatus
                title="Database"
                status={health?.database.status || "unknown"}
                detail={
                  health
                    ? `${health.database.integrity} · schema v${health.database.migrationVersion}`
                    : "Loading"
                }
              />
              <DashboardStatus
                title="Task Buddy"
                status={health?.discord.status || "unknown"}
                detail={
                  health?.discord.error ||
                  (health ? "Private delivery ready" : "Loading")
                }
              />
              <DashboardStatus
                title="Local backup"
                status={health?.backup.status || "unknown"}
                detail={
                  health?.backup.completedAt
                    ? `Last run ${new Date(health.backup.completedAt).toLocaleString()}`
                    : health?.backup.message || "Loading"
                }
              />
              <DashboardStatus
                title="Restore test"
                status={health?.restore.status || "unknown"}
                detail={
                  health?.restore.completedAt
                    ? `Verified ${new Date(health.restore.completedAt).toLocaleString()}`
                    : health?.restore.message || "Loading"
                }
              />
              <DashboardStatus
                title="VM storage"
                status={health?.storage.status || "unknown"}
                detail={
                  health
                    ? `${formatBytes(health.storage.freeBytes)} available`
                    : "Loading"
                }
              />
            </div>
            <div className="admin-dashboard-card admin-team-setting">
              <header>
                <div>
                  <small>TEAM DIRECTORY</small>
                  <h3>Main team</h3>
                  <p>
                    Choose the team shown first for everyone. This only changes
                    directory ordering and does not grant access to boards or
                    workspaces.
                  </p>
                </div>
              </header>
              <div className="admin-team-setting-row">
                <select
                  aria-label="Main team"
                  value={mainTeamDraft}
                  onChange={(event) => setMainTeamDraft(event.target.value)}
                  disabled={!adminTeamSettings}
                >
                  <option value="">No main team</option>
                  {(adminTeamSettings?.teams || []).map((team: any) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
                <button
                  className="secondary"
                  disabled={!adminTeamSettings}
                  onClick={() => void saveMainTeam()}
                >
                  Save main team
                </button>
              </div>
            </div>
            <div className="admin-dashboard-columns">
              <div className="admin-dashboard-card">
                <header>
                  <div>
                    <small>WORKSPACE</small>
                    <h3>Organization snapshot</h3>
                  </div>
                </header>
                <div className="admin-snapshot-grid">
                  <DashboardNumber
                    label="Active members"
                    value={overview?.metrics.activeUsers ?? "—"}
                  />
                  <DashboardNumber
                    label="Workspaces"
                    value={overview?.metrics.workspaces ?? "—"}
                  />
                  <DashboardNumber
                    label="Boards"
                    value={overview?.metrics.activeBoards ?? "—"}
                  />
                  <DashboardNumber
                    label="Open tasks"
                    value={overview?.metrics.tasks ?? "—"}
                  />
                  <DashboardNumber
                    label="Active timers"
                    value={overview?.metrics.activeTimers ?? "—"}
                  />
                  <DashboardNumber
                    label="Failed reminders"
                    value={overview?.metrics.failedReminders ?? "—"}
                    alert={(overview?.metrics.failedReminders || 0) > 0}
                  />
                </div>
              </div>
              <div className="admin-dashboard-card">
                <header>
                  <div>
                    <small>TIME</small>
                    <h3>Currently clocked in</h3>
                  </div>
                  <button onClick={() => setTab("time")}>Open reports</button>
                </header>
                <div className="admin-active-list">
                  {(adminTime?.totals || []).filter(
                    (item: any) => item.activeSince,
                  ).length ? (
                    (adminTime?.totals || [])
                      .filter((item: any) => item.activeSince)
                      .map((item: any) => (
                        <div key={item.userId}>
                          <Avatar
                            name={item.userName}
                            avatar={item.userAvatar}
                          />
                          <span>
                            <b>{item.userName}</b>
                            <small>
                              Since{" "}
                              {new Date(item.activeSince).toLocaleTimeString(
                                [],
                                { hour: "numeric", minute: "2-digit" },
                              )}
                            </small>
                          </span>
                          <em>Active</em>
                        </div>
                      ))
                  ) : (
                    <div className="admin-inline-empty">
                      No members are currently clocked in.
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="admin-tool-grid">
              <AdminTool
                title="People & access"
                copy="Manage members, roles, status, and Authentik synchronization."
                action="Manage users"
                onClick={() => setTab("users")}
              />
              <AdminTool
                title="Board access"
                copy="Review ownership, sharing, and task totals without bypassing privacy."
                action="Review boards"
                onClick={() => setTab("boards")}
              />
              <AdminTool
                title="Time reports"
                copy="Inspect active timers, totals, audit events, filters, and CSV exports."
                action="Open time"
                onClick={() => setTab("time")}
              />
              <AdminTool
                title="System health"
                copy="Inspect database, storage, backup, restore, sessions, and Task Buddy."
                action="Open health"
                onClick={() => setTab("health")}
              />
              <AdminTool
                title="Audit history"
                copy="Review recent administrative and collaboration activity."
                action="View audit"
                onClick={() => setTab("audit")}
              />
              <AdminTool
                title="Security controls"
                copy="Review identity, recovery access, secrets, and session boundaries."
                action="View security"
                onClick={() => setTab("security")}
              />
            </div>
          </div>
        )}
        {tab === "users" && (
          <>
            <div className="admin-toolbar">
              <div className="global-search">
                <SearchIcon />
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
        {tab === "time" && <AdminTime notify={notify} />}
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
                <span className="audit-event-icon">
                  {a.action.split(".")[0].slice(0, 1)}
                </span>
                <span>
                  <b>{a.description}</b>
                  <small>
                    {a.actorName} · <code>{a.action}</code>
                  </small>
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
        {tab === "health" && (
          <div className="admin-section health-dashboard">
            <div className="section-copy health-heading">
              <div>
                <h2>System health</h2>
                <p>
                  Live application, identity, Discord, storage, and recovery
                  signals.
                </p>
              </div>
              <button
                className="secondary"
                onClick={() =>
                  jsonFetch("/api/admin/health")
                    .then(setHealth)
                    .then(() => notify("Health data refreshed"))
                    .catch((e) => notify(e.message))
                }
              >
                ↻ Refresh
              </button>
              <label className="live-health-toggle">
                <input
                  type="checkbox"
                  checked={healthLive}
                  onChange={(event) => setHealthLive(event.target.checked)}
                />
                Live updates
              </label>
            </div>
            {!health ? (
              <div className="reminder-empty">Loading system health…</div>
            ) : (
              <>
                <div className="health-grid">
                  <HealthCard
                    title="Application"
                    status="healthy"
                    detail={`Up ${Math.floor(health.application.uptimeSeconds / 60)} min · ${formatBytes(health.application.rssBytes)} RAM`}
                  />
                  <HealthCard
                    title="Database"
                    status={health.database.status}
                    detail={`${health.database.integrity} · schema v${health.database.migrationVersion} · ${formatBytes(health.database.sizeBytes)}`}
                  />
                  <HealthCard
                    title="Application storage"
                    status={health.storage.status}
                    detail={`${formatBytes(health.storage.freeBytes)} free of ${formatBytes(health.storage.totalBytes)}`}
                  />
                  <HealthCard
                    title="Authentik"
                    status={
                      health.identity.status === "configured"
                        ? "healthy"
                        : "degraded"
                    }
                    detail={`${health.identity.activeSessions} active sessions`}
                  />
                  <HealthCard
                    title="Task Buddy"
                    status={health.discord.status}
                    detail={
                      health.discord.error ||
                      `Private delivery ready · ${health.discord.channels} shared channels visible`
                    }
                  />
                  <HealthCard
                    title="Local backup"
                    status={health.backup.status}
                    detail={
                      health.backup.message ||
                      health.backup.completedAt ||
                      "Awaiting report"
                    }
                  />
                  <HealthCard
                    title="Restore test"
                    status={health.restore.status}
                    detail={
                      health.restore.message ||
                      health.restore.completedAt ||
                      "Awaiting report"
                    }
                  />
                  <HealthCard
                    title="Notifications"
                    status={
                      (health.reminders.counts.failed || 0) > 0
                        ? "degraded"
                        : "healthy"
                    }
                    detail={`${health.reminders.counts.sent || 0} sent · ${health.reminders.counts.failed || 0} failed`}
                  />
                </div>
                <div className="health-actions">
                  <div>
                    <h3>Task Buddy delivery test</h3>
                    <p>
                      Sends a compact, embed-free DM to your linked Discord
                      account.
                    </p>
                  </div>
                  <button
                    className="discord-button"
                    onClick={() =>
                      jsonFetch("/api/admin/health", { method: "POST" })
                        .then(() => notify("Test delivered by DM"))
                        .catch((e) => notify(e.message))
                    }
                  >
                    Send test DM
                  </button>
                </div>
                <small className="health-generated">
                  Updated {new Date(health.generatedAt).toLocaleString()}
                </small>
              </>
            )}
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
function DashboardStatus({
  title,
  status,
  detail,
}: {
  title: string;
  status: string;
  detail: string;
}) {
  const normalized = status === "configured" ? "healthy" : status;
  return (
    <article className={`dashboard-status ${normalized}`}>
      <div>
        <i />
        <span>{normalized}</span>
      </div>
      <h3>{title}</h3>
      <p>{detail}</p>
    </article>
  );
}
function DashboardNumber({
  label,
  value,
  alert = false,
}: {
  label: string;
  value: string | number;
  alert?: boolean;
}) {
  return (
    <div className={alert ? "alert" : ""}>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}
function AdminTool({
  title,
  copy,
  action,
  onClick,
}: {
  title: string;
  copy: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <article className="admin-tool-card">
      <h3>{title}</h3>
      <p>{copy}</p>
      <button onClick={onClick}>{action} →</button>
    </article>
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
function formatBytes(value: number) {
  if (!Number.isFinite(value)) return "Unknown";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = value,
    index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index++;
  }
  return `${amount.toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}
function HealthCard({
  title,
  status,
  detail,
}: {
  title: string;
  status: string;
  detail: string;
}) {
  const normalized =
    status === "healthy" || status === "success"
      ? "healthy"
      : status === "unknown"
        ? "unknown"
        : "degraded";
  return (
    <article className={`health-card ${normalized}`}>
      <div>
        <i />
        <span>{normalized}</span>
      </div>
      <h3>{title}</h3>
      <p>{detail}</p>
    </article>
  );
}

function ColumnManager({
  board,
  busy,
  run,
  refresh,
  notify,
}: {
  board: BoardDetail;
  busy: boolean;
  run: (action: () => Promise<void>) => void;
  refresh: () => Promise<void>;
  close?: () => void;
  notify: (message: string) => void;
}) {
  const [drafts, setDrafts] = useState<BoardColumn[]>(board.columns);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#7c6ce7");
  const [destinations, setDestinations] = useState<Record<number, string>>({});
  const add = () =>
    run(async () => {
      const data = await jsonFetch(`/api/boards/${board.board.id}/columns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, color: newColor }),
      });
      setDrafts((current) => [...current, data.column]);
      setNewName("");
      await refresh();
      notify("Column added");
    });
  const save = (column: BoardColumn) =>
    run(async () => {
      await jsonFetch(`/api/boards/${board.board.id}/columns/${column.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: column.name,
          color: column.color,
          isDone: column.isDone === 1,
        }),
      });
      await refresh();
      notify("Column updated");
    });
  const move = (index: number, direction: number) => {
    const next = [...drafts],
      target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setDrafts(next);
    run(async () => {
      await jsonFetch(`/api/boards/${board.board.id}/columns`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columnIds: next.map((column) => column.id) }),
      });
      await refresh();
      notify("Columns reordered");
    });
  };
  const remove = (column: BoardColumn) => {
    const destinationId =
      destinations[column.id] ||
      String(drafts.find((item) => item.id !== column.id)?.id || "");
    if (!destinationId) return;
    run(async () => {
      await jsonFetch(
        `/api/boards/${board.board.id}/columns/${column.id}?destinationId=${destinationId}`,
        { method: "DELETE" },
      );
      setDrafts((current) => current.filter((item) => item.id !== column.id));
      await refresh();
      notify("Column removed and tasks moved");
    });
  };
  const change = (id: number, patch: Partial<BoardColumn>) =>
    setDrafts((current) =>
      current.map((column) =>
        column.id === id ? { ...column, ...patch } : column,
      ),
    );
  return (
    <>
      <h2>Workflow columns</h2>
      <p>
        Add, rename, reorder, or remove the stages on this board. Removing a
        column moves its tasks to the destination you choose.
      </p>
      <div className="column-manager">
        {drafts.map((column, index) => (
          <article key={column.id}>
            <div className="column-editor-main">
              <input
                aria-label="Column color"
                type="color"
                value={column.color}
                onChange={(event) =>
                  change(column.id, { color: event.target.value })
                }
              />
              <input
                aria-label="Column name"
                maxLength={50}
                value={column.name}
                onChange={(event) =>
                  change(column.id, { name: event.target.value })
                }
              />
              <label className="done-column">
                <input
                  type="checkbox"
                  checked={column.isDone === 1}
                  onChange={(event) =>
                    change(column.id, { isDone: event.target.checked ? 1 : 0 })
                  }
                />{" "}
                Completed
              </label>
            </div>
            <div className="column-editor-actions">
              <button
                className="icon-button"
                disabled={busy || index === 0}
                onClick={() => move(index, -1)}
                aria-label={`Move ${column.name} left`}
              >
                ←
              </button>
              <button
                className="icon-button"
                disabled={busy || index === drafts.length - 1}
                onClick={() => move(index, 1)}
                aria-label={`Move ${column.name} right`}
              >
                →
              </button>
              <button
                className="secondary"
                disabled={busy || !column.name.trim()}
                onClick={() => save(column)}
              >
                Save
              </button>
            </div>
            {drafts.length > 1 && (
              <div className="column-delete">
                <select
                  value={destinations[column.id] || ""}
                  onChange={(event) =>
                    setDestinations({
                      ...destinations,
                      [column.id]: event.target.value,
                    })
                  }
                >
                  <option value="">Move tasks to…</option>
                  {drafts
                    .filter((item) => item.id !== column.id)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
                <button
                  className="danger subtle"
                  disabled={busy || !destinations[column.id]}
                  onClick={() => remove(column)}
                >
                  Remove
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
      <div className="column-create">
        <input
          type="color"
          value={newColor}
          onChange={(event) => setNewColor(event.target.value)}
        />
        <input
          placeholder="New column name"
          maxLength={50}
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
        />
        <button
          className="primary"
          disabled={busy || !newName.trim()}
          onClick={add}
        >
          ＋ Add column
        </button>
      </div>
    </>
  );
}

function NorthlineModal({
  type,
  close,
  board,
  task,
  people,
  directoryPeople,
  workspaces,
  activeWorkspace,
  setActiveWorkspaceId,
  busy,
  run,
  refresh,
  notify,
  openTaskReminder,
}: any) {
  const columns = (board?.columns || []) as BoardColumn[];
  const boardAccess = [
    ...(board?.boardOwner ? [board.boardOwner] : []),
    ...(board?.sharedWith || []).filter(
      (member: BoardAccess) => member.id !== board?.boardOwner?.id,
    ),
  ] as BoardAccess[];
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
          assigneeIds: (task.assigneeIds || (task.ownerId ? [task.ownerId] : [])).map(String),
        }
      : { ...emptyTask, status: columns[0]?.key || "" },
  );
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);
  const selectedAssignees = people.filter((person: WorkspaceUser) =>
    taskForm.assigneeIds.includes(String(person.id)),
  );
  const [boardForm, setBoardForm] = useState({
    name: board?.board.name || "",
    description: board?.board.description || "",
    template: "blank",
    workspaceId: String(board?.board.workspaceId || activeWorkspace?.id || ""),
  });
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceDetail, setWorkspaceDetail] = useState<any>(null);
  const [workspaceEditName, setWorkspaceEditName] = useState("");
  const [selectedUser, setSelectedUser] = useState("");
  const [permission, setPermission] = useState("editor");
  const [comments, setComments] = useState<any[]>([]);
  const [comment, setComment] = useState("");
  const [activity, setActivity] = useState<
    Array<{
      id: number;
      action: string;
      detail: string;
      createdAt: string;
      actorName: string;
      actorAvatar: string | null;
    }>
  >([]);
  const [archivedTasks, setArchivedTasks] = useState<
    Array<{
      id: number;
      title: string;
      archivedAt: string;
      priority: string;
      statusName: string;
    }>
  >([]);
  useEffect(() => {
    if (type === "board-create" && activeWorkspace?.id) {
      setBoardForm((current) => ({
        ...current,
        workspaceId: String(activeWorkspace.id),
      }));
    }
  }, [type, activeWorkspace?.id]);
  useEffect(() => {
    if (type === "workspace-manage" && activeWorkspace)
      jsonFetch(`/api/workspaces/${activeWorkspace.id}`)
        .then((detail) => {
          setWorkspaceDetail(detail);
          setWorkspaceEditName(detail.workspace.name);
        })
        .catch((error) => notify(error.message));
  }, [type, activeWorkspace?.id]);
  const [notificationSettings, setNotificationSettings] = useState({
    assignmentEnabled: board?.notifications?.assignmentEnabled !== 0,
    statusEnabled: board?.notifications?.statusEnabled !== 0,
    commentEnabled: board?.notifications?.commentEnabled !== 0,
    mentionEnabled: board?.notifications?.mentionEnabled !== 0,
    dueEnabled: board?.notifications?.dueEnabled !== 0,
    dueWarningHours: board?.notifications?.dueWarningHours || 24,
  });
  const notificationsDirty =
    JSON.stringify(notificationSettings) !==
    JSON.stringify({
      assignmentEnabled: board?.notifications?.assignmentEnabled !== 0,
      statusEnabled: board?.notifications?.statusEnabled !== 0,
      commentEnabled: board?.notifications?.commentEnabled !== 0,
      mentionEnabled: board?.notifications?.mentionEnabled !== 0,
      dueEnabled: board?.notifications?.dueEnabled !== 0,
      dueWarningHours: board?.notifications?.dueWarningHours || 24,
    });
  const [reminder, setReminder] = useState({
    taskId: task?.id ? String(task.id) : "",
    date: "",
    hour: "12",
    minute: "00",
    period: "PM",
    message: task?.title ? `Reminder: ${task.title}` : "",
  });
  useEffect(() => {
    if ((type === "task-detail" || type === "task-comments") && task)
      jsonFetch(`/api/tasks/${task.id}/comments`).then((d) =>
        setComments(d.comments),
      );
    if (type === "activity" && board)
      jsonFetch(`/api/boards/${board.board.id}/activity`)
        .then((data) => setActivity(data.activity || []))
        .catch((e) => notify(e.message));
    if (type === "archive" && board)
      jsonFetch(`/api/boards/${board.board.id}/archive`)
        .then((data) => setArchivedTasks(data.tasks || []))
        .catch((e) => notify(e.message));
  }, [type, task]);
  const initialTask = task
    ? {
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        tag: task.tag,
        dueDate: task.due || "",
        assigneeId: task.ownerId ? String(task.ownerId) : "",
        assigneeIds: (task.assigneeIds || (task.ownerId ? [task.ownerId] : [])).map(String),
      }
    : { ...emptyTask, status: columns[0]?.key || "" };
  const dirty =
    ((type === "task-create" || type === "task-detail") &&
      JSON.stringify(taskForm) !== JSON.stringify(initialTask)) ||
    (type === "reminder" &&
      (!!reminder.date ||
        reminder.message !== (task?.title ? `Reminder: ${task.title}` : ""))) ||
    (type === "board-create" && !!boardForm.name) ||
    (type === "workspace-create" && !!workspaceName);
  const safeClose = () => {
    if (dirty && !window.confirm("Discard your unsaved changes?")) return;
    close();
  };
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
            assigneeIds: taskForm.assigneeIds.map(Number),
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
            assignee_ids: taskForm.assigneeIds.map(Number),
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
  const duplicateTask = () =>
    run(async () => {
      await jsonFetch(`/api/tasks/${task.id}/duplicate`, { method: "POST" });
      await refresh();
      close();
      notify("Task duplicated");
    });
  const archiveTask = () =>
    run(async () => {
      await jsonFetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archive: true }),
      });
      await refresh();
      close();
      notify("Task archived");
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
      setSelectedUser("");
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
      const workspaceChanged =
        String(board?.board.workspaceId || "") !== boardForm.workspaceId;
      if (
        workspaceChanged &&
        !window.confirm(
          "Move this board to the selected workspace? Direct shares will remain, and current workspace members will keep their effective access.",
        )
      )
        return;
      try {
        await jsonFetch(`/api/boards/${board.board.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(boardForm),
        });
      } catch (error) {
        throw new Error(
          `${workspaceChanged ? "Board move" : "Board update"} failed: ${(error as Error).message}`,
        );
      }
      if (notificationsDirty) {
        try {
          await jsonFetch(`/api/boards/${board.board.id}/notifications`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(notificationSettings),
          });
        } catch (error) {
          await refresh();
          close();
          notify(
            `${workspaceChanged ? "Board moved" : "Board updated"}, but notification settings failed: ${(error as Error).message}`,
          );
          return;
        }
      }
      await refresh();
      close();
      notify(workspaceChanged ? "Board moved and access preserved" : "Board updated");
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
      const result = await jsonFetch("/api/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boardId: board.board.id,
          taskId: reminder.taskId ? Number(reminder.taskId) : null,
          message: reminder.message,
          remindAt: new Date(
            `${reminder.date}T${String((Number(reminder.hour) % 12) + (reminder.period === "PM" ? 12 : 0)).padStart(2, "0")}:${reminder.minute}`,
          ).toISOString(),
        }),
      });
      close();
      notify(
        reminder.taskId
          ? "Private task reminder scheduled"
          : `Board-wide reminder scheduled for ${result.recipients} member${result.recipients === 1 ? "" : "s"}`,
      );
    });
  return (
    <div className="modal-backdrop">
      <div
        className={`modal ${type === "task-detail" || type === "task-comments" || type === "columns" ? "modal-large" : ""}`}
      >
        <button className="modal-close" onClick={safeClose}>
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
                    <option key={c.id} value={c.key}>
                      {c.name}
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
                Assignees
                <div className="assignee-picker">
                  <button
                    type="button"
                    className="assignee-picker-trigger"
                    aria-haspopup="listbox"
                    aria-expanded={assigneePickerOpen}
                    onClick={() => setAssigneePickerOpen((open) => !open)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setAssigneePickerOpen(false);
                    }}
                  >
                    <span className="assignee-picker-value">
                      {selectedAssignees.length ? (
                        <>
                          {selectedAssignees.slice(0, 2).map((person: WorkspaceUser) => (
                            <span className="assignee-picker-chip" key={person.id}>
                              <Avatar name={person.name} avatar={person.avatar} color={person.color} />
                              <span>{person.name}</span>
                            </span>
                          ))}
                          {selectedAssignees.length > 2 && (
                            <span className="assignee-picker-more">
                              +{selectedAssignees.length - 2} more
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="assignee-picker-placeholder">Unassigned</span>
                      )}
                    </span>
                    <span className="assignee-picker-chevron" aria-hidden="true">⌄</span>
                  </button>
                  {assigneePickerOpen && (
                    <div
                      className="assignee-picker-menu"
                      role="listbox"
                      tabIndex={-1}
                      aria-label="Task assignees"
                      aria-multiselectable="true"
                      onKeyDown={(event) => {
                        if (event.key === "Escape") setAssigneePickerOpen(false);
                      }}
                    >
                      {people.length ? people.map((person: WorkspaceUser) => {
                        const selected = taskForm.assigneeIds.includes(String(person.id));
                        return (
                          <button
                            type="button"
                            className={`assignee-picker-option${selected ? " selected" : ""}`}
                            role="option"
                            aria-selected={selected}
                            key={person.id}
                            onClick={() => {
                              const id = String(person.id);
                              const next = selected
                                ? taskForm.assigneeIds.filter((value: string) => value !== id)
                                : [...taskForm.assigneeIds, id];
                              setTaskForm((f: any) => ({
                                ...f,
                                assigneeIds: next,
                                assigneeId: next[0] || "",
                              }));
                            }}
                          >
                            <span className="assignee-picker-check" aria-hidden="true">
                              {selected ? "✓" : ""}
                            </span>
                            <Avatar name={person.name} avatar={person.avatar} color={person.color} />
                            <span className="assignee-picker-option-name">{person.name}</span>
                          </button>
                        );
                      }) : (
                        <span className="assignee-picker-empty">No people available</span>
                      )}
                      {taskForm.assigneeIds.length > 0 && (
                        <button
                          type="button"
                          className="assignee-picker-clear"
                          onClick={() => setTaskForm((f: any) => ({ ...f, assigneeIds: [], assigneeId: "" }))}
                        >
                          Clear all assignees
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <small className="field-help">Select one or more people from the dropdown.</small>
              </label>
            </div>
            <div className="modal-actions task-actions">
              {type === "task-detail" && (
                <>
                  <button className="danger" onClick={deleteTask}>
                    Delete
                  </button>
                  <button className="secondary" onClick={duplicateTask}>
                    Duplicate
                  </button>
                  {columns.find((column) => column.key === taskForm.status)
                    ?.isDone === 1 && (
                    <button className="secondary" onClick={archiveTask}>
                      Archive
                    </button>
                  )}
                  <button className="discord-button" onClick={openTaskReminder}>
                    Remind me
                  </button>
                  <button
                    className="secondary"
                    onClick={() => {
                      window.dispatchEvent(
                        new CustomEvent("northline-open-time-clock", {
                          detail: {
                            boardId: board.board.id,
                            taskId: task.id,
                            note: task.title,
                          },
                        }),
                      );
                      close();
                    }}
                  >
                    Start timer
                  </button>
                </>
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
        {type === "task-comments" && task && (
          <>
            <span className="modal-icon purple-bg">◌</span>
            <h2>{task.title}</h2>
            <p>Discuss this task with everyone who can access the board.</p>
            <div className="comment-panel focused-discussion">
              <h3>
                Discussion <span>{comments.length}</span>
              </h3>
              {!comments.length && (
                <div className="comment-empty">
                  No comments yet. Start the conversation below.
                </div>
              )}
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
                  autoFocus
                  maxLength={5000}
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Write a comment…"
                />
                <button
                  className="primary"
                  disabled={busy || !comment.trim()}
                  onClick={addComment}
                >
                  {busy ? "Posting…" : "Comment"}
                </button>
              </div>
            </div>
          </>
        )}
        {type === "board-create" && (
          <>
            <h2>Create board</h2>
            <p>
              Personal workspace boards start private. Shared workspace boards
              inherit that workspace&apos;s access.
            </p>
            <label>
              Workspace
              <select
                value={boardForm.workspaceId}
                onChange={(e) =>
                  setBoardForm({ ...boardForm, workspaceId: e.target.value })
                }
              >
                {(workspaces as Workspace[])
                  .filter((workspace) => workspace.permission !== "viewer")
                  .map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>
                      {workspace.name}
                      {workspace.kind === "personal" ? " (personal)" : ""}
                    </option>
                  ))}
              </select>
            </label>
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
            <label>
              Template
              <select
                value={boardForm.template}
                onChange={(e) =>
                  setBoardForm({ ...boardForm, template: e.target.value })
                }
              >
                <option value="blank">Blank board</option>
                <option value="content">Content pipeline</option>
                <option value="launch">Launch plan</option>
              </select>
              <small>
                Templates add a reusable starter workflow that you can edit.
              </small>
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
        {type === "workspace-create" && (
          <>
            <h2>Create shared workspace</h2>
            <p>
              Every board in this workspace will automatically be available to
              the members you invite.
            </p>
            <label>
              Name
              <input
                autoFocus
                maxLength={80}
                value={workspaceName}
                onChange={(event) => setWorkspaceName(event.target.value)}
              />
            </label>
            <button
              className="primary wide"
              disabled={busy || !workspaceName.trim()}
              onClick={() =>
                run(async () => {
                  const created = await jsonFetch("/api/workspaces", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: workspaceName }),
                  });
                  setActiveWorkspaceId(created.id);
                  await refresh();
                  close();
                  notify("Shared workspace created");
                })
              }
            >
              Create workspace
            </button>
          </>
        )}
        {type === "workspace-manage" && workspaceDetail && (
          <>
            <h2>Manage {workspaceDetail.workspace.name}</h2>
            <p>
              Workspace members automatically receive access to every board kept
              here.
            </p>
            <label>
              Workspace name
              <input
                maxLength={80}
                value={workspaceEditName}
                onChange={(event) => setWorkspaceEditName(event.target.value)}
              />
            </label>
            <div className="modal-actions workspace-actions">
              <button
                className="secondary"
                disabled={busy || !workspaceEditName.trim() || workspaceEditName.trim() === workspaceDetail.workspace.name}
                onClick={() => run(async () => {
                  await jsonFetch(`/api/workspaces/${workspaceDetail.workspace.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: workspaceEditName }),
                  });
                  await refresh();
                  setWorkspaceDetail(await jsonFetch(`/api/workspaces/${workspaceDetail.workspace.id}`));
                  notify("Workspace renamed");
                })}
              >
                Save name
              </button>
              <button
                className="danger"
                disabled={busy || workspaceDetail.workspace.kind === "personal"}
                title={workspaceDetail.workspace.kind === "personal" ? "Personal workspaces cannot be deleted" : "Delete this empty shared workspace"}
                onClick={() => run(async () => {
                  if (!window.confirm("Delete this workspace? It must be empty first.")) return;
                  await jsonFetch(`/api/workspaces/${workspaceDetail.workspace.id}`, { method: "DELETE" });
                  const personal = (workspaces as Workspace[]).find((item) => item.kind === "personal");
                  if (personal) setActiveWorkspaceId(personal.id);
                  await refresh();
                  close();
                  notify("Workspace deleted");
                })}
              >
                Delete workspace
              </button>
            </div>
            {workspaceDetail.workspace.kind === "shared" ? (
              <>
            <div className="modal-row">
              <label>
                Member
                <select
                  value={selectedUser}
                  onChange={(event) => setSelectedUser(event.target.value)}
                >
                  <option value="">Choose a person…</option>
                  {directoryPeople
                    .filter(
                      (person: WorkspaceUser) =>
                        person.id !== workspaceDetail.workspace.ownerId &&
                        !workspaceDetail.members.some(
                          (member: Member) => member.id === person.id,
                        ),
                    )
                    .map((person: WorkspaceUser) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Permission
                <select
                  value={permission}
                  onChange={(event) => setPermission(event.target.value)}
                >
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
              </label>
            </div>
            <button
              className="primary wide"
              disabled={busy || !selectedUser}
              onClick={() =>
                run(async () => {
                  await jsonFetch(
                    `/api/workspaces/${workspaceDetail.workspace.id}/members`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        userId: Number(selectedUser),
                        permission,
                      }),
                    },
                  );
                  setWorkspaceDetail(
                    await jsonFetch(
                      `/api/workspaces/${workspaceDetail.workspace.id}`,
                    ),
                  );
                  setSelectedUser("");
                  await refresh();
                  notify("Workspace access granted");
                })
              }
            >
              Add workspace member
            </button>
            <div className="shared-list">
              {workspaceDetail.members.map((member: Member) => (
                <div className="share-person" key={member.id}>
                  <Avatar name={member.name} avatar={member.avatar} />
                  <span>
                    <b>{member.name}</b>
                    <small>{member.email}</small>
                  </span>
                  <em>{member.permission}</em>
                  <button
                    className="icon-button"
                    aria-label={`Remove ${member.name}`}
                    onClick={() =>
                      run(async () => {
                        await jsonFetch(
                          `/api/workspaces/${workspaceDetail.workspace.id}/members`,
                          {
                            method: "DELETE",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ userId: member.id }),
                          },
                        );
                        setWorkspaceDetail(
                          await jsonFetch(
                            `/api/workspaces/${workspaceDetail.workspace.id}`,
                          ),
                        );
                        await refresh();
                        notify("Workspace member removed");
                      })
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
              </>
            ) : (
              <div className="settings-callout">
                <b>Personal workspace</b>
                <span>Personal workspaces are private to you. Share individual boards when you want to collaborate.</span>
              </div>
            )}
          </>
        )}
        {type === "activity" && (
          <>
            <h2>Board activity</h2>
            <p>The latest changes across this board.</p>
            <div className="activity-feed">
              {activity.length ? (
                activity.map((item) => (
                  <article key={item.id}>
                    <Avatar name={item.actorName} avatar={item.actorAvatar} />
                    <span>
                      <b>{item.actorName}</b>
                      <p>{item.detail}</p>
                      <small>
                        {new Date(`${item.createdAt}Z`).toLocaleString()}
                      </small>
                    </span>
                  </article>
                ))
              ) : (
                <div className="empty-state">
                  <b>No activity yet</b>
                  <span>New task changes will appear here.</span>
                </div>
              )}
            </div>
          </>
        )}
        {type === "archive" && (
          <>
            <h2>Task archive</h2>
            <p>
              Archived tasks stay recoverable with their comments and activity
              history.
            </p>
            <div className="archive-list">
              {archivedTasks.length ? (
                archivedTasks.map((item) => (
                  <article key={item.id}>
                    <span>
                      <b>{item.title}</b>
                      <small>
                        {item.statusName} · {item.priority} · Archived{" "}
                        {new Date(item.archivedAt).toLocaleDateString()}
                      </small>
                    </span>
                    {board.canEdit && (
                      <button
                        className="secondary"
                        onClick={() =>
                          run(async () => {
                            await jsonFetch(`/api/tasks/${item.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ archive: false }),
                            });
                            setArchivedTasks((current) =>
                              current.filter((task) => task.id !== item.id),
                            );
                            await refresh();
                            notify("Task restored");
                          })
                        }
                      >
                        Restore
                      </button>
                    )}
                  </article>
                ))
              ) : (
                <div className="empty-state">
                  <b>No archived tasks</b>
                  <span>
                    Completed tasks can be archived from their task details.
                  </span>
                </div>
              )}
            </div>
          </>
        )}
        {type === "columns" && (
          <ColumnManager
            board={board}
            busy={busy}
            run={run}
            refresh={refresh}
            close={close}
            notify={notify}
          />
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
            <label>
              Workspace
              <select
                value={boardForm.workspaceId}
                onChange={(event) =>
                  setBoardForm({
                    ...boardForm,
                    workspaceId: event.target.value,
                  })
                }
              >
                {(workspaces as Workspace[])
                  .filter((workspace) => workspace.permission !== "viewer")
                  .map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>
                      {workspace.name}
                      {workspace.kind === "personal" ? " (personal)" : ""}
                    </option>
                  ))}
              </select>
              <small>
                Direct board shares stay in place. Moving from a shared
                workspace also preserves the former members&apos; effective
                access as board shares.
              </small>
            </label>
            <div className="settings-callout">
              <b>Private Task Buddy delivery</b>
              <span>
                Assignment and due-date notices go to assignees. Other task
                updates follow the task creator. Remind me sends a private DM
                to every assignee, or the creator when no one is assigned.
              </span>
            </div>
            <div className="notification-options">
              <h3>Automatic notifications</h3>
              {(
                [
                  ["assignmentEnabled", "Assignments"],
                  ["statusEnabled", "Status changes"],
                  ["commentEnabled", "Comments"],
                  ["mentionEnabled", "Mentions"],
                  ["dueEnabled", "Due-date warnings"],
                ] as const
              ).map(([key, label]) => (
                <label className="notification-toggle" key={key}>
                  <input
                    type="checkbox"
                    checked={notificationSettings[key] as boolean}
                    onChange={(e) =>
                      setNotificationSettings({
                        ...notificationSettings,
                        [key]: e.target.checked,
                      })
                    }
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <label>
              Due-date warning
              <select
                value={notificationSettings.dueWarningHours}
                onChange={(e) =>
                  setNotificationSettings({
                    ...notificationSettings,
                    dueWarningHours: Number(e.target.value),
                  })
                }
              >
                <option value={1}>1 hour before</option>
                <option value={6}>6 hours before</option>
                <option value={12}>12 hours before</option>
                <option value={24}>1 day before</option>
                <option value={48}>2 days before</option>
                <option value={168}>1 week before</option>
              </select>
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
        {type === "members" && (
          <>
            <h2>{board.board.name} members</h2>
            <p>Everyone with access to this board, including the owner.</p>
            <div className="shared-list">
              {boardAccess.map((member) => (
                <div className="share-person" key={member.id}>
                  <Avatar name={member.name} avatar={member.avatar} />
                  <span>
                    <b>{member.name}</b>
                    <small>{member.email}</small>
                  </span>
                  <em>{member.permission} · {member.source}</em>
                </div>
              ))}
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
                  {directoryPeople
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
              disabled={busy || !selectedUser}
              onClick={share}
            >
              Grant access
            </button>
            <div className="shared-list">
              {boardAccess.map((m: BoardAccess) => (
                <div className="share-person" key={m.id}>
                  <Avatar name={m.name} avatar={m.avatar} />
                  <span>
                    <b>{m.name}</b>
                    <small>{m.email}</small>
                  </span>
                  <em>{m.permission} · {m.source}</em>
                  {board.members.some((member: Member) => member.id === m.id) && (
                    <button
                      className="icon-button"
                      aria-label={`Remove ${m.name}`}
                      onClick={() => removeMember(m.id)}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
        {type === "reminder" && (
          <>
            <span className="modal-icon discord-bg">#</span>
            <h2>Schedule reminder</h2>
            <p>
              Task reminders are sent to the assigned people. If a task has no
              assignees, the reminder is sent to the person who created it.
              Board-wide reminders are privately delivered to every active member with board access.
            </p>
            <label>
              Task (optional)
              <select
                value={reminder.taskId}
                onChange={(e) =>
                  setReminder((current) => ({
                    ...current,
                    taskId: e.target.value,
                  }))
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
                    setReminder((current) => ({
                      ...current,
                      date: e.target.value,
                    }))
                  }
                />
              </label>
              <fieldset className="time-field">
                <legend>Time</legend>
                <div>
                  <select
                    aria-label="Hour"
                    value={reminder.hour}
                    onChange={(event) =>
                      setReminder((current) => ({
                        ...current,
                        hour: event.target.value,
                      }))
                    }
                  >
                    {Array.from({ length: 12 }, (_, index) => index + 1).map(
                      (hour) => (
                        <option key={hour}>{hour}</option>
                      ),
                    )}
                  </select>
                  <select
                    aria-label="Minute"
                    value={reminder.minute}
                    onChange={(event) =>
                      setReminder((current) => ({
                        ...current,
                        minute: event.target.value,
                      }))
                    }
                  >
                    {Array.from({ length: 60 }, (_, index) =>
                      String(index).padStart(2, "0"),
                    ).map((minute) => (
                      <option key={minute}>{minute}</option>
                    ))}
                  </select>
                  <select
                    aria-label="AM or PM"
                    value={reminder.period}
                    onChange={(event) =>
                      setReminder((current) => ({
                        ...current,
                        period: event.target.value,
                      }))
                    }
                  >
                    <option>AM</option>
                    <option>PM</option>
                  </select>
                </div>
              </fieldset>
            </div>
            <label>
              Message
              <textarea
                value={reminder.message}
                onChange={(e) =>
                  setReminder((current) => ({
                    ...current,
                    message: e.target.value,
                  }))
                }
                placeholder="What should the team know?"
              />
            </label>
            <button
              className="discord-button wide"
              disabled={!reminder.date || !reminder.message.trim()}
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
