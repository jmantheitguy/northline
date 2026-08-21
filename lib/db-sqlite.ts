import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { hashSync } from "bcryptjs";

const dataDirectory =
  process.env.NORTHLINE_DATA_DIR || path.join(process.cwd(), "data");
fs.mkdirSync(dataDirectory, { recursive: true });
const db = new Database(path.join(dataDirectory, "northline.db"));
export const createBoardPublicId = () =>
  `brd_${randomBytes(16).toString("hex")}`;
export const createColumnKey = () => `col_${randomBytes(8).toString("hex")}`;
export const createWorkspacePublicId = () =>
  `wsp_${randomBytes(16).toString("hex")}`;
export const createTeamPublicId = () =>
  `tem_${randomBytes(16).toString("hex")}`;
export const createCalendarPublicId = () =>
  `cal_${randomBytes(16).toString("hex")}`;
export const createCalendarEventPublicId = () =>
  `evt_${randomBytes(16).toString("hex")}`;
export const createCollabRequestPublicId = () =>
  `clb_${randomBytes(16).toString("hex")}`;
export const createCollabReschedulePublicId = () =>
  `rsc_${randomBytes(16).toString("hex")}`;
db.pragma("busy_timeout = 10000");
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Next.js evaluates server modules in parallel during a production build. A
// check-then-alter sequence can therefore race when two workers initialize
// the same SQLite database at once. Keep additive upgrades idempotent by
// treating a duplicate-column result as success; any other schema error must
// still surface and fail the build/startup.
const addColumnIfMissing = (table: string, column: string, definition: string) => {
  const columns = db
    .prepare(`PRAGMA table_info(${table})`)
    .all() as Array<{ name: string }>;
  if (columns.some((entry) => entry.name === column)) return;
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.toLowerCase().includes("duplicate column name")
    )
      throw error;
  }
};

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('Admin','Member','Guest')),
    status TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','Invited','Suspended')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_active_at TEXT
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL,
    target TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS calendars (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id TEXT NOT NULL UNIQUE,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#7c6ce7',
    description TEXT NOT NULL DEFAULT '',
    timezone TEXT NOT NULL DEFAULT 'UTC',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS calendar_members (
    calendar_id INTEGER NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission TEXT NOT NULL CHECK(permission IN ('viewer','editor')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(calendar_id,user_id)
  );
  CREATE TABLE IF NOT EXISTS calendar_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id TEXT NOT NULL UNIQUE,
    calendar_id INTEGER NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    start_at TEXT NOT NULL,
    end_at TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    all_day INTEGER NOT NULL DEFAULT 0 CHECK(all_day IN (0,1)),
    status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('tentative','confirmed','cancelled')),
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS calendar_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    calendar_id INTEGER NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
    actor_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL,
    detail TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS calendar_reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    calendar_event_id INTEGER NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    remind_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed','cancelled')),
    error TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at TEXT
  );
  CREATE INDEX IF NOT EXISTS calendar_events_range_idx ON calendar_events(calendar_id,start_at,end_at);
  CREATE INDEX IF NOT EXISTS calendar_members_user_idx ON calendar_members(user_id,calendar_id);
  CREATE INDEX IF NOT EXISTS calendar_reminders_due_idx ON calendar_reminders(status,remind_at);
  CREATE TABLE IF NOT EXISTS workspaces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK(kind IN ('personal','shared')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS workspace_members (
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission TEXT NOT NULL CHECK(permission IN ('viewer','editor')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(workspace_id,user_id)
  );
  CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#7c6ce7',
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS team_members (
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('manager','member')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(team_id,user_id)
  );
  CREATE TABLE IF NOT EXISTS team_workspaces (
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    permission TEXT NOT NULL CHECK(permission IN ('viewer','editor')),
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(team_id,workspace_id)
  );
  CREATE TABLE IF NOT EXISTS boards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id TEXT UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS board_members (
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission TEXT NOT NULL CHECK(permission IN ('viewer','editor')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(board_id,user_id)
  );
  CREATE TABLE IF NOT EXISTS board_columns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    column_key TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#7c6ce7',
    position INTEGER NOT NULL,
    is_done INTEGER NOT NULL DEFAULT 0 CHECK(is_done IN (0,1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(board_id,column_key),
    UNIQUE(board_id,position)
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'ideas' CHECK(status IN ('ideas','ready','progress','hold','done')),
    priority TEXT NOT NULL DEFAULT 'Medium' CHECK(priority IN ('Low','Medium','High')),
    tag TEXT NOT NULL DEFAULT 'General',
    due_date TEXT,
    assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author_id INTEGER NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel_id TEXT NOT NULL,
    channel_name TEXT NOT NULL,
    message TEXT NOT NULL,
    remind_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed','cancelled')),
    error TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at TEXT
  );
  CREATE TABLE IF NOT EXISTS board_notification_settings (
    board_id INTEGER PRIMARY KEY REFERENCES boards(id) ON DELETE CASCADE,
    channel_id TEXT,
    channel_name TEXT,
    assignment_enabled INTEGER NOT NULL DEFAULT 1,
    status_enabled INTEGER NOT NULL DEFAULT 1,
    comment_enabled INTEGER NOT NULL DEFAULT 1,
    mention_enabled INTEGER NOT NULL DEFAULT 1,
    due_enabled INTEGER NOT NULL DEFAULT 1,
    due_warning_hours INTEGER NOT NULL DEFAULT 24,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS user_notification_settings (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    assignment_enabled INTEGER NOT NULL DEFAULT 1,
    status_enabled INTEGER NOT NULL DEFAULT 1,
    comment_enabled INTEGER NOT NULL DEFAULT 1,
    mention_enabled INTEGER NOT NULL DEFAULT 1,
    due_enabled INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS notification_deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reminder_id INTEGER NOT NULL UNIQUE,
    board_id_snapshot INTEGER NOT NULL,
    board_key TEXT,
    board_name TEXT NOT NULL,
    task_title TEXT,
    created_by INTEGER NOT NULL,
    channel_id TEXT NOT NULL,
    channel_name TEXT NOT NULL,
    message TEXT NOT NULL,
    kind TEXT NOT NULL,
    event_type TEXT,
    status TEXT NOT NULL,
    error TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    delivered_at TEXT
  );
  CREATE TABLE IF NOT EXISTS board_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    detail TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS workspace_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS time_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id INTEGER REFERENCES workspaces(id) ON DELETE SET NULL,
    board_id INTEGER REFERENCES boards(id) ON DELETE SET NULL,
    task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    duration_seconds INTEGER,
    paused_at TEXT,
    paused_seconds INTEGER NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL CHECK(source IN ('timer','manual')),
    deleted_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK(ended_at IS NULL OR ended_at > started_at),
    CHECK(duration_seconds IS NULL OR duration_seconds >= 0)
  );
  CREATE TABLE IF NOT EXISTS time_entry_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    time_entry_id INTEGER NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
    actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    previous_values TEXT,
    new_values TEXT,
    reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS board_members_user_idx ON board_members(user_id);
  CREATE INDEX IF NOT EXISTS workspace_members_user_idx ON workspace_members(user_id);
  CREATE INDEX IF NOT EXISTS team_members_user_idx ON team_members(user_id,team_id);
  CREATE INDEX IF NOT EXISTS team_workspaces_workspace_idx ON team_workspaces(workspace_id,team_id);
  CREATE INDEX IF NOT EXISTS tasks_board_idx ON tasks(board_id,status);
  CREATE INDEX IF NOT EXISTS tasks_assignee_idx ON tasks(assignee_id,due_date);
  CREATE INDEX IF NOT EXISTS comments_task_idx ON comments(task_id);
  CREATE INDEX IF NOT EXISTS reminders_due_idx ON reminders(status,remind_at);
  CREATE INDEX IF NOT EXISTS board_activity_board_idx ON board_activity(board_id,created_at);
  CREATE INDEX IF NOT EXISTS time_entries_user_started_idx ON time_entries(user_id,started_at DESC);
  CREATE INDEX IF NOT EXISTS time_entries_board_idx ON time_entries(board_id,started_at DESC);
  CREATE UNIQUE INDEX IF NOT EXISTS time_entries_one_active_user_idx ON time_entries(user_id) WHERE ended_at IS NULL;
  CREATE INDEX IF NOT EXISTS time_entry_audit_entry_idx ON time_entry_audit(time_entry_id,created_at DESC);
`);

addColumnIfMissing("time_entries", "deleted_at", "deleted_at TEXT");
addColumnIfMissing("time_entries", "paused_at", "paused_at TEXT");
addColumnIfMissing(
  "time_entries",
  "paused_seconds",
  "paused_seconds INTEGER NOT NULL DEFAULT 0",
);

const calendarColumns = db
  .prepare("PRAGMA table_info(calendars)")
  .all() as Array<{ name: string }>;
if (!calendarColumns.some((column) => column.name === "deleted_at")) {
  try {
    db.exec("ALTER TABLE calendars ADD COLUMN deleted_at TEXT");
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes("duplicate column name")
    )
      throw error;
  }
}
const addCalendarColumn = (name: string, definition: string) => {
  if (!calendarColumns.some((column) => column.name === name)) {
    try {
      db.exec(`ALTER TABLE calendars ADD COLUMN ${definition}`);
      calendarColumns.push({ name });
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.includes("duplicate column name")
      )
        throw error;
    }
  }
};
addCalendarColumn(
  "calendar_type",
  "calendar_type TEXT NOT NULL DEFAULT 'personal'",
);
addCalendarColumn("visibility", "visibility TEXT NOT NULL DEFAULT 'private'");
addCalendarColumn("team_id", "team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL");
const calendarEventColumns = db
  .prepare("PRAGMA table_info(calendar_events)")
  .all() as Array<{ name: string }>;
if (!calendarEventColumns.some((column) => column.name === "deleted_at")) {
  try {
    db.exec("ALTER TABLE calendar_events ADD COLUMN deleted_at TEXT");
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes("duplicate column name")
    )
      throw error;
  }
}
const addCalendarEventColumn = (name: string, definition: string) => {
  if (!calendarEventColumns.some((column) => column.name === name)) {
    try {
      db.exec(`ALTER TABLE calendar_events ADD COLUMN ${definition}`);
      calendarEventColumns.push({ name });
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.includes("duplicate column name")
      )
        throw error;
    }
  }
};
addCalendarEventColumn(
  "event_kind",
  "event_kind TEXT NOT NULL DEFAULT 'event'",
);
addCalendarEventColumn(
  "visibility",
  "visibility TEXT NOT NULL DEFAULT 'calendar'",
);
addCalendarEventColumn("platform", "platform TEXT NOT NULL DEFAULT ''");
addCalendarEventColumn("game", "game TEXT NOT NULL DEFAULT ''");
addCalendarEventColumn("stream_url", "stream_url TEXT NOT NULL DEFAULT ''");
addCalendarEventColumn(
  "collab_enabled",
  "collab_enabled INTEGER NOT NULL DEFAULT 0",
);
addCalendarEventColumn("collab_request_id", "collab_request_id INTEGER");

db.exec(`
  CREATE TABLE IF NOT EXISTS collab_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id TEXT NOT NULL UNIQUE,
    source_event_id INTEGER REFERENCES calendar_events(id) ON DELETE SET NULL,
    requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    requester_calendar_id INTEGER NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
    recipient_calendar_id INTEGER REFERENCES calendars(id) ON DELETE SET NULL,
    proposed_start_at TEXT NOT NULL,
    proposed_end_at TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    title TEXT NOT NULL,
    message TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    response_message TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS collab_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    collab_request_id INTEGER NOT NULL REFERENCES collab_requests(id) ON DELETE CASCADE,
    recipient_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at TEXT
  );
  CREATE TABLE IF NOT EXISTS collab_request_participants (
    collab_request_id INTEGER NOT NULL REFERENCES collab_requests(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    calendar_id INTEGER REFERENCES calendars(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    proposed_start_at TEXT,
    proposed_end_at TEXT,
    timezone TEXT,
    response_message TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(collab_request_id,user_id)
  );
  CREATE TABLE IF NOT EXISTS collab_reschedule_proposals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id TEXT NOT NULL UNIQUE,
    collab_request_id INTEGER NOT NULL REFERENCES collab_requests(id) ON DELETE CASCADE,
    proposed_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    proposed_start_at TEXT NOT NULL,
    proposed_end_at TEXT NOT NULL,
    timezone TEXT NOT NULL,
    message TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TEXT
  );
  CREATE TABLE IF NOT EXISTS collab_reschedule_responses (
    proposal_id INTEGER NOT NULL REFERENCES collab_reschedule_proposals(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    responded_at TEXT,
    PRIMARY KEY(proposal_id,user_id)
  );
  INSERT OR IGNORE INTO collab_request_participants(collab_request_id,user_id,calendar_id,status,proposed_start_at,proposed_end_at,timezone,response_message,updated_at)
    SELECT id,recipient_id,recipient_calendar_id,status,proposed_start_at,proposed_end_at,timezone,response_message,updated_at FROM collab_requests;
  CREATE INDEX IF NOT EXISTS collab_requests_parties_idx ON collab_requests(recipient_id,requester_id,status);
  CREATE INDEX IF NOT EXISTS collab_participants_user_idx ON collab_request_participants(user_id,status);
  CREATE UNIQUE INDEX IF NOT EXISTS collab_reschedule_one_pending_idx ON collab_reschedule_proposals(collab_request_id) WHERE status='pending';
  CREATE INDEX IF NOT EXISTS collab_reschedule_responses_user_idx ON collab_reschedule_responses(user_id,status);
  CREATE INDEX IF NOT EXISTS collab_notifications_due_idx ON collab_notifications(status,created_at);
`);

// SQLite cannot add a foreign key or CHECK constraint to an existing table
// without rebuilding it. Rebuilding production-sized tables is unnecessarily
// risky, so the v26 hardening migration validates existing rows once and then
// enforces the same invariants with aborting triggers for future writes.
const sqliteHardeningChecks = [
  ["calendars", "calendar_type", "'personal','streaming'"],
  ["calendars", "visibility", "'private','team','public'"],
  ["calendar_events", "event_kind", "'event','stream','collab'"],
  ["calendar_events", "visibility", "'calendar','private','team','public','busy'"],
  ["calendar_events", "collab_enabled", "0,1"],
  ["collab_requests", "status", "'pending','countered','accepted','declined','cancelled'"],
  ["collab_request_participants", "status", "'pending','countered','accepted','declined','cancelled'"],
  ["collab_reschedule_proposals", "status", "'pending','accepted','declined','cancelled'"],
  ["collab_reschedule_responses", "status", "'pending','accepted','declined'"],
  ["collab_notifications", "status", "'pending','sent','failed'"],
] as const;
for (const [table, column, allowedValues] of sqliteHardeningChecks) {
  const invalid = db
    .prepare(
      `SELECT COUNT(*) AS count FROM "${table}" WHERE "${column}" IS NULL OR "${column}" NOT IN (${allowedValues})`,
    )
    .get() as { count: number };
  if (Number(invalid.count) > 0) {
    throw new Error(`Cannot apply schema hardening: ${table}.${column} contains invalid values`);
  }
  const triggerBase = `northline_v26_${table}_${column}`;
  const condition = `NEW."${column}" IS NULL OR NEW."${column}" NOT IN (${allowedValues})`;
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS "${triggerBase}_insert"
      BEFORE INSERT ON "${table}"
      WHEN ${condition}
      BEGIN SELECT RAISE(ABORT, 'invalid ${table}.${column}'); END;
    CREATE TRIGGER IF NOT EXISTS "${triggerBase}_update"
      BEFORE UPDATE OF "${column}" ON "${table}"
      WHEN ${condition}
      BEGIN SELECT RAISE(ABORT, 'invalid ${table}.${column}'); END;
  `);
}
const orphanedSqliteCollabEvents = db
  .prepare(
    `SELECT COUNT(*) AS count FROM calendar_events event LEFT JOIN collab_requests request ON request.id=event.collab_request_id WHERE event.collab_request_id IS NOT NULL AND request.id IS NULL`,
  )
  .get() as { count: number };
if (Number(orphanedSqliteCollabEvents.count) > 0) {
  throw new Error("Cannot apply schema hardening: calendar_events contains orphaned collaboration references");
}
db.exec(`
  CREATE TRIGGER IF NOT EXISTS northline_v26_calendar_events_collab_request_insert
    BEFORE INSERT ON calendar_events
    WHEN NEW.collab_request_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM collab_requests WHERE id=NEW.collab_request_id)
    BEGIN SELECT RAISE(ABORT, 'FOREIGN KEY constraint failed'); END;
  CREATE TRIGGER IF NOT EXISTS northline_v26_calendar_events_collab_request_update
    BEFORE UPDATE OF collab_request_id ON calendar_events
    WHEN NEW.collab_request_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM collab_requests WHERE id=NEW.collab_request_id)
    BEGIN SELECT RAISE(ABORT, 'FOREIGN KEY constraint failed'); END;
`);

db.exec(`
  INSERT INTO calendar_reminders
    (calendar_event_id,created_by,recipient_user_id,message,remind_at)
  SELECT event.id,event.created_by,event.created_by,
    'Collab starts in 30 minutes: ' || request.title,
    strftime('%Y-%m-%dT%H:%M:%fZ',event.start_at,'-30 minutes')
  FROM calendar_events event
  JOIN collab_requests request ON request.id=event.collab_request_id
  WHERE request.status='accepted' AND event.status='confirmed' AND event.deleted_at IS NULL
    AND datetime(event.start_at,'-30 minutes')>datetime('now')
    AND NOT EXISTS (
      SELECT 1 FROM calendar_reminders existing
      WHERE existing.calendar_event_id=event.id
        AND existing.recipient_user_id=event.created_by
        AND existing.message LIKE 'Collab starts in 30 minutes:%'
    );
`);

const boardColumns = db.prepare("PRAGMA table_info(boards)").all() as Array<{
  name: string;
}>;
const addBoardColumn = (name: string, definition: string) => {
  if (!boardColumns.some((column) => column.name === name)) {
    try {
      db.exec(`ALTER TABLE boards ADD COLUMN ${definition}`);
      boardColumns.push({ name });
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.includes("duplicate column name")
      )
        throw error;
    }
  }
};
addBoardColumn("public_id", "public_id TEXT");
addBoardColumn("created_by", "created_by INTEGER");
addBoardColumn(
  "workspace_id",
  "workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE",
);
db.prepare(
  "UPDATE boards SET created_by=owner_id WHERE created_by IS NULL",
).run();
for (const board of db
  .prepare(
    "SELECT id FROM boards WHERE public_id IS NULL OR public_id LIKE 'u%-b%'",
  )
  .all() as Array<{ id: number }>)
  db.prepare("UPDATE boards SET public_id=? WHERE id=?").run(
    createBoardPublicId(),
    board.id,
  );
db.exec(
  "CREATE UNIQUE INDEX IF NOT EXISTS boards_public_id_idx ON boards(public_id)",
);

export function ensurePersonalWorkspace(userId: number, userName?: string) {
  const existing = db
    .prepare(
      "SELECT id,public_id publicId,name,owner_id ownerId,kind FROM workspaces WHERE owner_id=? AND kind='personal'",
    )
    .get(userId) as
    | {
        id: number;
        publicId: string;
        name: string;
        ownerId: number;
        kind: string;
      }
    | undefined;
  if (existing) return existing;
  const displayName =
    userName ||
    (
      db.prepare("SELECT name FROM users WHERE id=?").get(userId) as
        { name: string } | undefined
    )?.name ||
    "Personal";
  const publicId = createWorkspacePublicId();
  const result = db
    .prepare(
      "INSERT INTO workspaces(public_id,name,owner_id,kind) VALUES(?,?,?,'personal')",
    )
    .run(publicId, `${displayName}'s workspace`, userId);
  return {
    id: Number(result.lastInsertRowid),
    publicId,
    name: `${displayName}'s workspace`,
    ownerId: userId,
    kind: "personal",
  };
}
for (const user of db.prepare("SELECT id,name FROM users").all() as Array<{
  id: number;
  name: string;
}>)
  ensurePersonalWorkspace(user.id, user.name);
for (const board of db
  .prepare("SELECT id,owner_id FROM boards WHERE workspace_id IS NULL")
  .all() as Array<{ id: number; owner_id: number }>) {
  const workspace = ensurePersonalWorkspace(board.owner_id);
  db.prepare("UPDATE boards SET workspace_id=? WHERE id=?").run(
    workspace.id,
    board.id,
  );
}

const taskSchema =
  (
    db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'",
      )
      .get() as { sql: string } | undefined
  )?.sql || "";
if (
  taskSchema.includes(
    "CHECK(status IN ('ideas','ready','progress','hold','done'))",
  )
) {
  db.pragma("foreign_keys = OFF");
  try {
    db.exec(`BEGIN;
    CREATE TABLE tasks_dynamic (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'Medium' CHECK(priority IN ('Low','Medium','High')),
      tag TEXT NOT NULL DEFAULT 'General',
      due_date TEXT,
      assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO tasks_dynamic SELECT id,board_id,title,description,status,priority,tag,due_date,assignee_id,created_by,created_at,updated_at FROM tasks;
    DROP TABLE tasks;
    ALTER TABLE tasks_dynamic RENAME TO tasks;
    COMMIT;`);
  } catch (error) {
    if (db.inTransaction) db.exec("ROLLBACK");
    throw error;
  } finally {
    db.pragma("foreign_keys = ON");
  }
}
db.exec(
  "CREATE INDEX IF NOT EXISTS tasks_board_idx ON tasks(board_id,status); CREATE INDEX IF NOT EXISTS tasks_assignee_idx ON tasks(assignee_id,due_date)",
);
addColumnIfMissing("tasks", "archived_at", "archived_at TEXT");
db.exec(
  "CREATE INDEX IF NOT EXISTS tasks_archive_idx ON tasks(board_id,archived_at)",
);

// Multi-assignment is additive so existing tasks and API clients remain
// compatible with the legacy tasks.assignee_id column. The join table is the
// source of truth for new assignments; the legacy column stores the first
// assignee for older read paths and integrations.
db.exec(`
  CREATE TABLE IF NOT EXISTS task_assignees (
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(task_id,user_id)
  );
  CREATE INDEX IF NOT EXISTS task_assignees_user_idx ON task_assignees(user_id,task_id);
  INSERT OR IGNORE INTO task_assignees(task_id,user_id)
    SELECT id,assignee_id FROM tasks WHERE assignee_id IS NOT NULL;
`);

export function createDefaultBoardColumns(boardId: number) {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO board_columns(board_id,column_key,name,color,position,is_done) VALUES(?,?,?,?,?,?)",
  );
  [
    ["ideas", "Ideas", "#a78bfa", 0, 0],
    ["ready", "Ready", "#60a5fa", 1, 0],
    ["progress", "In progress", "#f59e0b", 2, 0],
    ["hold", "On hold", "#f472b6", 3, 0],
    ["done", "Done", "#34d399", 4, 1],
  ].forEach((column) => insert.run(boardId, ...column));
}
for (const board of db.prepare("SELECT id FROM boards").all() as Array<{
  id: number;
}>)
  createDefaultBoardColumns(board.id);

const reminderColumns = db
  .prepare("PRAGMA table_info(reminders)")
  .all() as Array<{ name: string }>;
const addReminderColumn = (name: string, definition: string) => {
  if (!reminderColumns.some((column) => column.name === name)) {
    try {
      db.exec(`ALTER TABLE reminders ADD COLUMN ${definition}`);
      reminderColumns.push({ name });
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.includes("duplicate column name")
      )
        throw error;
    }
  }
};
addReminderColumn("kind", "kind TEXT NOT NULL DEFAULT 'scheduled'");
addReminderColumn("event_type", "event_type TEXT");
addReminderColumn("dedupe_key", "dedupe_key TEXT");
addReminderColumn(
  "recipient_user_id",
  "recipient_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL",
);
db.exec(
  "CREATE UNIQUE INDEX IF NOT EXISTS reminders_dedupe_idx ON reminders(dedupe_key) WHERE dedupe_key IS NOT NULL",
);

const userColumns = db.prepare("PRAGMA table_info(users)").all() as Array<{
  name: string;
}>;
const addUserColumn = (name: string, definition: string) => {
  if (userColumns.some((column) => column.name === name)) return;
  try {
    db.exec(`ALTER TABLE users ADD COLUMN ${definition}`);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes("duplicate column name")
    )
      throw error;
  }
};
if (!userColumns.some((column) => column.name === "oidc_subject")) {
  addUserColumn("oidc_subject", "oidc_subject TEXT");
}
addUserColumn("auth_source", "auth_source TEXT NOT NULL DEFAULT 'local'");
addUserColumn("identity_synced_at", "identity_synced_at TEXT");
addUserColumn("avatar", "avatar TEXT");
addUserColumn("directory_id", "directory_id TEXT");
addUserColumn("discord_user_id", "discord_user_id TEXT");
addUserColumn("discord_username", "discord_username TEXT");
addUserColumn("timezone", "timezone TEXT NOT NULL DEFAULT 'UTC'");
addUserColumn(
  "directory_visible",
  "directory_visible INTEGER NOT NULL DEFAULT 1 CHECK(directory_visible IN (0,1))",
);
db.prepare(
  "UPDATE users SET directory_id=oidc_subject,oidc_subject=NULL WHERE directory_id IS NULL AND oidc_subject GLOB '????????-????-????-????-????????????'",
).run();
db.exec(
  "CREATE UNIQUE INDEX IF NOT EXISTS users_oidc_subject_idx ON users(oidc_subject) WHERE oidc_subject IS NOT NULL",
);
db.exec(
  "CREATE UNIQUE INDEX IF NOT EXISTS users_directory_id_idx ON users(directory_id) WHERE directory_id IS NOT NULL",
);

const sessionColumns = db
  .prepare("PRAGMA table_info(sessions)")
  .all() as Array<{ name: string }>;
const addSessionColumn = (name: string, definition: string) => {
  if (sessionColumns.some((column) => column.name === name)) return;
  try {
    db.exec(`ALTER TABLE sessions ADD COLUMN ${definition}`);
    sessionColumns.push({ name });
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes("duplicate column name")
    )
      throw error;
  }
};
addSessionColumn("user_agent", "user_agent TEXT");
addSessionColumn("created_ip", "created_ip TEXT");
addSessionColumn("last_seen_at", "last_seen_at TEXT");

const auditColumns = db.prepare("PRAGMA table_info(audit_log)").all() as Array<{
  name: string;
}>;
if (!auditColumns.some((column) => column.name === "detail"))
  addColumnIfMissing("audit_log", "detail", "detail TEXT");

const migrations: [number, string][] = [
  [1, "initial users and sessions"],
  [2, "relational boards and tasks"],
  [3, "opaque board identifiers"],
  [4, "authentik identity profiles"],
  [5, "scheduled reminders"],
  [6, "task buddy notification preferences"],
  [7, "notification snapshots and activity"],
  [8, "session inventory and beta hardening"],
  [9, "separate directory login and Discord identities"],
  [10, "custom board workflow columns"],
  [11, "personal and shared workspaces"],
  [12, "recoverable task archive"],
  [13, "persistent time cards and audit history"],
  [14, "audited time entry deletion"],
  [15, "descriptive administration audit events"],
  [16, "private calendars and selective sharing"],
  [17, "calendar reminders and recoverable deletion"],
  [18, "per-user time zones"],
  [19, "stream schedules and collaboration requests"],
  [20, "multi-user collaboration participants"],
  [21, "collaboration reschedule proposals"],
  [22, "management identity directory visibility"],
  [23, "directory Discord contact profiles"],
  [24, "multi-assignee tasks and pauseable time entries"],
  [25, "reusable teams and team-linked workspaces"],
  [26, "schema hardening and collaboration integrity"],
];
const recordMigrations = db.transaction(() => {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO schema_migrations(version,name) VALUES(?,?)",
  );
  for (const migration of migrations) insert.run(...migration);
});
recordMigrations();
db.prepare(
  "DELETE FROM calendar_events WHERE deleted_at IS NOT NULL AND datetime(deleted_at)<datetime('now','-30 days')",
).run();
db.prepare(
  "DELETE FROM calendars WHERE deleted_at IS NOT NULL AND datetime(deleted_at)<datetime('now','-30 days')",
).run();

const email = process.env.NORTHLINE_ADMIN_EMAIL;
const password = process.env.NORTHLINE_ADMIN_PASSWORD;
if (!email || !password) {
  throw new Error(
    "NORTHLINE_ADMIN_EMAIL and NORTHLINE_ADMIN_PASSWORD must be configured before Northline starts",
  );
}
db.transaction(() => {
  const claimed = db
    .prepare(
      "INSERT OR IGNORE INTO app_meta (key,value) VALUES ('clean_slate_v1',CURRENT_TIMESTAMP)",
    )
    .run();
  if (claimed.changes === 1) {
    db.prepare("DELETE FROM sessions").run();
    db.prepare("DELETE FROM audit_log").run();
    db.prepare("DELETE FROM users").run();
    db.prepare(
      "INSERT INTO users (name,email,password_hash,role,status) VALUES (?,?,?,?,?)",
    ).run("Administrator", email, hashSync(password, 12), "Admin", "Active");
  }
})();
db.prepare(
  "UPDATE users SET directory_visible=0 WHERE auth_source='local' AND role='Admin' AND email=? COLLATE NOCASE",
).run(email);

export default db;
