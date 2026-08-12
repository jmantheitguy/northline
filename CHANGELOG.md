# Northline release history

## Beta v0.2.0 — Personal and shared workspaces

- Give every member an automatic personal workspace whose boards remain private unless individually shared.
- Add user-created shared workspaces with owner-managed viewer/editor membership inherited by every board in the workspace.
- Turn the sidebar workspace control into a real switcher with shared-workspace creation and membership management.
- Allow authorized members to create boards inside a workspace and board owners to move boards between workspaces they can edit.
- Extend board discovery, task assignment, search, reminders, and server-side authorization to enforce workspace inheritance.
- Add version-only Task Buddy release announcements using a GitHub-style push embed in the configured Discord updates channel.

## Beta v0.1.1 — Consistent task actions

- Normalize the task action buttons to Northline's interface font, size, weight, and letter spacing.
- Keep destructive, secondary, Discord, and primary actions visually distinct without inconsistent typography.

## Beta v0.1.0 — Custom board workflows

- Replace the fixed five-column workflow with persistent, board-specific columns across Kanban, list, timeline, calendar, task editing, filters, progress, and reminders.
- Let board owners and editors add, rename, recolor, reorder, and remove columns from a dedicated workflow manager.
- Require a destination column when removing a populated workflow stage so tasks are moved safely instead of deleted or orphaned.
- Preserve server-side board permissions on every column operation and validate task status against the board's own workflow.
- Repair the task action layout so Delete, Duplicate, Remind me, and Save task remain readable at desktop and mobile widths.

## Beta v0.0.4 — Private board isolation

- Remove the implicit site-administrator bypass from board discovery, deep links, search, reminders, editing, sharing, and deletion.
- Keep site administration focused on workspace operations and account management; administrators must be explicitly invited to collaborate on another member's board.
- Limit task assignee choices to the board owner and active members who have been granted access.
- Add automated regression coverage for administrator isolation and server-filtered assignee lists.

## Beta v0.0.3 — Private Task Buddy delivery

- Route automatic task activity and task-specific reminders to the Discord account linked by the task creator.
- Route board-wide manual reminders to the linked Discord account of the member who schedules them.
- Remove Discord channel selection from board notification settings and reminder creation while preserving historical delivery metadata.
- Fail reminders visibly when the intended recipient has not linked Discord, and move administrator delivery tests to private messages.
- Retain clickable Northline task links, suppress Discord embeds, and disable arbitrary mention parsing in every private delivery.

## Beta v0.0.2 — Streaming calendar product plan

- Publish a detailed future plan for private multi-calendar scheduling designed around streamer workflows.
- Define opt-in public schedules, collaboration proposals, event invitations, attendance responses, privacy boundaries, moderation, and Task Buddy integration.
- Establish a phased delivery path from private calendars through selective sharing, public schedules, collaboration discovery, workflow automation, and external interoperability.

## Beta v0.0.1 — Initial team validation release

- Begin the Beta release line with private permissioned boards, task workflows, Authentik office identities, optional Discord profile linking, Task Buddy notifications, administration, health reporting, and operational recovery tooling.
- Establish passing automated gates for builds, authorization structure, database integrity, performance, clean installation, secrets, and dependency vulnerabilities.
- Validate the production database schema and foreign keys, Authentik/Discord linkage, container health, public Cloudflare route, encrypted NAS replication, and non-destructive restore reporting.
- Reclaim accumulated container-build cache and restore safe VM storage headroom without removing active service images or data volumes.
- Track browser role journeys, keyboard and screen-reader operation, responsive presentation, and failure recovery as explicit Beta acceptance work.

## Alpha v0.8.5 — Reliable Discord profile synchronization

- Discover linked Discord IDs from Authentik source-connection records when custom mapped attributes are missing.
- Resolve linked members through Task Buddy to synchronize their current Discord avatar and stable mention ID.
- Preserve Authentik's native profile fallback when Discord is unlinked or unavailable.

## Alpha v0.8.4 — Directory-bound OIDC subject rotation

- Allow Authentik to rotate a pairwise OIDC subject only when the office email already belongs to a user bound to a verified Authentik directory UUID.
- Continue rejecting subject changes for local or otherwise unbound accounts, and reject cross-account subject/email collisions.
- Restore sign-in after an administrator corrects a linked member's canonical Authentik username.

## Alpha v0.8.3 — Separated office and Discord identities

- Keep Authentik directory UUIDs, OIDC login subjects, and Discord user IDs in separate fields so a linked social profile cannot replace or duplicate an office account.
- Make Discord a link-only profile source: it no longer appears as an Authentik sign-in option and continues to provide avatars and stable Discord IDs.
- Add narrowly scoped Task Buddy mentions for the intended reminder recipient while keeping arbitrary, everyone, and role mentions disabled.
- Repair canonical office-account matching and preserve sessions, board ownership, memberships, and related activity when consolidating duplicate linked identities.

## Alpha v0.8.2 — Linked-identity sign-in reliability

- Resolve returning Authentik users by their stable OIDC subject before comparing email addresses.
- Normalize email fallback matching and safely handle linked Discord identities whose profile email formatting differs from the existing Northline record.
- Redirect identity collisions to a controlled sign-in error instead of returning an HTTP 500 response.

## Alpha v0.8.1 — Development dependency hardening

- Removed an unused Cloudflare/Vite prototype toolchain from the Northline application package.
- Updated the remaining development dependency tree and expanded the release audit to reject development-time vulnerabilities as well as production vulnerabilities.
- Reduced the application dependency footprint without changing the deployed feature set or database schema.

## Alpha v0.8.0 — Beta security and reliability foundation

- Added explicit same-origin protection for every state-changing API request.
- Added sign-in and administrative mutation throttling with retry guidance.
- Added active-session inventory, individual revocation, and revoke-all-other-sessions controls.
- Added recorded schema migrations and schema version reporting in Administration Health.
- Added backup and restore-test failure reports plus Docker health checks.
- Added clean-install verification, larger-data performance testing, an authorization matrix, secret scanning, CI, and Dependabot.
- Added forward-upgrade and backup-based rollback documentation.
- Deferred calendar development until after Beta and identified browser-based accessibility/visual acceptance as the remaining external gate.

## Alpha v0.7.2 — Public documentation refresh

- Added comprehensive feature, architecture, operations, onboarding, security, backup, identity, mail, and release documentation.
- Updated the roadmap to distinguish completed Alpha capabilities from the private multi-calendar and Beta milestones.
- Replaced production network values in public examples with safe placeholders.
- Documented the boundary between public implementation guidance and the private infrastructure runbook.

## Alpha v0.7.1 — Complete dark mode

- Added a persistent, system-aware light/dark preference.
- Covered sign-in, boards, all task views, reminders, settings, administration, health, search, loading states, and modals.
- Added an accessible appearance toggle and regression coverage.

## Alpha v0.7.0 — Operations and workflow readiness

- Added the admin health dashboard, live Task Buddy test, NAS backup status, and restore-test status.
- Added permission-aware global search, board activity, task duplication, and starter board templates.
- Preserved notification delivery history after task/board deletion.
- Added security response headers, onboarding documentation, and expanded architecture tests.

## Alpha v0.6.x — Task Buddy notifications

- Added board-level automatic assignment, status, comment, mention, and due notifications.
- Added per-user preferences, reminder center management, direct task links, delivery retry/history, and Discord embed suppression.
- Replaced sequential board references with opaque random IDs while retaining server authorization.

## Alpha v0.5.x — Identity, mail, and operational foundation

- Integrated Authentik OIDC, group-based authorization, directory synchronization, profiles, and Discord account linking.
- Deployed independent VTuber Offices mail with Stalwart, webmail, Cloudflare inbound routing, and Brevo outbound relay.
- Added encrypted complete-stack backups, Synology replication, and non-destructive restore validation.

## Earlier alpha milestones

- Established Northline branding and renamed the original project.
- Added private/shared boards, tasks, comments, filtering, multiple views, administration, audit history, local authentication, and Docker deployment.
