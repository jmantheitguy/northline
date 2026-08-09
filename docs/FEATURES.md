# Northline feature reference

## Boards and tasks

Boards are private to their creator until shared. Every board has an opaque random public ID, while ownership remains a relational server-side permission. Northline supports Kanban, list, timeline, and calendar-oriented views; Ideas, Ready, In Progress, On Hold, and Done states; drag-and-drop movement; priorities; categories; due dates; assignees; descriptions; comments; filtering; sorting; duplication; progress reporting; board activity; and blank, content-pipeline, or launch-plan templates.

Global search returns tasks only from boards the signed-in user can access. Direct task links contain the opaque board ID and task ID, but the server still checks authorization.

## Collaboration and identity

Users sign in locally or through Authentik OIDC using their office identity. Authentik groups grant Northline User or Northline Admin access, and the directory sync imports profiles while revoking sessions for removed accounts. Board owners can share viewer or editor access through the searchable user directory. Discord is an optional linked profile source—not a sign-in method—and supplies only the Discord ID/avatar used for profile pictures and targeted Task Buddy reminder mentions.

## Task Buddy

Each board can select a Discord text channel and enable assignment, status, comment, mention, and due-date notifications. Users can manage personal notification preferences. Scheduled board/task reminders support editing, cancellation, failure display, and retry. When a recipient has linked Discord, Task Buddy explicitly mentions only that recipient; arbitrary and role mentions remain disabled. Delivery messages include a direct clickable task link while suppressing Discord preview embeds. Delivery snapshots preserve history after the original task or board is deleted.

## Administration and operations

Admins can create and manage accounts, review roles/status, inspect board ownership and access, search audit records, configure workspace policies, synchronize Authentik, and open a health dashboard. Health reports application uptime and memory, Node version, SQLite integrity and size, VM capacity, active sessions, Task Buddy connectivity/channels, reminder outcomes, NAS backup status, and restore-test status. A health action sends a real Task Buddy test message.

## Experience

Northline has responsive desktop/mobile layouts, structured empty/loading/error states, and persistent light/dark themes. The initial appearance follows the operating-system preference; a browser-local preference takes precedence after the user changes it.

## Security and account controls

Northline rejects state-changing browser requests from foreign origins, throttles repeated sign-in attempts and administrative mutations, stores only session-token digests, and lets each user inspect and revoke their own active sessions. The Health dashboard reports the current recorded schema migration. Automated release gates cover authorization structure, performance at a 10,000-task test scale, a disposable clean installation, production dependency vulnerabilities, and accidental private-value disclosure.
