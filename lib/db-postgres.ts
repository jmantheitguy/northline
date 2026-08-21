import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { quoteCamelCaseAliases } from "./postgres-compat";

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
  let sql = quoteCamelCaseAliases(input)
    // SQLite's NOCASE collation is part of Northline's identity semantics.
    // Preserve it explicitly instead of silently falling back to PostgreSQL's
    // case-sensitive comparison/order behavior.
    .replace(/([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*(\?)\s+COLLATE\s+NOCASE\b/gi, "LOWER($1)=LOWER($2)")
    .replace(/([A-Za-z_][A-Za-z0-9_.]*)\s+COLLATE\s+NOCASE\b/gi, "LOWER($1)")
    .replace(/\s+COLLATE\s+NOCASE\b/gi, "")
    .replace(/\bINSERT\s+OR\s+IGNORE\s+INTO\b/gi, "INSERT INTO");
  // Keep a generated-id RETURNING clause after the compatibility conflict
  // clause. Without stopping the VALUES capture before RETURNING, an insert
  // such as `VALUES (...) RETURNING id` becomes `RETURNING id ON CONFLICT`,
  // which PostgreSQL rejects. This affected board sharing because its audit
  // row is written immediately after the membership row.
  sql = sql.replace(/(INSERT INTO[\s\S]*?\))\s*VALUES\s*([\s\S]*?)(?=\s+RETURNING\b|;|$)/i, (match, columns, values) => {
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
  // The migrated schema keeps timestamp values as text for SQLite
  // compatibility. PostgreSQL will not compare that text directly with
  // CURRENT_TIMESTAMP, so cast timestamp columns at comparison boundaries.
  sql = sql.replace(
    /\b([A-Za-z_][A-Za-z0-9_.]*_at)\s*(<=|>=|<>|<|>)\s*(CURRENT_TIMESTAMP(?:\s*(?:\+|-)\s*INTERVAL\s+'[^']+')?)/gi,
    (_match, column, operator, rightHandSide) => `${column}::timestamptz ${operator} ${rightHandSide}`,
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
  "teams",
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
  await runPostgresSchemaMigrations();
  const latestMigration = await query<{ exists: boolean }>("SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version=26) AS exists");
  if (!latestMigration.rows[0]?.exists) {
    throw new Error("PostgreSQL schema is missing the latest Northline hardening migration; rerun the guarded migration");
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

/**
 * Apply compatibility DDL only when its migration is pending. This keeps
 * ordinary application startups read-only while still allowing an older
 * PostgreSQL snapshot to be upgraded in one guarded transaction.
 */
async function runPostgresSchemaMigrations() {
  await db.transaction(async () => {
    // Serialize startup migrations across multiple application instances.
    // The lock is transaction-scoped and releases automatically on commit or
    // rollback, so it cannot persist after a failed boot.
    await query("SELECT pg_advisory_xact_lock(hashtext('northline.schema.migrations'))");
    const applied = new Set(
      (await query<{ version: number }>("SELECT version FROM schema_migrations")).rows.map((row) => Number(row.version)),
    );
    if (!applied.has(25)) await ensureTeamSchema();
    if (!applied.has(26)) {
      await ensureCollabSchema();
      await applySchemaHardening();
      await query("INSERT INTO schema_migrations(version,name) VALUES(26,'schema hardening and collaboration integrity') ON CONFLICT(version) DO NOTHING");
    }
  });
}

async function ensureTeamSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS "teams" (
      "id" INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      "public_id" TEXT NOT NULL UNIQUE,
      "name" TEXT NOT NULL,
      "description" TEXT NOT NULL DEFAULT '',
      "color" TEXT NOT NULL DEFAULT '#7c6ce7',
      "owner_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS "team_members" (
      "team_id" INTEGER NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
      "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "role" TEXT NOT NULL CHECK("role" IN ('manager','member')),
      "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY ("team_id","user_id")
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS "team_workspaces" (
      "team_id" INTEGER NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
      "workspace_id" INTEGER NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
      "permission" TEXT NOT NULL CHECK("permission" IN ('viewer','editor')),
      "created_by" INTEGER NOT NULL REFERENCES "users"("id"),
      "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY ("team_id","workspace_id")
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS team_members_user_idx ON "team_members" ("user_id","team_id")');
  await query('CREATE INDEX IF NOT EXISTS team_workspaces_workspace_idx ON "team_workspaces" ("workspace_id","team_id")');
  await query('ALTER TABLE "calendars" ADD COLUMN IF NOT EXISTS "team_id" INTEGER REFERENCES "teams"("id") ON DELETE SET NULL');
  await query('CREATE INDEX IF NOT EXISTS calendars_team_idx ON "calendars" ("team_id","visibility")');
  await query("INSERT INTO schema_migrations(version,name) VALUES(25,'reusable teams and team-linked workspaces') ON CONFLICT(version) DO NOTHING");
}

/**
 * Keep collaboration reads safe when a Postgres database was migrated before
 * the calendar/collaboration feature set existed. This is deliberately
 * additive and idempotent: it never rewrites or removes production rows.
 */
async function ensureCollabSchema() {
  await query(`
    ALTER TABLE "calendar_events"
      ADD COLUMN IF NOT EXISTS "event_kind" TEXT NOT NULL DEFAULT 'event',
      ADD COLUMN IF NOT EXISTS "visibility" TEXT NOT NULL DEFAULT 'calendar',
      ADD COLUMN IF NOT EXISTS "platform" TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "game" TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "stream_url" TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS "collab_enabled" INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "collab_request_id" INTEGER
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS "collab_requests" (
      "id" INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      "public_id" TEXT NOT NULL UNIQUE,
      "source_event_id" INTEGER REFERENCES "calendar_events"("id") ON DELETE SET NULL,
      "requester_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "recipient_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "requester_calendar_id" INTEGER NOT NULL REFERENCES "calendars"("id") ON DELETE CASCADE,
      "recipient_calendar_id" INTEGER REFERENCES "calendars"("id") ON DELETE SET NULL,
      "proposed_start_at" TEXT NOT NULL,
      "proposed_end_at" TEXT NOT NULL,
      "timezone" TEXT NOT NULL DEFAULT 'UTC',
      "title" TEXT NOT NULL,
      "message" TEXT NOT NULL DEFAULT '',
      "status" TEXT NOT NULL DEFAULT 'pending',
      "response_message" TEXT NOT NULL DEFAULT '',
      "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`
    ALTER TABLE "collab_requests"
      ADD COLUMN IF NOT EXISTS "recipient_calendar_id" INTEGER REFERENCES "calendars"("id") ON DELETE SET NULL
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS "collab_notifications" (
      "id" INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      "collab_request_id" INTEGER NOT NULL REFERENCES "collab_requests"("id") ON DELETE CASCADE,
      "recipient_user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "message" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "error" TEXT,
      "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "sent_at" TEXT
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS "collab_request_participants" (
      "collab_request_id" INTEGER NOT NULL REFERENCES "collab_requests"("id") ON DELETE CASCADE,
      "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "calendar_id" INTEGER REFERENCES "calendars"("id") ON DELETE SET NULL,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "proposed_start_at" TEXT,
      "proposed_end_at" TEXT,
      "timezone" TEXT,
      "response_message" TEXT NOT NULL DEFAULT '',
      "updated_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY ("collab_request_id", "user_id")
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS "collab_reschedule_proposals" (
      "id" INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      "public_id" TEXT NOT NULL UNIQUE,
      "collab_request_id" INTEGER NOT NULL REFERENCES "collab_requests"("id") ON DELETE CASCADE,
      "proposed_by" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "proposed_start_at" TEXT NOT NULL,
      "proposed_end_at" TEXT NOT NULL,
      "timezone" TEXT NOT NULL,
      "message" TEXT NOT NULL DEFAULT '',
      "status" TEXT NOT NULL DEFAULT 'pending',
      "created_at" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "resolved_at" TEXT
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS "collab_reschedule_responses" (
      "proposal_id" INTEGER NOT NULL REFERENCES "collab_reschedule_proposals"("id") ON DELETE CASCADE,
      "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "responded_at" TEXT,
      PRIMARY KEY ("proposal_id", "user_id")
    )
  `);
  await query(`
    INSERT INTO "collab_request_participants"
      ("collab_request_id","user_id","calendar_id","status","proposed_start_at","proposed_end_at","timezone","response_message","updated_at")
    SELECT "id","recipient_id","recipient_calendar_id","status","proposed_start_at","proposed_end_at","timezone","response_message","updated_at"
    FROM "collab_requests"
    ON CONFLICT ("collab_request_id","user_id") DO NOTHING
  `);
  await query('CREATE INDEX IF NOT EXISTS collab_requests_parties_idx ON "collab_requests" ("recipient_id","requester_id","status")');
  await query('CREATE INDEX IF NOT EXISTS collab_participants_user_idx ON "collab_request_participants" ("user_id","status")');
  await query("CREATE UNIQUE INDEX IF NOT EXISTS collab_reschedule_one_pending_idx ON \"collab_reschedule_proposals\" (\"collab_request_id\") WHERE \"status\"='pending'");
  await query('CREATE INDEX IF NOT EXISTS collab_reschedule_responses_user_idx ON "collab_reschedule_responses" ("user_id","status")');
  await query('CREATE INDEX IF NOT EXISTS collab_notifications_due_idx ON "collab_notifications" ("status","created_at")');
}

async function applySchemaHardening() {
  const orphanedEvents = await query<{ count: string }>(`
    SELECT COUNT(*)::text AS count
    FROM "calendar_events" event
    LEFT JOIN "collab_requests" request ON request."id"=event."collab_request_id"
    WHERE event."collab_request_id" IS NOT NULL AND request."id" IS NULL
  `);
  if (Number(orphanedEvents.rows[0]?.count || 0) > 0) {
    throw new Error("Cannot apply schema hardening: calendar_events contains orphaned collaboration references");
  }
  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname='calendar_events_collab_request_id_fkey'
          AND conrelid='public.calendar_events'::regclass
      ) THEN
        ALTER TABLE "calendar_events"
          ADD CONSTRAINT "calendar_events_collab_request_id_fkey"
          FOREIGN KEY ("collab_request_id") REFERENCES "collab_requests"("id") ON DELETE SET NULL;
      END IF;
    END
    $$;
  `);
  const checks = [
    ["calendars", "calendars_calendar_type_check", `"calendar_type" IN ('personal','streaming')`],
    ["calendars", "calendars_visibility_check", `"visibility" IN ('private','team','public')`],
    ["calendar_events", "calendar_events_event_kind_check", `"event_kind" IN ('event','stream','collab')`],
    ["calendar_events", "calendar_events_visibility_check", `"visibility" IN ('calendar','private','team','public','busy')`],
    ["calendar_events", "calendar_events_collab_enabled_check", `"collab_enabled" IN (0,1)`],
    ["collab_requests", "collab_requests_status_check", `"status" IN ('pending','countered','accepted','declined','cancelled')`],
    ["collab_request_participants", "collab_request_participants_status_check", `"status" IN ('pending','countered','accepted','declined','cancelled')`],
    ["collab_reschedule_proposals", "collab_reschedule_proposals_status_check", `"status" IN ('pending','accepted','declined','cancelled')`],
    ["collab_reschedule_responses", "collab_reschedule_responses_status_check", `"status" IN ('pending','accepted','declined')`],
    ["collab_notifications", "collab_notifications_status_check", `"status" IN ('pending','sent','failed')`],
  ] as const;
  for (const [table, name, expression] of checks) {
    await query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname='${name}' AND conrelid='public.${table}'::regclass
        ) THEN
          ALTER TABLE "${table}" ADD CONSTRAINT "${name}" CHECK (${expression});
        END IF;
      END
      $$;
    `);
  }
  await query('CREATE INDEX IF NOT EXISTS calendar_events_collab_request_idx ON "calendar_events" ("collab_request_id")');
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
