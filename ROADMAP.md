# Northline roadmap

Northline is being built in public as a self-hosted project workspace for small creator teams. Priorities may move as real-world use reveals better sequencing.

## Current — Beta v0.2.0

- Personal workspaces for private boards and optional board-level sharing
- Shared workspace creation, switching, membership, and inherited board access
- Version-only GitHub-style release announcements through Task Buddy

- Custom board workflow columns with persistent ordering, names, colors, and completion semantics
- Safe task migration when a workflow column is removed
- Responsive task action controls across desktop and mobile layouts

- Private boards with owner, editor, and viewer permissions
- Kanban, list, timeline, and calendar-oriented task views
- Task ownership, categories, priorities, due dates, and discussion
- Authentik sign-in, group-controlled access, and a searchable directory
- Administrator console, audit history, and emergency local recovery access
- Task Buddy private Discord delivery and scheduled reminders
- Northline visual identity, application icons, and social preview assets
- Scheduled encrypted complete-stack backups with a tested restore workflow and NAS replication
- Task Buddy reminder management with delivery history, editing, cancellation, and retries
- Automatic Task Buddy notifications for assignment, status, comment, mention, and due-date activity
- Permission-aware global task search, task duplication, and starter board templates
- Board activity history and durable notification snapshots
- Administrator health dashboard with live Task Buddy testing and backup/restore reporting
- Persistent system-aware dark mode across the complete application
- Cross-origin mutation protection and rate limits for sign-in/administration
- User-controlled active-session inventory and revocation
- Recorded database migration versions, failure-aware backup reporting, and container health checks
- CI, dependency update automation, secret scanning, clean-install tests, and larger-data performance regression coverage

## Active Beta acceptance

- Browser-driven Admin, Member, editor, viewer, suspended-user, and expired-session journeys
- Keyboard-only operation, focus order/containment, screen-reader semantics, and contrast review
- Responsive visual review across sign-in, boards, reminders, settings, administration, health, and modals
- Network-failure and expired-session recovery behavior
- Clean-install verification by following only public documentation
- Final known-limitations, support, and release notes

## Beta — Workflow acceleration and production readiness

- Lightweight automation rules for status, due dates, and reminders
- File attachments with configurable self-hosted storage
- Personal task views across boards
- Broader automated coverage for permissions and identity lifecycle events
- Accessibility and responsive-design review
- Performance testing for larger boards and member directories
- Production hardening, upgrade guides, and rollback procedures
- Contributor documentation and stable migration policy

## Longer-term ideas

- Streamer-focused private multi-calendar support with selective sharing
- Opt-in public stream schedules with local-time viewing and subscription feeds
- Collaboration proposals, availability preferences, invitations, attendance responses, and shared events
- Northline task and Task Buddy integration for stream preparation and announcements
- External calendar import/export and later provider synchronization
- Additional notification providers
- Public API and webhooks
- Reporting dashboards
- Optional multi-workspace support

The complete calendar and collaboration concept is described in [docs/FUTURE-PLANS.md](docs/FUTURE-PLANS.md).

Please use a feature request to discuss new ideas. Security-sensitive reports should not be filed publicly.
