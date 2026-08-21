# Northline roadmap

Northline is being built in public as a self-hosted project workspace for small creator teams. Priorities may move as real-world use reveals better sequencing.

## Current — Beta v1.0.0

### Team collaboration foundation

- Reusable teams with owner, manager, and member roles
- Team-linked shared workspaces with inherited board access and preserved direct shares
- Team-aware board discovery, assignment eligibility, My Work, search, and notifications
- Team-scoped streaming calendars and team-first collab recipient filtering with an all-streamers fallback
- Directory team labels and a dedicated Teams management page

- Team-visible streaming calendars and a combined 90-day streamer schedule
- Stream and availability metadata with explicit event-level privacy and busy-only disclosure
- Collaboration invitations, negotiation, acceptance, cancellation, and private Task Buddy updates
- Multi-streamer proposals with independent invitee responses and destination calendars
- Post-acceptance reschedule proposals with unanimous approval, targeted DMs, and atomic calendar updates
- Accepted collabs copied to both participants' chosen calendars without broad calendar access

- Multiple private calendars per user with names, colors, descriptions, and time-zone preferences
- Responsive month, week, and agenda views for one-time timed and all-day events
- Explicit per-calendar viewer/editor sharing without implicit administrator access
- Opaque calendar/event identifiers and audited event, settings, and access changes
- Calendar day view, Task Buddy event reminders, activity history, and 30-day recovery

- Unsaved-change protection for editable modals
- Explicit 12-hour reminder scheduling controls
- Recoverable completed-task archives and default completed-task hiding
- Grouped, collapsible workflow tables in List view
- Persistent personal time clock with optional board and task association
- Personal manual time cards, correction history, and administrator reporting

- Permission-aware My Work dashboard across accessible workspaces and boards
- Urgency grouping for overdue, due-soon, later, unscheduled, and completed assignments
- Cross-board filtering and safe quick updates for editable assigned tasks

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
- Scheduled encrypted Northline-only local backups with four-generation retention and a tested restore workflow
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
- Broader automated coverage for permissions and identity lifecycle events
- Accessibility and responsive-design review
- Performance testing for larger boards and member directories
- Production hardening, upgrade guides, and rollback procedures
- Contributor documentation and stable migration policy

## Longer-term ideas

- Anonymous public stream schedule pages with local-time viewing and subscription feeds
- Multi-participant invitations, attendance responses, moderation controls, and recurring availability
- Northline task and Task Buddy integration for stream preparation and announcements
- External calendar import/export and later provider synchronization
- Additional notification providers
- Public API and webhooks
- Reporting dashboards

The complete calendar and collaboration concept is described in [docs/FUTURE-PLANS.md](docs/FUTURE-PLANS.md).

Please use a feature request to discuss new ideas. Security-sensitive reports should not be filed publicly.
