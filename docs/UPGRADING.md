# Upgrading and rollback

## Upgrade policy

Alpha v0.8.0 introduces recorded, forward-only schema migrations. Northline applies additive schema changes when the container starts and records each completed version in `schema_migrations`. The admin Health page displays the active schema version. Application containers must never be downgraded against a database that has already moved to a newer schema.

The core workflow migration (schema version 24) is additive. On first start it
creates `task_assignees` and backfills each existing legacy `tasks.assignee_id`
value, then adds pause metadata to `time_entries`. Existing assignments and
time cards remain usable; no task or time-entry rows are deleted. Take the
normal verified backup before starting the new container and let the first
healthy start complete before rolling traffic forward.

## Before upgrading

1. Review `CHANGELOG.md` and the target tag.
2. Confirm Administration Health shows a recent backup with verified off-host
   replication.
3. Run the non-destructive restore test.
4. Record the currently deployed Git commit and image ID in the private runbook.
5. Pull the target release and run the release checklist.

## Rollback

Code-only rollback is safe only when the database schema version is supported by the older release. Otherwise stop Northline, preserve the failed-upgrade database for investigation, restore the encrypted pre-upgrade SQLite snapshot, and deploy the matching earlier tag. Authentik and mail should only be restored when the incident affected those services; do not overwrite healthy identity or mail data during an application-only rollback.

## Clean-install verification

`ops/release/verify-clean-install.sh` builds the current image, starts it with an empty disposable volume, waits for readiness, verifies SQLite integrity and the latest schema version, then removes every temporary resource. CI runs this script for every push and pull request.

## Railway migration foundation

The Railway migration is intentionally separate from the normal SQLite upgrade
path. `scripts/migrate-sqlite-to-postgres.mjs` can inspect the current SQLite
schema and produce a row-count plan without opening a network connection. The
guarded copy mode only targets an explicitly labeled staging database; it will
not merge into a non-empty PostgreSQL database. See
`docs/RAILWAY-MIGRATION.md` for the staged migration and rollback plan.
