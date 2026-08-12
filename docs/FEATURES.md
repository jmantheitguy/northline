# Northline feature reference

## Boards and tasks

Boards are private to their creator until shared. Every board has an opaque random public ID, while ownership remains a relational server-side permission. Each board owns an ordered workflow whose columns can be added, renamed, recolored, moved, marked as completed, or removed by an owner or editor. Removing a column requires choosing a destination for its tasks. Northline supports Kanban, list, timeline, and calendar-oriented views; drag-and-drop movement; priorities; categories; due dates; assignees; descriptions; comments; filtering; sorting; duplication; progress reporting; board activity; and blank, content-pipeline, or launch-plan templates.

My Work gives each member a private cross-board view of tasks assigned to them. Results are limited to boards the member can currently access and are grouped by urgency. Members can filter by workspace, board, priority, status, or text; owners and editors can update status, priority, and due date without leaving the view, while viewer assignments remain read-only.

## Workspaces

Every account receives one personal workspace. Its boards are private by default and can still be shared individually. Members can also create shared workspaces, invite viewers or editors, switch between workspaces from the sidebar, and create or move boards within workspaces they can edit. Shared-workspace membership automatically grants the corresponding access to every contained board; removing a member removes that inherited access without altering explicit board shares elsewhere.

Global search returns tasks only from boards the signed-in user can access. Direct task links contain the opaque board ID and task ID, but the server still checks authorization.

## Collaboration and identity

Users sign in locally or through Authentik OIDC using their office identity. Authentik groups grant Northline User or Northline Admin access, and the directory sync imports profiles while revoking sessions for removed accounts. Board owners can share viewer or editor access through the searchable user directory. Site administrators do not receive implicit access to private board content and must be shared onto a board like any other collaborator. Task assignment is limited to the owner and active shared members. Discord is an optional linked profile source—not a sign-in method—and supplies only the Discord ID/avatar used for profile pictures and private Task Buddy delivery.

## Task Buddy

Each board can enable assignment, status, comment, mention, and due-date notifications, and users can manage their personal notification preferences. Task Buddy privately DMs automatic events and task-specific reminders to the member who created the task; board-wide manual reminders go to the member who schedules them. Scheduled reminders support editing, cancellation, failure display, and retry. Delivery fails visibly when the intended recipient has not linked Discord. Messages include a direct clickable task link while suppressing Discord preview embeds, and delivery snapshots preserve history after the original task or board is deleted.

## Administration and operations

Admins can create and manage accounts, review roles/status, inspect board ownership and access, search audit records, configure workspace policies, synchronize Authentik, and open a health dashboard. Health reports application uptime and memory, Node version, SQLite integrity and size, VM capacity, active sessions, Task Buddy connectivity/channels, reminder outcomes, NAS backup status, and restore-test status. A health action sends a real Task Buddy test message.

## Experience

Northline has responsive desktop/mobile layouts, structured empty/loading/error states, and persistent light/dark themes. The initial appearance follows the operating-system preference; a browser-local preference takes precedence after the user changes it.

## Security and account controls

Northline rejects state-changing browser requests from foreign origins, throttles repeated sign-in attempts and administrative mutations, stores only session-token digests, and lets each user inspect and revoke their own active sessions. The Health dashboard reports the current recorded schema migration. Automated release gates cover authorization structure, performance at a 10,000-task test scale, a disposable clean installation, production dependency vulnerabilities, and accidental private-value disclosure.
