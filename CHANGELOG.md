# Northline release history

## Beta v0.8.3 — Collab inbox presentation fix

- Replace the wrapping post-acceptance action with a concise “Reschedule collab” button and descriptive hover text.
- Widen the desktop collaboration inbox while preserving its single-column responsive layout on smaller screens.
- Keep the reschedule action full-width, vertically aligned, and single-line wherever the available viewport permits.

## Beta v0.8.2 — Collaboration rescheduling

- Let organizers and accepted participants propose a replacement time after a collaboration has been confirmed.
- Route participant proposals privately to the organizer and organizer proposals privately to accepted participants through Task Buddy.
- Track every required approval independently and update all accepted calendar copies atomically only after unanimous approval.
- Allow any required participant to decline the proposed time without cancelling the existing confirmed collaboration.
- Collapse organizer and participant calendar copies into one row in the combined team schedule while retaining both private records.
- Display the confirmed participant roster on the combined schedule and correct the outgoing request summary.
- Add schema migration 21 for reschedule proposals and approval responses.

## Beta v0.8.1 — Multi-streamer collaboration requests

- Let organizers invite up to 20 active Northline streamers with one collaboration request.
- Track each participant's acceptance, decline, counterproposal, response, and destination calendar independently.
- Display the complete invitee roster and response state to organizers and invitees.
- Add confirmed events only for participants who accept, while creating the organizer event once and never widening calendar membership.
- Protect the shared group time from counterproposal changes after any participant has accepted.
- Fan out private Task Buddy invitations and group-time updates to the affected participants.
- Migrate existing one-to-one requests into the new participant table with schema migration 20.

## Beta v0.8.0 — Stream schedules and collaboration planning

- Add streaming-calendar purpose and private, team, or public-ready visibility without changing the private default.
- Add stream, availability, and collab event types with platform, category, destination link, request eligibility, and busy-only redaction.
- Add an authenticated combined team schedule rendered in each viewer's local time zone.
- Add opaque collaboration requests with proposed times, private messages, accept, decline, counterproposal, cancellation, and incoming/outgoing tracking.
- Create confirmed events independently on both participants' selected calendars when a request is accepted, without sharing either whole calendar.
- Add private Task Buddy Discord notifications for collaboration invitations and responses.
- Record schema migration 19 and extend public architecture, feature, roadmap, and Beta validation documentation.

## Beta v0.7.5 — Team reminders and task discussions

- Fan out board-wide reminders as private Task Buddy deliveries to every active member with access through ownership, direct board sharing, or shared-workspace membership.
- Track each board-wide recipient independently so successful deliveries continue when another member has not linked Discord, with failures remaining visible for retry or review.
- Limit Reminder Center visibility to reminders created by or addressed to the current member while preserving scheduler management of the fan-out records.
- Add a dedicated discussion button to Kanban cards so collaborators can read and post comments without opening the complete task editor.
- Permit viewers, editors, and owners with board access to participate in task discussion while retaining the existing server-side board permission check.
- Add a focused discussion panel with avatars, localized timestamps, an empty state, and a 5,000-character server-enforced comment limit.

## Beta v0.7.4 — Per-user time zones

- Detect each signed-in member's IANA time zone from their browser and persist it to their Northline account.
- Keep shared instants in UTC while displaying them according to the current viewer's device time zone across boards, calendars, reminders, time cards, audits, sessions, and administration.
- Interpret personal and administrative time-report date filters using the viewer's local midnight boundaries, including daylight-saving transitions.
- Schedule task due-date warnings relative to 5:00 PM in the task creator's time zone instead of the Linux VM's clock, and recalculate pending warnings when that zone changes.
- Preserve task due dates as date-only values so collaborators in other zones never see them shift to an adjacent day.
- Correct calendar activity and recovery timestamps created by SQLite so browsers consistently interpret them as UTC before local display.
- Add a permission-safe virtual Shared with me workspace so direct board shares remain visible even when the board belongs to another member's private workspace.

## Beta v0.7.3 — List-view task movement

- Make editable task rows draggable in List view.
- Let owners and editors drop a task onto any workflow category to change its status through the existing permission-checked task API.
- Highlight the active destination category and visually distinguish the row being moved in light and dark themes.
- Keep drag controls unavailable to viewers while preserving click-to-open behavior for every permission level.

## Beta v0.7.2 — Discord profile synchronization

- Preserve Discord usernames, display names, IDs, and avatar URLs in Authentik when a member links Discord.
- Reconcile incomplete Discord source connections during Northline directory synchronization without replacing unrelated Authentik attributes.
- Run identity reconciliation after the member's first Northline sign-in so the supported Authentik → Discord link → Northline onboarding sequence repairs missed source mappings automatically.
- Continue using Authentik as the authoritative sign-in identity while Discord remains optional and limited to profile pictures and private Task Buddy delivery.

## Beta v0.7.1 — Calendar stabilization

- Correct My Work summary cards so destructive-button styling cannot collapse the Overdue metric or distort the four-column layout.
- Correct Administration audit rows so action badges remain compact and timestamps remain aligned and responsive.
- Add a detailed day view alongside month, week, and agenda calendar navigation.
- Add owner-visible calendar activity history for event, settings, and sharing changes.
- Let members schedule private Task Buddy reminders from calendar events to their linked Discord accounts.
- Replace immediate calendar and event destruction with a 30-day Recently deleted recovery workflow and automatic expiry.
- Protect calendar and event forms from accidental dismissal when they contain unsaved changes.
- Improve calendar navigation, activity, recovery, and reminder controls for smaller screens.
- Expand authorization tests for calendar reminders, recovery, activity privacy, and opaque identifiers.

## Beta v0.7.0 — Private calendars

- Add multiple private, named, color-coded calendars for every Northline member.
- Add responsive month, week, and agenda views with one-time timed or all-day events, locations, descriptions, and confirmation states.
- Store event instants in UTC while retaining each event and calendar's validated IANA time-zone identity.
- Let calendar owners explicitly share one calendar with an active member as a viewer or editor, then revoke that access independently.
- Keep calendar settings, sharing, and deletion owner-only; editors can manage events while viewers remain read-only.
- Use opaque random calendar and event identifiers at browser and API boundaries and return not-found responses for inaccessible calendars.
- Record calendar, event, and membership activity while preserving private details from administrators who have not been granted calendar access.
- Include the new calendar schema in Northline's existing database backup and restore coverage.

## Beta v0.6.2 — Descriptive audit and live Linux health

- Replace raw audit action codes and numeric targets with readable descriptions, actors, affected objects, timestamps, and retained diagnostic codes.
- Respect private-board access when resolving task and board names in the administration audit feed.
- Record descriptive details for new task creation, updates, deletion, archive/restore, and account role or status changes.
- Add live Linux CPU, load average, memory, swap, disk, uptime, architecture, kernel, and Node process statistics.
- Refresh Health automatically every five seconds while its tab is open, with a user-controlled live-updates switch and the existing manual refresh button.

## Beta v0.6.1 — Administration dashboard

- Make a live operations overview the default Administration landing page.
- Surface application, database, Task Buddy, local backup, restore-test, and VM-storage status together.
- Add organization counts, failed-reminder attention, and a live list of currently clocked-in members.
- Provide direct dashboard navigation into users, board access, time reporting, health, audit history, and security controls.
- Replace light-only administration surfaces with theme-aware panels, borders, text, tables, cards, and responsive layouts.

## Beta v0.6.0 — Time reporting and task timers

- Start a board- and task-linked timer directly from an open task while preserving the single-active-timer rule.
- Warn users when a timer has run for more than 12 hours without automatically altering recorded time.
- Filter personal time cards by date, board, and task and export the resulting report as CSV.
- Recover a deleted time entry for 30 days while preserving deletion and restoration events in the audit history.
- Give administrators filterable organization reporting, CSV export, current timer visibility, and a readable time-entry audit history.
- Publish a concrete Beta v0.7.0 plan for private multi-calendar scheduling, selective sharing, public stream schedules, and collaboration invitations.

## Beta v0.5.2 — Audited time-entry deletion

- Let users delete their own completed time entries after explicit confirmation.
- Soft-delete entries so they leave personal totals and administrator reports without destroying the retained audit trail.
- Require active timers to be stopped before their entries can be deleted.

## Beta v0.5.1 — Familiar manual time controls

- Replace native manual time-entry spinners with explicit date, 1–12 hour, minute, and AM/PM controls.
- Default new manual entries to a one-hour local-time window while preserving exact existing times during corrections.

## Beta v0.5.0 — Persistent time cards

- Add a floating clock control that expands into Time In and Time Out actions and persists active timers through reloads and browser sessions.
- Allow users to associate a timer with an accessible board and task, add a work note, and see the live elapsed duration.
- Add a private My Time page with daily and weekly totals, entry history, manual time entry, and audited corrections.
- Enforce one active timer per user, prevent overlapping entries, calculate durations on the server, and store timestamps in UTC.
- Add an administrator Time panel with organization-wide totals, active timer visibility, and recent time-entry detail.

## Beta v0.4.1 — Grouped workflow list

- Redesign List view as collapsible, color-coded workflow sections with consistent table columns.
- Show task titles, comment counts, assignee avatars, status, due date, and priority at a glance.
- Add permission-aware task creation rows to each expanded section and responsive horizontal scrolling for smaller screens.

## Beta v0.4.0 — Safer editing, reminders, and task archiving

- Protect unfinished task, board, workspace, and reminder forms from accidental backdrop dismissal and confirm before discarding changed values.
- Replace ambiguous reminder time spinners with explicit 1–12 hour, minute, and AM/PM controls for both creation and editing.
- Hide completed tasks by default with a per-board Show completed control.
- Allow editors to archive completed tasks without deleting comments or history, browse the board archive, and restore tasks later.
- Exclude archived tasks from board counts, global search, and My Work while retaining their relational data.

## Beta v0.3.1 — Streamlined task actions

- Remove decorative icons from the Duplicate and Remind me task buttons while preserving their behavior and visual hierarchy.

## Beta v0.3.0 — My Work across boards

- Add a personal My Work dashboard that gathers tasks assigned to the signed-in user from every board and workspace they can access.
- Group assigned work into overdue, due soon, later, unscheduled, and completed sections with at-a-glance totals.
- Add workspace, board, priority, status, and text filtering without exposing inaccessible task or board data.
- Allow owners and editors to update task status, priority, and due date from My Work while keeping viewer assignments read-only.
- Open any assigned task in its source board using the existing opaque board URL and permission checks.

## Beta v0.2.1 — Deployment-aware release announcements

- Add a production deployment workflow that announces the deployed version through Task Buddy only after the replacement container becomes healthy.
- Add commit-based duplicate protection so retrying a deployment cannot repeat the Discord release message.
- Keep routine commits and worker activity silent; notifications occur only when an operator runs the production deployment workflow.

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
