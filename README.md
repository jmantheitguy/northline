# Orbit Project Hub

Current release: **Alpha v0.1.2 — Enable production inbound email delivery**

Orbit is a self-hosted project-management platform for creator teams, Discord communities, and other collaborative groups. Its goal is to provide a polished Monday.com-style workspace while keeping accounts, tasks, permissions, and operational data under the workspace owner's control.

Alpha v0.1.2 enables production inbound email delivery for the three VTuber Offices mailboxes. It adds Cloudflare Email Routing with exact-recipient Worker rules, authenticated delivery through Cloudflare Tunnel, DMARC monitoring, a Stalwart-compatible SMTP greeting, and a verified end-to-end delivery path into Bulwark Webmail.

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

### Discord direction

- Discord account-linking interface
- Discord bot and channel configuration interface
- Task-reminder scheduling workflow
- Channel selection and reminder-message composition

Discord OAuth, Discord Gateway connectivity, and live reminder delivery are planned integrations; the current interface establishes their intended product workflow.

## Architecture

Orbit currently uses:

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

Create a local `.env` from `.env.example`, replace every placeholder, then open [http://localhost:3000](http://localhost:3000). Orbit deliberately has no default administrator password and will refuse to start until the initial administrator email and password are configured.

## Production configuration

Copy the example environment file and replace every placeholder:

```bash
cp .env.example .env
```

```dotenv
ORBIT_ADMIN_EMAIL=admin@example.com
ORBIT_ADMIN_PASSWORD=replace-with-a-long-random-password
ORBIT_DATA_DIR=/app/data
ORBIT_AUTHENTIK_API_URL=http://authentik-host:9000
ORBIT_AUTHENTIK_API_TOKEN=replace-with-an-authentik-api-token
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
git clone https://github.com/jmantheitguy/orbit-project-hub.git
cd orbit-project-hub
cp .env.example .env
# Edit .env before continuing.
docker compose up -d --build
```

Orbit will listen on port `3000`. Publish it through the existing Cloudflare Tunnel and keep the origin port restricted to the private network.

Update the installation with:

```bash
git pull
docker compose up -d --build
```

The container uses `restart: unless-stopped`, so it will return after a VM reboot.

## Central identity provider

The repository includes a companion [Authentik deployment](infra/authentik/README.md) for central accounts and application-specific access groups. Orbit uses Authentik OpenID Connect for sign-in and synchronizes its searchable directory through the Authentik API. Membership in `Orbit Users` grants normal access; `Orbit Admins` grants administration. Removing both groups suspends the managed Orbit account and invalidates its sessions at the next synchronization.

## Data and backups

The SQLite database is stored in the `orbit-data` Docker volume. Back it up regularly to storage outside the VM. A Synology or other NAS is suitable for encrypted backups and attachments, but the live SQLite database should remain on the VM's local disk rather than an NFS or SMB share.

Environment files, local databases, generated builds, and dependencies are excluded from Git.

## Security notes

- Use a unique administrator password generated by a password manager.
- Never commit `.env` files, private keys, API tokens, OAuth client secrets, or exported service configuration.
- Treat any credential that has appeared in Git history, logs, screenshots, or chat as compromised and rotate it before deployment.
- Serve Orbit over HTTPS before allowing remote access.
- Keep the VM, Docker, and application dependencies updated.
- Restrict direct access to port `3000` with the VM firewall.
- Back up the database and periodically test restoration.
- Do not expose obsolete NAS administration interfaces directly to the internet.

## Roadmap

- Discord OAuth sign-in and account linking
- Discord bot delivery with durable scheduled reminders
- Password reset and forced first-login password changes
- File attachments backed by configurable object or NAS storage
- Notifications and activity feeds
- Expanded audit-log filtering and export
- Automated tests for authentication and permission boundaries

## License

No open-source license has been selected. All rights are reserved by the repository owner.
