# Northline feature reference

## Boards and tasks

Boards are private to their creator until shared. Every board has an opaque random public ID, while ownership remains a relational server-side permission. Each board owns an ordered workflow whose columns can be added, renamed, recolored, moved, marked as completed, or removed by an owner or editor. Removing a column requires choosing a destination for its tasks. Northline supports Kanban, list, timeline, and calendar-oriented views; drag-and-drop status movement in both Kanban and List views; priorities; categories; due dates; assignees; descriptions; comments; filtering; sorting; duplication; progress reporting; board activity; and blank, content-pipeline, or launch-plan templates.

Completed tasks are hidden by default but can be shown per board. Editors can archive completed work without deleting its comments or activity history, inspect the board archive, and restore an archived task later.

My Work gives each member a private cross-board view of tasks assigned to them. Results are limited to boards the member can currently access and are grouped by urgency. Members can filter by workspace, board, priority, status, or text; owners and editors can update status, priority, and due date without leaving the view, while viewer assignments remain read-only.

## Workspaces

Every account receives one personal workspace. Its boards are private by default and can still be shared individually. Members can also create shared workspaces, invite viewers or editors, switch between workspaces from the sidebar, and create or move boards within workspaces they can edit. Shared-workspace membership automatically grants the corresponding access to every contained board; removing a member removes that inherited access without altering explicit board shares elsewhere.

Global search returns tasks only from boards the signed-in user can access. Direct task links contain the opaque board ID and task ID, but the server still checks authorization.

Directly shared boards from another member's private workspace appear in a virtual **Shared with me** workspace. This navigation group exposes only boards explicitly shared with the current member and never reveals the owner's other private boards.

## Private calendars

Each member can maintain multiple private calendars with independent names, colors, descriptions, and IANA time zones. Calendar navigation includes month, week, day, and agenda views. Events may be timed or all-day and include a title, description, location or link, time zone, and tentative, confirmed, or cancelled state. Times are stored as UTC instants and displayed in the viewer's local browser time.

Calendars are private by default. The owner may share a specific calendar with an active Northline member as a viewer or editor and may revoke access at any time. Viewers cannot change events. Editors can create, update, and delete events but cannot rename, share, or delete the calendar. Administrators have no implicit private-calendar access. Calendar and event URLs use opaque random identifiers, while all authorization remains server-enforced. Settings, sharing, and event changes are retained in calendar activity and the permission-aware audit system. Owners can review activity and recover deleted calendars or events for 30 days. Members with calendar access can schedule a private Task Buddy reminder to their own linked Discord account without changing calendar authorization.

## Stream schedules and collaboration planning

A member may explicitly designate a calendar as a streaming schedule and choose private, Northline-team, or public-ready visibility. The combined Collab planner is authenticated and includes only events whose calendar and entry visibility allow team discovery. A busy-only entry hides its title, description, platform, game, link, and collaboration control from other users. “Public-ready” prepares the data policy but does not create an anonymous public endpoint in Beta v0.8.0.

Streaming entries can record a platform, game or category, stream link, and whether teammates may request a collaboration. Members can also publish availability windows. Collaboration requests contain an opaque ID, proposed UTC interval, organizer time zone, title, and private message. The invited streamer may accept, decline, or propose another time; the requester may cancel an open request. Acceptance creates separate confirmed collab events in each participant's selected editable calendar, avoiding any automatic grant to the rest of either calendar. Task Buddy privately notifies linked Discord accounts about request changes, while Northline and Authentik identities remain authoritative for authorization.

## Collaboration and identity

Users sign in locally or through Authentik OIDC using their office identity. Authentik groups grant Northline User or Northline Admin access, and the directory sync imports profiles while revoking sessions for removed accounts. Board owners can share viewer or editor access through the searchable user directory. Site administrators do not receive implicit access to private board content and must be shared onto a board like any other collaborator. Task assignment is limited to the owner and active shared members. Discord is an optional linked profile source—not a sign-in method—and supplies only the Discord ID/avatar used for profile pictures and private Task Buddy delivery.

## Task Buddy

Each board can enable assignment, status, comment, mention, and due-date notifications, and users can manage their personal notification preferences. Task Buddy privately DMs automatic events and task-specific reminders to the member who created the task. Board-wide manual reminders create an independent private delivery for every active member with board access. Scheduled reminders support editing, cancellation, failure display, and retry. Delivery fails visibly per recipient when that person has not linked Discord without blocking other members. Messages include a direct clickable task link while suppressing Discord preview embeds, and delivery snapshots preserve history after the original task or board is deleted.

Every task has a permission-aware discussion thread. Owners, editors, and viewers who can access the board can read and post comments. Kanban cards provide a direct discussion control so collaborators do not need to open the full task editor merely to participate in the conversation.

## Administration and operations

Admins can create and manage accounts, review roles/status, inspect board ownership and access, search audit records, configure workspace policies, synchronize Authentik, and open a health dashboard. Health reports application uptime and memory, Node version, SQLite integrity and size, VM capacity, active sessions, Task Buddy connectivity/channels, reminder outcomes, NAS backup status, and restore-test status. A health action sends a real Task Buddy test message.

## Time tracking and reporting

Each member has one persistent timer that can be started from the floating clock or directly from a task. Timers may be associated with an accessible board and task, survive page reloads, and warn after 12 hours without silently changing the recorded session. My Time supports manual entries, audited corrections, soft deletion and 30-day recovery, daily/weekly totals, report filters, and CSV export. Administrators can review active timers, organization totals, filtered entries, CSV exports, and time-entry audit actions; they cannot operate another member's timer.

Each account records the IANA time zone detected from its current browser. Shared timestamps are stored as UTC instants and rendered locally for the viewer, while date-only task deadlines remain stable across locations. Time-report filters use local calendar-day boundaries and Task Buddy calculates due warnings in the task creator's zone.

## Time cards

Every user has a persistent personal time clock available from the floating clock control and a My Time page. Timers continue on the server through reloads, can be associated with accessible boards and tasks, and are limited to one active timer per user. Users can add manual entries, correct completed entries with a required audit reason, and remove completed entries with confirmation. Removal is an audited soft deletion: the entry leaves normal totals and reports while its audit history remains available. Northline prevents overlapping entries and calculates durations server-side. Administrators can review time totals and entry history for all active users from the Administration Time panel.

## Experience

Northline has responsive desktop/mobile layouts, structured empty/loading/error states, and persistent light/dark themes. The initial appearance follows the operating-system preference; a browser-local preference takes precedence after the user changes it.

## Security and account controls

Northline rejects state-changing browser requests from foreign origins, throttles repeated sign-in attempts and administrative mutations, stores only session-token digests, and lets each user inspect and revoke their own active sessions. The Health dashboard reports the current recorded schema migration. Automated release gates cover authorization structure, performance at a 10,000-task test scale, a disposable clean installation, production dependency vulnerabilities, and accidental private-value disclosure.
