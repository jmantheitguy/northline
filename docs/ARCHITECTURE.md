# Northline architecture

## Components

| Component                       | Responsibility                                                                   | Persistent data                  |
| ------------------------------- | -------------------------------------------------------------------------------- | -------------------------------- |
| Next.js 16 / React 19           | UI, server rendering, API routes, authorization, reminder worker                 | None outside mounted paths       |
| PostgreSQL / `pg`               | Users, sessions, boards, tasks, reminders, time cards, activity, audit, settings | Railway managed PostgreSQL; local `northline-postgres-data-v18` volume |
| Authentik / PostgreSQL          | Central identity, OIDC, groups, profile sources                                  | Authentik volumes and files      |
| Task Buddy / Discord API        | Scheduled and automatic private notifications                                    | Delivery state remains in PostgreSQL |
| Cloudflare Tunnel               | HTTPS publication without direct origin exposure                                 | Cloudflare configuration         |
| Stalwart and webmail            | Independent domain mailboxes and JMAP webmail                                    | Mail Docker volumes              |
| Cloudflare Email Routing Worker | Inbound public SMTP gateway to private ingress                                   | Worker configuration/secrets     |
| Brevo                           | Authenticated outbound SMTP relay                                                | Provider account                 |
| Synology NAS                    | Encrypted off-host backup retention                                              | Encrypted archives only          |

The table describes logical responsibilities, not the production network map. Internal addresses, provider account identifiers, tunnel IDs, storage paths, and recovery credentials are intentionally private.

## Data and authorization

PostgreSQL uses a transaction-scoped connection pool and foreign keys. Board membership is owner, editor, or viewer; Admin is a workspace role. API routes authenticate the session and resolve permissions from the database before reading or mutating board data. Search and activity endpoints use the same accessible-board boundary. Random board IDs reduce enumeration but never replace authorization. Workflow columns are stored per board with stable internal keys and ordered positions. Task status values are validated against that board's columns, and column removal moves affected tasks transactionally to an explicitly selected destination.

Personal and shared workspaces are first-class relational entities. A board belongs to exactly one workspace. Personal workspaces accept no workspace members, preserving private-by-default ownership and optional explicit board shares. Shared workspaces store viewer/editor membership once; board authorization, discovery, assignment, search, and reminders inherit that membership server-side. Explicit board membership can grant additional access but cannot reduce inherited workspace access.

Teams are a separate, reusable membership boundary. Each team has one owner (leader), optional managers, and members. Managers may maintain ordinary membership and can create a new team workspace directly; they cannot appoint or remove managers. Only the owner can change team settings or delete the team. A team may connect to an owner-controlled shared workspace with viewer or editor access, or an owner/manager can create and automatically link a new shared workspace in one operation. Board discovery, board authorization, assignment eligibility, search, My Work, notification recipients, and workspace navigation all honor that inherited team access. Direct board and workspace shares remain independent and are never removed by adding a team link.

Sessions use random browser tokens and stored SHA-256 digests. Local passwords use bcrypt. OIDC state and PKCE protect the Authentik callback. Authentik directory UUIDs, OIDC subjects, and optional Discord user IDs are stored independently so linking a social profile cannot replace the office identity. Board authorization is independently derived from ownership or an explicit membership row; the site-administrator role does not bypass that boundary. Integration secrets remain environment variables and are not returned to the browser.

A Next.js Proxy runs only for API routes and rejects foreign-origin mutations before route execution. It applies bounded per-client throttling to local sign-in and administrative mutations. This single-instance limiter is defense in depth for the current one-container deployment; Cloudflare or another upstream should provide distributed edge rate limiting when Northline scales horizontally.

Schema changes are forward-only and recorded in `schema_migrations`. Startup creates missing tables/columns/indexes before recording the corresponding version. Downgrades across schema versions require restoration of the matching pre-upgrade database rather than destructive down migrations.

Streaming discovery is a separate read model over calendars and calendar events. It requires an authenticated active Northline session, includes the current user's own entries, and otherwise requires both a streaming calendar with team/public-ready visibility and an eligible event visibility. Busy-only rows are redacted server-side. Collaboration requests expose opaque request IDs and use a participant junction table for independent response state, counterproposal metadata, and destination calendars. Existing one-to-one rows are migrated into that table. The organizer event is created once, while each accepted participant receives a separate event in their chosen calendar; no response adds calendar membership or widens access to unrelated events.

The team-schedule read model groups accepted calendar copies by the internal collaboration request before returning them, so a group collaboration appears once without deleting its per-user calendar records. The Collab planner reads this account-wide model independently of the selected board workspace; workspace selection never grants or removes access to private calendars or boards. Post-acceptance rescheduling uses an opaque proposal plus a response junction table. Only the organizer and accepted participants may propose; every affected account must approve, and one transaction then updates all non-deleted calendar events linked to that collaboration request. Declining closes only the proposal and preserves the confirmed time.

Streaming calendars may optionally be assigned to a team. Team calendar visibility is evaluated server-side from team membership: the leader can edit it, managers can manage entries, and members can view eligible schedule rows. The collab picker offers a team-first filter for the current user's teams and retains an all-streamers search path for cross-team collaboration.

## Time-zone model

Northline stores shared instants as ISO 8601 UTC values and stores an IANA time-zone identifier on each user account. The browser refreshes that identifier from the signed-in device. Presentation uses the viewer's local zone, server-side local-day calculations use the persisted zone, and task deadlines remain date-only values. The Linux VM may remain configured for UTC and never determines a member's local wall-clock time.

Time tracking is stored in `time_entries` with an immutable user owner and optional workspace, board, and task associations. Association validation reuses board authorization, one partial unique index enforces a single active timer per user, and overlap checks exclude soft-deleted entries. Corrections, deletion, and restoration append records to `time_entry_audit`. Personal and administrative CSV exports are generated server-side from the same permission-scoped queries as the on-screen reports.

Time entries are owned by a user and optionally reference a workspace, board, and task. A partial unique index permits only one open entry per user. Start and stop timestamps are created by the server in UTC, completed durations are calculated server-side, and overlap validation applies to manual entries and corrections. Corrections retain the previous and replacement values in a dedicated time-entry audit table. Users may mutate only their own entries and may associate work only with boards they can access; the administrator reporting endpoint is read-only and requires the Admin role.

## Notification flow

Task mutations create deduplicated reminder records according to board and recipient preferences: assignment and due-date events target assignees, while other task updates follow the task creator. A server worker polls due records, resolves each reminder recipient's linked Discord ID, opens a private bot conversation, suppresses link embeds, and disables everyone, role, and arbitrary mentions. The worker then updates status and writes a durable delivery snapshot. Manual task reminders target every assigned person, falling back to the task creator when no one is assigned; board-wide manual reminders fan out privately to every active board member. The same worker drains a separate collaboration-notification queue so stream invitations and responses never rely on Discord for authorization or transaction completion.

## Health and backup flow

The admin health API performs a PostgreSQL integrity check, reads session/reminder data, tests Discord connectivity, and consumes read-only JSON reports written by the host or provider backup workflow. Production backups are taken from managed PostgreSQL and retained outside the application container. SQLite snapshots are used only for legacy import and fixture recovery. Authentik and mail are intentionally outside the Northline backup scope. Off-host replication is reported only when a separately configured destination is verified.
