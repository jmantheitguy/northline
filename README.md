# Northline

Current release: **Beta v0.9.7 — Stable board sharing**

Northline is a self-hosted project-management platform for creator teams, Discord communities, and other collaborative groups. Its goal is to provide a polished Monday.com-style workspace while keeping accounts, tasks, permissions, and operational data under the workspace owner's control.

The Beta line begins with the core board, identity, administration, Task Buddy, backup, and operational platform active for a small real-world team. Automated authorization, build, performance, clean-install, secret, dependency, database, backup, restore, service-health, and public-routing checks form the release baseline. Browser-driven accessibility, responsive presentation, failure recovery, and complete role journeys remain active Beta acceptance work and are tracked publicly rather than implied to be complete.

The application combines visual task boards, private collaboration, user administration, and Discord-oriented reminder workflows in a lightweight package designed for an inexpensive Linux VM.

## Documentation

| Guide                                          | Purpose                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------ |
| [Features](docs/FEATURES.md)                   | Complete user-facing capability and permissions reference                |
| [Architecture](docs/ARCHITECTURE.md)           | Components, data model, trust boundaries, and request flows              |
| [Operations](docs/OPERATIONS.md)               | Deployment, updates, health monitoring, troubleshooting, and maintenance |
| [Upgrading](docs/UPGRADING.md)                 | Migration policy, clean-install verification, and rollback procedure     |
| [Member onboarding](docs/ONBOARDING.md)        | Authentik, Discord linking, profiles, access, and first-use steps        |
| [Release checklist](docs/RELEASE-CHECKLIST.md) | Required validation before and after every release                       |
| [Beta status](docs/BETA-STATUS.md)             | Verified release evidence and remaining interactive validation           |
| [Future plans](docs/FUTURE-PLANS.md)           | Streaming calendars, collaboration planning, and longer-term directions  |
| [Backup and recovery](ops/backup/README.md)    | Encrypted VM/NAS backups and non-destructive restore testing             |
| [Authentik](infra/authentik/README.md)         | Central identity and Northline security groups                           |
| [Mail](infra/mail/README.md)                   | Stalwart, webmail, Cloudflare ingress, and Brevo relay                   |
| [Security policy](SECURITY.md)                 | Supported versions, credential rules, and private reporting              |
| [Release history](CHANGELOG.md)                | Version-by-version feature summary                                       |

## Product capabilities

### Project planning

- Kanban boards with fully customizable per-board workflow columns: add, rename, recolor, reorder, or safely remove stages
- Automatic personal workspaces plus owner-managed shared workspaces whose members inherit access to every contained board
- A personal My Work dashboard with urgency grouping, cross-board filters, and permission-aware quick edits
- Drag-and-drop task movement
- Task creation, priorities, categories, due dates, owners, and comments
- Board, list, timeline, and calendar navigation concepts
- Board-level progress indicators, filtering, and sorting controls
- Permission-aware search across every accessible board
- Task duplication, board activity history, and reusable starter templates
- Private boards and boards shared with selected workspace members
- Site administrators cannot open private board content unless the owner explicitly shares it with them
- Task assignment is limited to the board owner and active shared members
- Long, random public board IDs used by task and reminder links while creator ownership remains private
- Browser navigation uses random board IDs without treating URL secrecy as authorization
- Persistent light and dark themes that honor the browser preference on first use
- A persistent floating Time In/Time Out clock with task-detail shortcuts and long-running timer warnings
- Personal time cards with daily and weekly totals, date/board/task filters, CSV export, manual entries, audited corrections, and 30-day deletion recovery
- Filterable organization-wide time reporting, CSV export, active-timer visibility, and audit history for administrators without exposing timer controls across accounts

### Private calendars

- Multiple named, color-coded calendars per member, with month, week, and agenda views
- One-time all-day or timed events with descriptions, locations, status, and explicit IANA time zones
- Private-by-default ownership and per-calendar viewer/editor sharing with active Northline members
- Opaque random calendar and event identifiers at every browser/API boundary
- Owner-only sharing, settings, and deletion; editors may manage events and viewers remain read-only
- Audited event and sharing changes without granting site administrators implicit access to private calendar content
- Day view, private Task Buddy event reminders, owner-visible activity, and 30-day calendar/event recovery

### Stream schedules and collabs

- Explicit streaming calendars with private, Northline-team, or public-ready visibility; personal calendars remain private by default
- Stream, availability, and confirmed-collab entries with platform, game/category, destination link, local-time rendering, and per-entry detail controls
- A combined 90-day team schedule that exposes only eligible streaming entries and can reduce an entry to a generic busy window
- Collaboration requests for up to 20 invited streamers, with proposed times, private messages, accept, decline, counterproposal, and cancellation states
- Each invitee responds independently and chooses their own destination calendar; accepted requests create confirmed events without sharing any participant's full calendar
- Task Buddy sends private Discord updates for collaboration invitations and responses when the recipient has linked Discord
- Accepted participants or the organizer can propose a replacement time; affected members approve independently, Task Buddy routes the proposal to the organizer or participants, and every accepted calendar updates only after unanimous approval
- The team schedule collapses organizer and participant calendar copies into one collaboration row while preserving each person's private calendar record
- “Public-ready” is an authenticated visibility policy in this release; anonymous schedule pages and calendar feeds remain future work

### Members and access

- Searchable workspace member directory
- Local email-and-password authentication
- Password hashing with bcrypt
- Random server-side sessions stored as SHA-256 token digests
- Secure, HTTP-only, same-site session cookies
- Admin, Member, and Guest roles
- Server-enforced administrator and board-level authorization
- Authentik-managed accounts and group-based access revocation
- User creation, role assignment, suspension, and reactivation
- Protection against an administrator suspending their own active account
- Authentik profile pictures and optional Discord linking for avatars and targeted reminder pings (not sign-in)
- Active-session inventory with individual or bulk revocation
- Same-origin enforcement and throttling for sensitive requests

### Administration

- Dedicated dark-mode-aware administration overview with live service status, organization counts, active timers, alerts, and direct access to every administrative tool
- Workspace membership and role metrics
- User search and account-management tools
- Board ownership and access overview
- Administrative audit records
- Invite-only registration policy controls
- Discord connection and session-policy settings
- Live health dashboard with Task Buddy test delivery, database integrity, disk capacity, and backup/restore status
- Active-session, application-memory, Node runtime, database-size, and reminder-delivery visibility
- Recorded database schema version and explicit backup/restore failure visibility

### Discord reminders

- Server-side bot credentials that never reach the browser
- Private Discord delivery through the configured bot
- Board-wide and task-specific scheduled reminders, with explicit recipient rules
- Durable reminder state with sent, failed, and cancelled statuses
- A self-hosted polling worker started with the Northline server
- Task-reminder scheduling workflow
- One-click “Remind me” scheduling directly from Task details
- Consistent rich Discord formatting for automatic and scheduled reminders
- Clickable Northline links with Discord preview embeds suppressed
- Reminder-message composition without public channel configuration
- Per-board Task Buddy event controls
- Automatic assignment, status-change, comment, mention, and due-date messages
- Per-user notification preferences, evaluated for the task creator
- Direct links from Discord messages to the related Northline task
- Duplicate suppression plus shared delivery history and retry controls

Set `NORTHLINE_DISCORD_BOT_TOKEN` and `NORTHLINE_DISCORD_GUILD_ID` in the VM's private `.env`, invite the bot to the shared server, and rebuild the container. Task-specific and automatic notifications privately DM the task creator; board-wide manual reminders privately DM the member who scheduled them. A recipient must have linked Discord through Authentik. Northline disables everyone, role, and arbitrary mentions and reports failed private delivery in the Reminder center.

## Architecture

Northline currently uses:

- Next.js 16 with the App Router
- React 19 and TypeScript
- Tailwind CSS
- SQLite through `better-sqlite3` for users, boards, tasks, comments, and memberships
- bcrypt password hashing
- Server-side API routes for authentication and administration
- Docker and Docker Compose for Linux deployment

SQLite runs in WAL mode with foreign-key enforcement. The database contains users, sessions, boards, memberships, tasks, comments, reminders, notification snapshots, board activity, workspace settings, and administrative audit events. Docker stores it in a persistent named volume mounted at `/app/data`. Every board, task, comment, reminder, search, activity, and sharing API verifies the requesting user's permission on the server.

## Roles

| Role   | Intended access                                                                         |
| ------ | --------------------------------------------------------------------------------------- |
| Admin  | Manage users, roles, boards, integrations, security settings, and workspace-wide access |
| Member | Create and manage permitted boards, tasks, and collaborations                           |
| Guest  | Access only boards that have been explicitly shared with the account                    |

Authorization for administrative APIs is checked on the server. Hiding an interface element is never treated as the security boundary.

## Run locally

Requirements:

- Node.js 22.13 or newer
- npm

```bash
npm install
npm run dev
```

Create a local `.env` from `.env.example`, replace every placeholder, then open [http://localhost:3000](http://localhost:3000). Northline deliberately has no default administrator password and will refuse to start until the initial administrator email and password are configured.

## Production configuration

Copy the example environment file and replace every placeholder:

```bash
cp .env.example .env
```

```dotenv
NORTHLINE_ADMIN_EMAIL=admin@example.com
NORTHLINE_ADMIN_PASSWORD=replace-with-a-long-random-password
NORTHLINE_DATA_DIR=/app/data
NORTHLINE_PUBLIC_URL=https://northline.example.com
NORTHLINE_COOKIE_SECURE=true
NORTHLINE_OIDC_ISSUER=https://auth.example.com/application/o/northline
NORTHLINE_OIDC_CLIENT_ID=copy-from-authentik
NORTHLINE_OIDC_CLIENT_SECRET=copy-from-authentik
NORTHLINE_AUTHENTIK_API_URL=http://authentik-host:9000
NORTHLINE_AUTHENTIK_API_TOKEN=replace-with-an-authentik-api-token
NORTHLINE_DISCORD_BOT_TOKEN=replace-with-a-discord-bot-token
NORTHLINE_DISCORD_GUILD_ID=replace-with-your-server-id
```

The first application start creates the initial administrator. Subsequent users can only be created from the authenticated administration console.

## Linux VM deployment

Recommended starting allocation for a small community:

- 2 vCPU
- 2 GB RAM
- 12–20 GB local disk
- Ubuntu Server or Debian
- Docker Engine with Docker Compose

Deploy with:

```bash
git clone https://github.com/jmantheitguy/northline.git
cd northline
cp .env.example .env
# Edit .env before continuing.
docker compose up -d --build
```

Northline will listen on port `3000`. Publish it through the existing Cloudflare Tunnel and keep the origin port restricted to the private network.

Update the installation with:

```bash
git pull
docker compose up -d --build
```

The container uses `restart: unless-stopped`, so it will return after a VM reboot.

## Central identity provider

The repository includes a companion [Authentik deployment](infra/authentik/README.md) for central accounts and application-specific access groups. Northline uses Authentik OpenID Connect for sign-in and synchronizes its searchable directory through the Authentik API. Membership in `Northline Users` grants normal access; `Northline Admins` grants administration. Removing both groups suspends the managed Northline account and invalidates its sessions at the next synchronization.

## Data and backups

The SQLite database is stored in the `northline-data` Docker volume. Back it up regularly to storage outside the VM. A Synology or other NAS is suitable for encrypted backups and attachments, but the live SQLite database should remain on the VM's local disk rather than an NFS or SMB share.

Environment files, local databases, generated builds, and dependencies are excluded from Git.

## Security notes

- Use a unique administrator password generated by a password manager.
- Never commit `.env` files, private keys, API tokens, OAuth client secrets, or exported service configuration.
- Treat any credential that has appeared in Git history, logs, screenshots, or chat as compromised and rotate it before deployment.
- Serve Northline over HTTPS before allowing remote access.
- Keep the VM, Docker, and application dependencies updated.
- Restrict direct access to port `3000` with the VM firewall.
- Back up the database and periodically test restoration.
- Do not expose obsolete NAS administration interfaces directly to the internet.

## Roadmap

The current and planned milestones are maintained in [ROADMAP.md](ROADMAP.md). The Beta line combines real-user validation, accessibility, visual and responsive review, failure recovery, and complete role journeys with carefully scoped creator-team features. Private calendars and authenticated stream-collaboration planning are active; anonymous public schedule pages and external calendar interoperability remain later work.

## License

No open-source license has been selected. All rights are reserved by the repository owner.
