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
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
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

const timeEntryColumns = db
  .prepare("PRAGMA table_info(time_entries)")
  .all() as Array<{ name: string }>;
if (!timeEntryColumns.some((column) => column.name === "deleted_at"))
  db.exec("ALTER TABLE time_entries ADD COLUMN deleted_at TEXT");

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
const taskColumns = db.prepare("PRAGMA table_info(tasks)").all() as Array<{
  name: string;
}>;
if (!taskColumns.some((column) => column.name === "archived_at"))
  db.exec("ALTER TABLE tasks ADD COLUMN archived_at TEXT");
db.exec(
  "CREATE INDEX IF NOT EXISTS tasks_archive_idx ON tasks(board_id,archived_at)",
);

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
];
const recordMigrations = db.transaction(() => {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO schema_migrations(version,name) VALUES(?,?)",
  );
  for (const migration of migrations) insert.run(...migration);
});
recordMigrations();

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

export default db;
