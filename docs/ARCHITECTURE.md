# Northline architecture

## Components

| Component                       | Responsibility                                                                   | Persistent data                  |
| ------------------------------- | -------------------------------------------------------------------------------- | -------------------------------- |
| Next.js 16 / React 19           | UI, server rendering, API routes, authorization, reminder worker                 | None outside mounted paths       |
| SQLite / better-sqlite3         | Users, sessions, boards, tasks, reminders, time cards, activity, audit, settings | `northline-data:/app/data`       |
| Authentik / PostgreSQL          | Central identity, OIDC, groups, profile sources                                  | Authentik volumes and files      |
| Task Buddy / Discord API        | Scheduled and automatic private notifications                                    | Delivery state remains in SQLite |
| Cloudflare Tunnel               | HTTPS publication without direct origin exposure                                 | Cloudflare configuration         |
| Stalwart and webmail            | Independent domain mailboxes and JMAP webmail                                    | Mail Docker volumes              |
| Cloudflare Email Routing Worker | Inbound public SMTP gateway to private ingress                                   | Worker configuration/secrets     |
| Brevo                           | Authenticated outbound SMTP relay                                                | Provider account                 |
| Synology NAS                    | Encrypted off-host backup retention                                              | Encrypted archives only          |

The table describes logical responsibilities, not the production network map. Internal addresses, provider account identifiers, tunnel IDs, storage paths, and recovery credentials are intentionally private.

## Data and authorization

SQLite uses WAL mode and foreign keys. Board membership is owner, editor, or viewer; Admin is a workspace role. API routes authenticate the session and resolve permissions from the database before reading or mutating board data. Search and activity endpoints use the same accessible-board boundary. Random board IDs reduce enumeration but never replace authorization. Workflow columns are stored per board with stable internal keys and ordered positions. Task status values are validated against that board's columns, and column removal moves affected tasks transactionally to an explicitly selected destination.

Personal and shared workspaces are first-class relational entities. A board belongs to exactly one workspace. Personal workspaces accept no workspace members, preserving private-by-default ownership and optional explicit board shares. Shared workspaces store viewer/editor membership once; board authorization, discovery, assignment, search, and reminders inherit that membership server-side. Explicit board membership can grant additional access but cannot reduce inherited workspace access.

Sessions use random browser tokens and stored SHA-256 digests. Local passwords use bcrypt. OIDC state and PKCE protect the Authentik callback. Authentik directory UUIDs, OIDC subjects, and optional Discord user IDs are stored independently so linking a social profile cannot replace the office identity. Board authorization is independently derived from ownership or an explicit membership row; the site-administrator role does not bypass that boundary. Integration secrets remain environment variables and are not returned to the browser.

A Next.js Proxy runs only for API routes and rejects foreign-origin mutations before route execution. It applies bounded per-client throttling to local sign-in and administrative mutations. This single-instance limiter is defense in depth for the current one-container deployment; Cloudflare or another upstream should provide distributed edge rate limiting when Northline scales horizontally.

Schema changes are forward-only and recorded in `schema_migrations`. Startup creates missing tables/columns/indexes before recording the corresponding version. Downgrades across schema versions require restoration of the matching pre-upgrade database rather than destructive down migrations.

Time entries are owned by a user and optionally reference a workspace, board, and task. A partial unique index permits only one open entry per user. Start and stop timestamps are created by the server in UTC, completed durations are calculated server-side, and overlap validation applies to manual entries and corrections. Corrections retain the previous and replacement values in a dedicated time-entry audit table. Users may mutate only their own entries and may associate work only with boards they can access; the administrator reporting endpoint is read-only and requires the Admin role.

## Notification flow

Task mutations create deduplicated reminder records according to board and task-creator preferences. A server worker polls due records, resolves the task creator's linked Discord ID, opens a private bot conversation, suppresses link embeds, and disables everyone, role, and arbitrary mentions. The worker then updates status and writes a durable delivery snapshot. Manual task reminders use the same creator-DM path; board-wide manual reminders go privately to the member who schedules them.

## Health and backup flow

The admin health API performs a SQLite quick check, reads process/disk/session/reminder data, tests Discord connectivity, and consumes read-only JSON reports written by the host backup scripts. The daily host job creates a consistent SQLite backup, Authentik dump, mail-volume archives, checksums, and an encrypted package; it verifies and replicates the package to the NAS. The restore drill decrypts the newest package into temporary storage and validates every service without modifying production.
