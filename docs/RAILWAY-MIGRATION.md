# Railway migration plan

Northline is a production application with real users. This document records
the PostgreSQL cutover and the safe local-development workflow. It intentionally
contains no provider credentials, private hostnames, or account identifiers.

## Recommended target architecture

| Responsibility | Target |
| --- | --- |
| Web UI and API | Railway web service running the Northline container |
| Application database | PostgreSQL, with `DATABASE_URL` supplied privately |
| Reminders and Discord delivery | Separate worker service with a durable job lease |
| Files and encrypted backups | S3-compatible object storage |
| Identity | Existing Authentik OIDC provider |
| Public HTTPS | Existing Cloudflare DNS/tunnel or a controlled Railway origin |

The repository now includes `railway.json`, which configures Railway to build
the existing root `Dockerfile`, wait for `/health`, and restart failed web
deployments. The health endpoint is intentionally dependency-light: it proves
the process is serving without exposing database, identity, or integration
details.

Railway documents PostgreSQL services, persistent volumes, S3-compatible
storage, and usage limits in its platform documentation. Keep the database and
backup copy independent from the application container. The application must
never depend on an ephemeral container filesystem for durable data.

## Runtime database parity

PostgreSQL is now the runtime database in both Railway production and local
development. Northline has a connection-aware asynchronous PostgreSQL driver
behind `lib/db.ts`; the local Compose override starts an isolated PostgreSQL 18
container on host port `55432`. The driver preserves the case-insensitive email
identity rule and uses a transaction-scoped connection pool. SQLite remains
available only for legacy imports, fixtures, and clean-install migration tests,
so the normal development path exercises the same driver and query behavior as
production.

The compatibility normalizer in `lib/db-postgres.ts` exists for the small amount
of SQLite-era SQL retained by shared domain helpers and for the legacy importer;
it is not a second local runtime. Both normal environments select the same
PostgreSQL implementation through `NORTHLINE_DB_DRIVER=postgres`.

Never point local `DATABASE_URL` at Railway production. Keep the local password
URL-safe and set it through an uncommitted `.env` or the process environment.

## Local PostgreSQL workflow

Requirements: Docker Desktop (or Docker Engine with Compose), Node.js 22.13 or
newer, and an isolated local database. From the repository root:

```powershell
Copy-Item .env.example .env
# Edit .env: replace the administrator placeholders and set a local-only,
# URL-safe NORTHLINE_POSTGRES_PASSWORD.
docker compose -f compose.yaml -f compose.local-postgres.yaml up -d postgres
npm install
npm run dev
```

The first startup creates the PostgreSQL schema and the configured local
administrator. For an existing SQLite development snapshot, stop the app,
start only the local `postgres` service, set `NORTHLINE_MIGRATION_TARGET=staging`
and the local `DATABASE_URL`, then run the guarded import:

```powershell
$env:NORTHLINE_MIGRATION_TARGET = "staging"
$env:DATABASE_URL = "postgresql://northline:<local-only-password>@127.0.0.1:55432/northline"
node scripts/migrate-sqlite-to-postgres.mjs --source .\data\northline.db --execute
docker compose -f compose.yaml -f compose.local-postgres.yaml up -d northline
```

The importer refuses to merge into a non-empty database. It is appropriate for
an isolated local database only; never use `NORTHLINE_MIGRATION_TARGET=production`
from a workstation. Resetting local-only data requires an explicit destructive
Compose volume removal and is not part of normal development.

## Local migration tooling

`scripts/migrate-sqlite-to-postgres.mjs` is a read-only plan by default. It
inspects the final SQLite schema, orders tables by foreign-key dependencies, and
reports row counts without opening a PostgreSQL connection:

```powershell
node scripts/migrate-sqlite-to-postgres.mjs
```

An actual copy is intentionally guarded. It requires an empty staging database,
`DATABASE_URL`, `--execute`, and the explicit `NORTHLINE_MIGRATION_TARGET=staging`
environment variable:

```powershell
$env:NORTHLINE_MIGRATION_TARGET = "staging"
$env:DATABASE_URL = "<staging-only connection string>"
node scripts/migrate-sqlite-to-postgres.mjs --source .\data\northline.db --execute
```

Never run the guarded command against production. Do not put the connection
string in a file, prompt, commit, or chat transcript. The tool refuses to merge
into a non-empty target and performs the copy in one transaction.

## Implementation sequence

1. Create a separate Railway staging project and PostgreSQL service.
2. Add a repository data-access boundary and a PostgreSQL implementation while
   retaining SQLite for legacy import and fixture support.
3. Port schema migrations and replace SQLite-only SQL (`datetime`, `strftime`,
   `INSERT OR IGNORE`, `lastInsertRowid`, and `PRAGMA` checks) with portable
   equivalents. The runtime now uses PostgreSQL-generated IDs and a
   compatibility index for case-insensitive user emails.
4. Run the migration planner against a sanitized production-shaped fixture,
   then copy a verified production backup into staging. The import is
   forward-only and adds the newest pauseable-time-entry and multi-assignee
   structures when an older SQLite snapshot predates those additive changes.
5. Move reminder delivery into a separate worker. Short-lived scheduled jobs
   may handle maintenance, but a long-running Discord Gateway connection must
   remain a worker service.
6. Move attachments and backup archives to private object storage with
   encryption, lifecycle retention, and a tested restore path.
7. Configure Authentik callback URLs, Discord variables, and application
   secrets only in Railway's private environment settings.
8. Run authorization, clean-install, build, reminder, time-card, calendar, and
   backup/restore tests in staging.
9. Schedule a controlled cutover: verified backup, short write freeze, final
   import, health checks, DNS/origin switch, and a documented rollback window.

Keep the existing production deployment online until the cutover has been
verified. A rollback restores the previous SQLite snapshot and deployment; it
does not downgrade a PostgreSQL schema in place.

## Cost controls

Set a billing alert and a hard usage limit before staging. Remember that a hard
limit protects the budget by taking workloads offline, so it must be paired with
monitoring. Start with the smallest web service and worker sizes that pass load
and health tests, then increase them only from observed metrics.

## Current production status

- Railway production uses the managed PostgreSQL service through its private
  `DATABASE_URL`, with the Northline web service and Authentik services in the
  same Railway environment.
- Local development uses the isolated Compose PostgreSQL service from
  `compose.local-postgres.yaml`, so the local and production runtime drivers
  are identical.
- SQLite is retained only for legacy import, fixtures, and clean-install
  migration tests. It is not the normal runtime path.
- Production DNS, Authentik, Discord, and backups are managed separately from
  this local-development configuration.

The staging and cutover notes below are historical reference for the migration
that has already completed; they are not instructions to repeat against the
live database.

## Historical cutover runbook

The following sequence is the only supported production cutover. It requires a
fresh backup and an explicit write freeze; it is not a routine deploy.

1. Announce the maintenance window and stop writes to the existing Northline
   service. Leave the old deployment available for rollback, but do not allow
   users to create or edit data during the freeze.
2. Capture a final consistent SQLite snapshot outside the repository and run
   `node scripts/migrate-sqlite-to-postgres.mjs --source <snapshot>` to record
   table and row counts. Never point the migration command at the live SQLite
   file.
3. Confirm the destination PostgreSQL database is empty, set its private
   `DATABASE_URL`, and run the guarded import with
   `NORTHLINE_MIGRATION_TARGET=production` and the exact separate confirmation
   `NORTHLINE_MIGRATION_CONFIRM=I_UNDERSTAND_NORTHLINE_PRODUCTION_CUTOVER`.
   The importer refuses to
   merge into a non-empty database and runs schema creation, data copy, index
   creation, sequence reset, and additive compatibility changes in one
   transaction.
4. Deploy the application with `NORTHLINE_DB_DRIVER=postgres` and the existing
   Authentik/Discord variables. Health must be green before the DNS/origin
   switch. Test login, a private board, a shared board, a task mutation, a
   reminder, a time entry, and a calendar read.
5. Switch the public origin only after those smoke tests pass. Keep the old
   deployment and final SQLite snapshot for the documented rollback window.
6. If any check fails, return traffic to the old deployment and restore from
   the final snapshot. Do not attempt an in-place PostgreSQL downgrade.
