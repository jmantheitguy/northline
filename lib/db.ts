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
`);

const email = process.env.ORBIT_ADMIN_EMAIL || "admin@orbit.local";
const password = process.env.ORBIT_ADMIN_PASSWORD || "change-me-now";
db.prepare("INSERT OR IGNORE INTO users (name,email,password_hash,role,status) VALUES (?,?,?,?,?)")
  .run("Orbit Administrator", email, hashSync(password, 12), "Admin", "Active");

export default db;
