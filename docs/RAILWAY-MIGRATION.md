# Railway migration plan

Northline is a production application with real users. This document describes
the staged path from the current SQLite/Docker deployment to Railway. It does
not authorize a production cutover, and it intentionally contains no provider
credentials, private hostnames, or account identifiers.

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

## Why this is staged

PostgreSQL is not a drop-in environment-variable change. Northline now has a
connection-aware asynchronous PostgreSQL driver behind `lib/db.ts`, while
SQLite remains the default for local development. The PostgreSQL path translates
the small set of legacy SQLite date/conflict expressions, preserves the
case-insensitive email identity rule, and uses a transaction-scoped connection
pool. The existing authorization and feature tests run against the shared
database boundary so a backend switch does not weaken board, workspace, time,
calendar, or administration permissions.

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
   retaining SQLite for the first local comparison tests.
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

## Current staging status

- A separate Railway staging project and private PostgreSQL instance are
  provisioned with persistent storage. No public database domain is enabled.
- The staging Northline service is deployed from the isolated
  `codex/railway-staging` branch at the staging health-check commit, with the
  root Dockerfile, a `/health` check, restart-on-failure protection, and a
  persistent application volume mounted at `/app/data`.
- The staging web service has a Railway-generated HTTPS hostname for browser
  smoke tests. It is separate from the production origin and is not wired to
  production DNS, Authentik, or Discord callbacks.
- A consistent production SQLite snapshot has been captured outside the
  repository and validated by the read-only migration planner. It has not been
  uploaded or copied into Railway.
- No production data has been copied to Railway. The staging service currently
  uses its own SQLite data volume; the provisioned PostgreSQL service is ready
  for the rehearsed import but is not yet the application's runtime database.
- The Northline query layer is now PostgreSQL-capable behind the opt-in
  `NORTHLINE_DB_DRIVER=postgres` switch. SQLite remains the default until the
  staging import and smoke tests pass.
- No DNS, Authentik, Discord, backup, or production deployment changes have
  been made by this migration foundation.

## Authorized cutover runbook

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
