# Orbit Project Hub

Orbit is a self-hosted, Discord-ready project management workspace for creator teams and online communities. It provides a Monday-style Kanban experience with board sharing, a searchable member directory, and Discord reminder workflows.

## Current features

- Kanban columns for Ideas, Ready, In Progress, On Hold, and Done
- Drag-and-drop task movement
- Task creation and local browser persistence
- Board sharing and access-management interface
- Searchable workspace member directory
- Discord connection and channel-reminder interfaces
- Responsive desktop and mobile layout
- Server-backed local accounts with encrypted passwords
- HTTP-only authenticated sessions
- Server-enforced administrator permissions
- SQLite persistence and audit records

> Discord OAuth and live bot delivery remain upcoming integration milestones.

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Production build

```bash
npm run build
npm start
```

## Linux VM deployment with Docker

On a Linux VM with Docker installed:

```bash
git clone https://github.com/jmantheitguy/orbit-project-hub.git
cd orbit-project-hub
docker compose up -d --build
```

Before starting, copy `.env.example` to `.env` and set a long, unique `ORBIT_ADMIN_PASSWORD`. The first launch creates the initial administrator using those credentials.

Orbit will be available at `http://YOUR_VM_IP:3000`. The container restarts automatically after a VM reboot.

To update it later:

```bash
git pull
docker compose up -d --build
```

## Technology

- React 19
- TypeScript
- Vinext / Vite
- Tailwind CSS

## Privacy and self-hosting

The current prototype stores board tasks in the browser's local storage. No task data is sent to a third-party service. Add Discord credentials only through local environment variables once the server integration is implemented; `.env` files are excluded from Git.

## License

No license has been selected yet. All rights reserved by the repository owner.
