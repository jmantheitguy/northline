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
`);

const userColumns = db.prepare("PRAGMA table_info(users)").all() as Array<{name:string}>;
if (!userColumns.some((column) => column.name === "oidc_subject")) {
  db.exec("ALTER TABLE users ADD COLUMN oidc_subject TEXT");
}
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS users_oidc_subject_idx ON users(oidc_subject) WHERE oidc_subject IS NOT NULL");

const email = process.env.ORBIT_ADMIN_EMAIL || "admin";
const password = process.env.ORBIT_ADMIN_PASSWORD || "password";
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
