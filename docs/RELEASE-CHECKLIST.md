# Northline release checklist

## Before release

- Run `npm run lint`, `npm test`, and the production dependency audit.
- Run `npm run security:scan` and the disposable clean-install verifier.
- Update `README.md`, `CHANGELOG.md`, `ROADMAP.md`, `SECURITY.md`, and any affected operational guide.
- Confirm the admin Health page reports a healthy database and sufficient VM storage.
- Send a Task Buddy health-check message from the Health page.
- Confirm the latest encrypted backup has verified off-host replication (S3 or
  another explicitly configured destination).
- Run the non-destructive restore test and confirm it appears on the Health page.
- Test an Admin, Member, and shared-board user to verify authorization boundaries.
- Verify Authentik sign-in, account suspension, recovery, Discord linking, and profile pictures.

## After deployment

- Confirm `ops/release/deploy-production.sh` reported both a healthy deployment and a successful Task Buddy release announcement in every configured Discord channel. A retry of the same commit must not post a duplicate in any destination.
- Verify the public Northline sign-in page through its configured public route.
- Create, duplicate, update, and delete a test task.
- Search for that task from another board and inspect the board activity feed.
- Schedule one reminder, verify delivery, and confirm its history remains visible.
- Record the release tag and deployment commit in the change log.
- Verify both light and dark themes on sign-in, a board, a modal, reminders, and Administration.
- During Beta, record the completed browser, keyboard, screen-reader, and responsive journeys from `docs/BETA-ACCEPTANCE.md`; complete the full matrix before a stable release.
