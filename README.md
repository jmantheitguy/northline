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

> This repository currently contains the functional product prototype. Secure multi-user authentication, database-backed permissions, Discord OAuth, and live bot delivery are the next backend milestones.

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

## Technology

- React 19
- TypeScript
- Vinext / Vite
- Tailwind CSS

## Privacy and self-hosting

The current prototype stores board tasks in the browser's local storage. No task data is sent to a third-party service. Add Discord credentials only through local environment variables once the server integration is implemented; `.env` files are excluded from Git.

## License

No license has been selected yet. All rights reserved by the repository owner.
