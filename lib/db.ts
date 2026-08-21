import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Northline's database entry point.
 *
 * PostgreSQL is the supported runtime for local development and production.
 * SQLite remains available only when NORTHLINE_DB_DRIVER=sqlite is explicitly
 * selected for fixtures, legacy imports, or clean-install migration tests.
 */
// The two drivers intentionally expose the same runtime surface but have
// different synchronous/asynchronous method signatures. Keeping this boundary
// dynamic lets the PostgreSQL runtime remain the single local/production path
// while preserving an explicit SQLite compatibility path for fixtures and
// legacy imports.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the driver boundary intentionally unifies sync SQLite and async PostgreSQL implementations.
const implementation: any =
  process.env.NORTHLINE_DB_DRIVER === "postgres"
    ? await import("./db-postgres")
    : await import("./db-sqlite");

// Keep the local SQLite driver compatible with the asynchronous PostgreSQL
// contract. `await` works with SQLite's immediate values, while this wrapper
// gives SQLite transactions an explicit async boundary so route code can use
// the same transaction shape in both environments.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see the driver-boundary note above.
const rawDb: any = implementation.default;
const db = process.env.NORTHLINE_DB_DRIVER === "postgres"
  ? rawDb
  : (() => {
      const transactionStorage = new AsyncLocalStorage<boolean>();
      let transactionTail: Promise<unknown> = Promise.resolve();
      const sqliteTransaction = async <T>(callback: () => T | Promise<T>) => {
        if (transactionStorage.getStore()) return callback();
        const run = transactionTail.then(async () => {
          rawDb.exec("BEGIN");
          try {
            const result = await transactionStorage.run(true, callback);
            rawDb.exec("COMMIT");
            return result;
          } catch (error) {
            if (rawDb.inTransaction) rawDb.exec("ROLLBACK");
            throw error;
          }
        });
        transactionTail = run.catch(() => undefined);
        return run;
      };
      return {
        prepare: (sql: string) => rawDb.prepare(sql),
        transaction: sqliteTransaction,
        pragma: (value: string) => rawDb.pragma(value),
        exec: (value: string) => rawDb.exec(value),
        close: () => rawDb.close(),
      };
    })();

export const createBoardPublicId = implementation.createBoardPublicId;
export const createColumnKey = implementation.createColumnKey;
export const createWorkspacePublicId = implementation.createWorkspacePublicId;
export const createTeamPublicId = implementation.createTeamPublicId;
export const createCalendarPublicId = implementation.createCalendarPublicId;
export const createCalendarEventPublicId = implementation.createCalendarEventPublicId;
export const createCollabRequestPublicId = implementation.createCollabRequestPublicId;
export const createCollabReschedulePublicId = implementation.createCollabReschedulePublicId;
export const ensurePersonalWorkspace = implementation.ensurePersonalWorkspace;
export const createDefaultBoardColumns = implementation.createDefaultBoardColumns;

export default db;
