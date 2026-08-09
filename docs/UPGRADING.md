# Upgrading and rollback

## Upgrade policy

Alpha v0.8.0 introduces recorded, forward-only schema migrations. Northline applies additive schema changes when the container starts and records each completed version in `schema_migrations`. The admin Health page displays the active schema version. Application containers must never be downgraded against a database that has already moved to a newer schema.

## Before upgrading

1. Review `CHANGELOG.md` and the target tag.
2. Confirm Administration Health shows a recent backup with NAS replication.
3. Run the non-destructive restore test.
4. Record the currently deployed Git commit and image ID in the private runbook.
5. Pull the target release and run the release checklist.

## Rollback

Code-only rollback is safe only when the database schema version is supported by the older release. Otherwise stop Northline, preserve the failed-upgrade database for investigation, restore the encrypted pre-upgrade SQLite snapshot, and deploy the matching earlier tag. Authentik and mail should only be restored when the incident affected those services; do not overwrite healthy identity or mail data during an application-only rollback.

## Clean-install verification

`ops/release/verify-clean-install.sh` builds the current image, starts it with an empty disposable volume, waits for readiness, verifies SQLite integrity and the latest schema version, then removes every temporary resource. CI runs this script for every push and pull request.
