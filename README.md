# Northline

Current release: **Alpha v0.6.0 — Task Buddy notifications**

Northline is a self-hosted project-management platform for creator teams, Discord communities, and other collaborative groups. Its goal is to provide a polished Monday.com-style workspace while keeping accounts, tasks, permissions, and operational data under the workspace owner's control.

Alpha v0.6.0 turns Task Buddy into Northline's automatic Discord notification service. Every board can select its own channel and independently control assignment, status, comment, mention, and due-date events. Personal preferences, direct task links, duplicate protection, delivery history, and failed-delivery retries are included. Authentik-managed profiles and Discord linking remain authoritative, and complete-stack encrypted Synology backups remain active. See the [backup and recovery guide](ops/backup/README.md).

The application combines visual task boards, private collaboration, user administration, and Discord-oriented reminder workflows in a lightweight package designed for an inexpensive Linux VM.

## Product capabilities

### Project planning

- Kanban boards with Ideas, Ready, In Progress, On Hold, and Done workflows
- Drag-and-drop task movement
- Task creation, priorities, categories, due dates, owners, and comments
- Board, list, timeline, and calendar navigation concepts
- Board-level progress indicators, filtering, and sorting controls
- Private boards and boards shared with selected workspace members

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

### Administration

- Dedicated administration console visible only to administrators
- Workspace membership and role metrics
- User search and account-management tools
- Board ownership and access overview
- Administrative audit records
- Invite-only registration policy controls
- Discord connection and session-policy settings

### Discord reminders

- Server-side bot credentials that never reach the browser
- Live discovery of text channels available to the configured bot
- Board-wide and task-specific scheduled reminders
- Durable reminder state with sent, failed, and cancelled statuses
- A self-hosted polling worker started with the Northline server
- Task-reminder scheduling workflow
- Channel selection and reminder-message composition
- Per-board Task Buddy channel routing and notification controls
- Automatic assignment, status-change, comment, mention, and due-date messages
- Per-user notification preferences for activity involving each member
- Direct links from Discord messages to the related Northline task
- Duplicate suppression plus shared delivery history and retry controls

Set `NORTHLINE_DISCORD_BOT_TOKEN` and `NORTHLINE_DISCORD_GUILD_ID` in the VM's private `.env`, invite the bot to the server with permission to view channels and send messages, and rebuild the container. Northline validates every selected channel against the configured guild and suppresses all automatic mentions.

## Architecture

Northline currently uses:

- Next.js 16 with the App Router
- React 19 and TypeScript
- Tailwind CSS
- SQLite through `better-sqlite3` for users, boards, tasks, comments, and memberships
- bcrypt password hashing
- Server-side API routes for authentication and administration
- Docker and Docker Compose for Linux deployment

SQLite runs in WAL mode with foreign-key enforcement. The database contains users, sessions, boards, board memberships, tasks, comments, and administrative audit events. Docker stores it in a persistent named volume mounted at `/app/data`. Every board, task, comment, and sharing API verifies the requesting user's permission on the server.

## Roles

| Role | Intended access |
| --- | --- |
| Admin | Manage users, roles, boards, integrations, security settings, and workspace-wide access |
| Member | Create and manage permitted boards, tasks, and collaborations |
| Guest | Access only boards that have been explicitly shared with the account |

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
NORTHLINE_AUTHENTIK_API_URL=http://authentik-host:9000
NORTHLINE_AUTHENTIK_API_TOKEN=replace-with-an-authentik-api-token
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

- Optional Discord OAuth account linking in addition to Authentik
- Reminder retry controls and delivery-history filtering
- Password reset and forced first-login password changes
- File attachments backed by configurable object or NAS storage
- Notifications and activity feeds
- Expanded audit-log filtering and export
- Automated tests for authentication and permission boundaries

## License

No open-source license has been selected. All rights are reserved by the repository owner.
