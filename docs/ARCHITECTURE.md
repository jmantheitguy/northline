# Northline architecture

## Components

| Component | Responsibility | Persistent data |
| --- | --- | --- |
| Next.js 16 / React 19 | UI, server rendering, API routes, authorization, reminder worker | None outside mounted paths |
| SQLite / better-sqlite3 | Users, sessions, boards, tasks, reminders, activity, audit, settings | `northline-data:/app/data` |
| Authentik / PostgreSQL | Central identity, OIDC, groups, profile sources | Authentik volumes and files |
| Task Buddy / Discord API | Scheduled and automatic private notifications | Delivery state remains in SQLite |
| Cloudflare Tunnel | HTTPS publication without direct origin exposure | Cloudflare configuration |
| Stalwart and webmail | Independent domain mailboxes and JMAP webmail | Mail Docker volumes |
| Cloudflare Email Routing Worker | Inbound public SMTP gateway to private ingress | Worker configuration/secrets |
| Brevo | Authenticated outbound SMTP relay | Provider account |
| Synology NAS | Encrypted off-host backup retention | Encrypted archives only |

The table describes logical responsibilities, not the production network map. Internal addresses, provider account identifiers, tunnel IDs, storage paths, and recovery credentials are intentionally private.

## Data and authorization

SQLite uses WAL mode and foreign keys. Board membership is owner, editor, or viewer; Admin is a workspace role. API routes authenticate the session and resolve permissions from the database before reading or mutating board data. Search and activity endpoints use the same accessible-board boundary. Random board IDs reduce enumeration but never replace authorization.

Sessions use random browser tokens and stored SHA-256 digests. Local passwords use bcrypt. OIDC state and PKCE protect the Authentik callback. Authentik directory UUIDs, OIDC subjects, and optional Discord user IDs are stored independently so linking a social profile cannot replace the office identity. Integration secrets remain environment variables and are not returned to the browser.

A Next.js Proxy runs only for API routes and rejects foreign-origin mutations before route execution. It applies bounded per-client throttling to local sign-in and administrative mutations. This single-instance limiter is defense in depth for the current one-container deployment; Cloudflare or another upstream should provide distributed edge rate limiting when Northline scales horizontally.

Schema changes are forward-only and recorded in `schema_migrations`. Startup creates missing tables/columns/indexes before recording the corresponding version. Downgrades across schema versions require restoration of the matching pre-upgrade database rather than destructive down migrations.

## Notification flow

Task mutations create deduplicated reminder records according to board and task-creator preferences. A server worker polls due records, resolves the task creator's linked Discord ID, opens a private bot conversation, suppresses link embeds, and disables everyone, role, and arbitrary mentions. The worker then updates status and writes a durable delivery snapshot. Manual task reminders use the same creator-DM path; board-wide manual reminders go privately to the member who schedules them.

## Health and backup flow

The admin health API performs a SQLite quick check, reads process/disk/session/reminder data, tests Discord connectivity, and consumes read-only JSON reports written by the host backup scripts. The daily host job creates a consistent SQLite backup, Authentik dump, mail-volume archives, checksums, and an encrypted package; it verifies and replicates the package to the NAS. The restore drill decrypts the newest package into temporary storage and validates every service without modifying production.
