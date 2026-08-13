# Beta validation status

Beta v0.8.0 continues controlled production validation with a small team. This document distinguishes verified release evidence from work that requires an interactive browser or deliberate failure simulation.

## Verified for Beta v0.8.0

- Production containers report healthy operation for Northline, Authentik, its database and worker, and the mail server.
- The public Northline route responds successfully through the configured edge tunnel.
- SQLite quick-check passes, foreign-key validation has no findings, and all recorded migrations are applied.
- Authentik office identities, Northline access groups, optional Discord source connections, profile images, and targeted Discord IDs are present for the initial team.
- Incomplete Discord source mappings are reconciled into Authentik during Northline directory synchronization and first sign-in.
- Board owners and editors can change task status by dragging List-view rows between workflow categories; viewers remain read-only.
- Each browser synchronizes its IANA time zone to the signed-in account; shared instants remain UTC and personal reporting boundaries plus due warnings use the relevant user's zone.
- Direct board shares remain discoverable through a virtual Shared with me workspace without granting visibility into the owner's private workspace.
- Board-wide reminders create independent private deliveries for all active board members, and shared-task discussions are accessible directly from Kanban cards.
- Streaming schedule discovery is limited to authenticated active users and eligible team/public-ready entries; private calendars and private event details remain excluded.
- Collaboration requests use opaque identifiers, accepted events are written to each participant's selected calendar, and private Discord notifications use the existing Task Buddy identity link.
- Northline-only local backups are encrypted, verified, and retained for the latest four generations.
- The latest recorded non-destructive restore drill completed successfully.
- VM storage has safe operating headroom after unused container-build artifacts were removed.
- Lint, production build, architecture/authorization tests, larger-data performance tests, secret scanning, and full dependency audit pass.

## Active interactive validation

- Complete Admin, Member, owner, editor, viewer, suspended-user, and expired-session browser journeys.
- Complete private-calendar owner, editor, viewer, reminder, activity, deletion, and recovery journeys across desktop and mobile layouts.
- Complete streaming-calendar visibility, availability, request, counterproposal, acceptance, and Discord failure journeys across desktop and mobile layouts.
- Exercise complete board/task/comment/search/activity/reminder workflows, including controlled failure and retry.
- Validate keyboard-only operation, focus containment, screen-reader semantics, contrast, 200% zoom, and responsive layouts.
- Confirm offline, expired-session, stale-form, unavailable-Discord, refresh, back-navigation, and inaccessible deep-link behavior.

Failures found during Beta should be filed without private infrastructure details and linked from the acceptance record.
