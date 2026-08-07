import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { hashSync } from "bcryptjs";

const dataDirectory = process.env.ORBIT_DATA_DIR || path.join(process.cwd(), "data");
fs.mkdirSync(dataDirectory, { recursive: true });
const db = new Database(path.join(dataDirectory, "orbit.db"));
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
  CREATE TABLE IF NOT EXISTS boards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
  CREATE INDEX IF NOT EXISTS board_members_user_idx ON board_members(user_id);
  CREATE INDEX IF NOT EXISTS tasks_board_idx ON tasks(board_id,status);
  CREATE INDEX IF NOT EXISTS comments_task_idx ON comments(task_id);
`);

const userColumns = db.prepare("PRAGMA table_info(users)").all() as Array<{name:string}>;
const addUserColumn = (name: string, definition: string) => {
  if (userColumns.some((column) => column.name === name)) return;
  try {
    db.exec(`ALTER TABLE users ADD COLUMN ${definition}`);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("duplicate column name")) throw error;
  }
};
if (!userColumns.some((column) => column.name === "oidc_subject")) {
  addUserColumn("oidc_subject", "oidc_subject TEXT");
}
addUserColumn("auth_source", "auth_source TEXT NOT NULL DEFAULT 'local'");
addUserColumn("identity_synced_at", "identity_synced_at TEXT");
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS users_oidc_subject_idx ON users(oidc_subject) WHERE oidc_subject IS NOT NULL");

const email = process.env.ORBIT_ADMIN_EMAIL;
const password = process.env.ORBIT_ADMIN_PASSWORD;
if (!email || !password) {
  throw new Error("ORBIT_ADMIN_EMAIL and ORBIT_ADMIN_PASSWORD must be configured before Orbit starts");
}
db.transaction(() => {
  const claimed = db.prepare("INSERT OR IGNORE INTO app_meta (key,value) VALUES ('clean_slate_v1',CURRENT_TIMESTAMP)").run();
  if (claimed.changes === 1) {
    db.prepare("DELETE FROM sessions").run();
    db.prepare("DELETE FROM audit_log").run();
    db.prepare("DELETE FROM users").run();
    db.prepare("INSERT INTO users (name,email,password_hash,role,status) VALUES (?,?,?,?,?)")
      .run("Administrator", email, hashSync(password, 12), "Admin", "Active");
  }
})();

export default db;
