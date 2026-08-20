import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

export const createBoardPublicId = () =>
  `brd_${randomBytes(16).toString("hex")}`;
export const createColumnKey = () => `col_${randomBytes(8).toString("hex")}`;
export const createWorkspacePublicId = () =>
  `wsp_${randomBytes(16).toString("hex")}`;
export const createCalendarPublicId = () =>
  `cal_${randomBytes(16).toString("hex")}`;
export const createCalendarEventPublicId = () =>
  `evt_${randomBytes(16).toString("hex")}`;
export const createCollabRequestPublicId = () =>
  `clb_${randomBytes(16).toString("hex")}`;
export const createCollabReschedulePublicId = () =>
  `rsc_${randomBytes(16).toString("hex")}`;

type QueryValue = string | number | boolean | null | Date | Buffer | undefined;
type SqliteLikeRow = QueryResultRow & Record<string, unknown>;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.NORTHLINE_DB_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: process.env.NORTHLINE_DB_SSL === "require" ? { rejectUnauthorized: false } : undefined,
});
const transactionStorage = new AsyncLocalStorage<PoolClient>();

function replaceQuestionMarks(sql: string) {
  let index = 0;
  let quote: "'" | '"' | "`" | null = null;
  let output = "";
  for (let position = 0; position < sql.length; position += 1) {
    const character = sql[position];
    if (quote) {
      output += character;
      if (character === quote && sql[position - 1] !== "\\") quote = null;
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      output += character;
      continue;
    }
    if (character === "?") {
      index += 1;
      output += `$${index}`;
    } else output += character;
  }
  return output;
}

function translateSql(input: string) {
  let sql = input
    // SQLite's NOCASE collation is part of Northline's identity semantics.
    // Preserve it explicitly instead of silently falling back to PostgreSQL's
    // case-sensitive comparison/order behavior.
    .replace(/([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*(\?)\s+COLLATE\s+NOCASE\b/gi, "LOWER($1)=LOWER($2)")
    .replace(/([A-Za-z_][A-Za-z0-9_.]*)\s+COLLATE\s+NOCASE\b/gi, "LOWER($1)")
    .replace(/\s+COLLATE\s+NOCASE\b/gi, "")
    .replace(/\bINSERT\s+OR\s+IGNORE\s+INTO\b/gi, "INSERT INTO");
  sql = sql.replace(/(INSERT INTO[\s\S]*?\))\s*VALUES\s*([\s\S]*?)(?=;|$)/i, (match, columns, values) => {
    if (/ON\s+CONFLICT/i.test(match)) return match;
    return `${columns} VALUES ${values} ON CONFLICT DO NOTHING`;
  });
  sql = sql
    .replace(/datetime\(\s*'now'\s*\)/gi, "CURRENT_TIMESTAMP")
    .replace(/datetime\(\s*'now'\s*,\s*'([+-])(\d+)\s+(minute|minutes|hour|hours|day|days)'\s*\)/gi, (_match, sign, amount, unit) =>
      `CURRENT_TIMESTAMP ${sign === "+" ? "+" : "-"} INTERVAL '${amount} ${unit}'`,
    )
    .replace(/datetime\(\s*([^,()]+)\s*,\s*'([+-])(\d+)\s+(minute|minutes|hour|hours|day|days)'\s*\)/gi, (_match, value, sign, amount, unit) =>
      `(${value.trim()}::timestamptz ${sign === "+" ? "+" : "-"} INTERVAL '${amount} ${unit}')`,
    )
    .replace(/datetime\(\s*([^()]+)\s*\)/gi, "($1::timestamptz)")
    .replace(/strftime\(\s*'%Y-%m-%dT%H:%M:%fZ'\s*,\s*([^,()]+)\s*,\s*'(-?\d+)\s+minutes?'\s*\)/gi, (_match, value, minutes) =>
      `to_char(${value.trim()}::timestamptz - INTERVAL '${Math.abs(Number(minutes))} minutes','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`,
    );
  return replaceQuestionMarks(sql);
}

const generatedIdTables = new Set([
  "users",
  "audit_log",
  "calendars",
  "calendar_events",
  "calendar_activity",
  "calendar_reminders",
  "workspaces",
  "boards",
  "board_columns",
  "tasks",
  "comments",
  "reminders",
  "notification_deliveries",
  "board_activity",
  "time_entries",
  "time_entry_audit",
  "collab_requests",
  "collab_notifications",
  "collab_reschedule_proposals",
]);

function withReturningId(sql: string) {
  if (!/^\s*INSERT\s+INTO\s+/i.test(sql) || /\bRETURNING\b/i.test(sql)) return sql;
  const table = sql.match(/^\s*INSERT\s+INTO\s+["`]?([A-Za-z_][A-Za-z0-9_]*)/i)?.[1];
  return table && generatedIdTables.has(table) ? `${sql.replace(/;\s*$/, "")} RETURNING id` : sql;
}

class PostgresStatement {
  constructor(private readonly sql: string) {}

  async get<T extends SqliteLikeRow = SqliteLikeRow>(...parameters: QueryValue[]) {
    const result = await query<T>(withReturningId(this.sql), parameters);
    return result.rows[0] as T | undefined;
  }

  async all<T extends SqliteLikeRow = SqliteLikeRow>(...parameters: QueryValue[]) {
    const result = await query<T>(this.sql, parameters);
    return result.rows as T[];
  }

  async run(...parameters: QueryValue[]) {
    const result = await query<SqliteLikeRow>(withReturningId(this.sql), parameters);
    const insertedId = result.rows[0]?.id;
    return {
      changes: result.rowCount,
      lastInsertRowid: insertedId === undefined ? 0 : Number(insertedId),
    };
  }
}

async function query<T extends QueryResultRow>(sql: string, parameters: QueryValue[] = []) {
  const client = transactionStorage.getStore() || pool;
  return client.query<T>(translateSql(sql), parameters);
}

const db = {
  prepare(sql: string) {
    return new PostgresStatement(sql);
  },
  async transaction<T>(callback: () => T | Promise<T>) {
    const existing = transactionStorage.getStore();
    if (existing) return callback();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await transactionStorage.run(client, callback);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  },
  async close() {
    await pool.end();
  },
};

async function ensureReady() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required when NORTHLINE_DB_DRIVER=postgres");
  }
  const result = await query<{ exists: string | null }>("SELECT to_regclass('public.schema_migrations') AS exists");
  if (!result.rows[0]?.exists) {
    throw new Error("PostgreSQL schema is not initialized; run the guarded migration before starting Northline");
  }
  const required = await query<{ table_name: string; column_name: string }>(`
    SELECT table_name,column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND (
      (table_name='time_entries' AND column_name IN ('paused_at','paused_seconds'))
      OR (table_name='task_assignees' AND column_name IN ('task_id','user_id'))
    )
  `);
  const requiredColumns = new Set(required.rows.map((row) => `${row.table_name}.${row.column_name}`));
  if (!requiredColumns.has("time_entries.paused_at") || !requiredColumns.has("time_entries.paused_seconds") || !requiredColumns.has("task_assignees.task_id") || !requiredColumns.has("task_assignees.user_id")) {
    throw new Error("PostgreSQL schema is missing the latest Northline additive structures; rerun the guarded migration");
  }
  await query("SELECT 1");
}

await ensureReady();

export async function ensurePersonalWorkspace(userId: number, userName?: string) {
  const existing = await db
    .prepare("SELECT id,public_id publicId,name,owner_id ownerId,kind FROM workspaces WHERE owner_id=? AND kind='personal'")
    .get<{ id: number; publicId: string; name: string; ownerId: number; kind: string }>(userId);
  if (existing) return existing;
  const displayName = userName || (await db.prepare("SELECT name FROM users WHERE id=?").get<{ name: string }>(userId))?.name || "Personal";
  const publicId = createWorkspacePublicId();
  const result = await db
    .prepare("INSERT INTO workspaces(public_id,name,owner_id,kind) VALUES(?,?,?,'personal')")
    .run(publicId, `${displayName}'s workspace`, userId);
  return { id: Number(result.lastInsertRowid), publicId, name: `${displayName}'s workspace`, ownerId: userId, kind: "personal" };
}

export async function createDefaultBoardColumns(boardId: number) {
  const insert = db.prepare(
    "INSERT INTO board_columns(board_id,column_key,name,color,position,is_done) VALUES(?,?,?,?,?,?) ON CONFLICT DO NOTHING",
  );
  for (const column of [
    ["ideas", "Ideas", "#a78bfa", 0, 0],
    ["ready", "Ready", "#60a5fa", 1, 0],
    ["progress", "In progress", "#f59e0b", 2, 0],
    ["hold", "On hold", "#f472b6", 3, 0],
    ["done", "Done", "#34d399", 4, 1],
  ] as const) await insert.run(boardId, ...column);
}

export default db;
