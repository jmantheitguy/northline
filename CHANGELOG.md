# Northline release history

## Alpha v0.8.2 — Linked-identity sign-in reliability

- Resolve returning Authentik users by their stable OIDC subject before comparing email addresses.
- Normalize email fallback matching and safely handle linked Discord identities whose profile email formatting differs from the existing Northline record.
- Redirect identity collisions to a controlled sign-in error instead of returning an HTTP 500 response.

## Alpha v0.8.1 — Development dependency hardening

- Removed an unused Cloudflare/Vite prototype toolchain from the Northline application package.
- Updated the remaining development dependency tree and expanded the release audit to reject development-time vulnerabilities as well as production vulnerabilities.
- Reduced the application dependency footprint without changing the deployed feature set or database schema.

## Alpha v0.8.0 — Beta security and reliability foundation

- Added explicit same-origin protection for every state-changing API request.
- Added sign-in and administrative mutation throttling with retry guidance.
- Added active-session inventory, individual revocation, and revoke-all-other-sessions controls.
- Added recorded schema migrations and schema version reporting in Administration Health.
- Added backup and restore-test failure reports plus Docker health checks.
- Added clean-install verification, larger-data performance testing, an authorization matrix, secret scanning, CI, and Dependabot.
- Added forward-upgrade and backup-based rollback documentation.
- Deferred calendar development until after Beta and identified browser-based accessibility/visual acceptance as the remaining external gate.

## Alpha v0.7.2 — Public documentation refresh

- Added comprehensive feature, architecture, operations, onboarding, security, backup, identity, mail, and release documentation.
- Updated the roadmap to distinguish completed Alpha capabilities from the private multi-calendar and Beta milestones.
- Replaced production network values in public examples with safe placeholders.
- Documented the boundary between public implementation guidance and the private infrastructure runbook.

## Alpha v0.7.1 — Complete dark mode

- Added a persistent, system-aware light/dark preference.
- Covered sign-in, boards, all task views, reminders, settings, administration, health, search, loading states, and modals.
- Added an accessible appearance toggle and regression coverage.

## Alpha v0.7.0 — Operations and workflow readiness

- Added the admin health dashboard, live Task Buddy test, NAS backup status, and restore-test status.
- Added permission-aware global search, board activity, task duplication, and starter board templates.
- Preserved notification delivery history after task/board deletion.
- Added security response headers, onboarding documentation, and expanded architecture tests.

## Alpha v0.6.x — Task Buddy notifications

- Added board-level automatic assignment, status, comment, mention, and due notifications.
- Added per-user preferences, reminder center management, direct task links, delivery retry/history, and Discord embed suppression.
- Replaced sequential board references with opaque random IDs while retaining server authorization.

## Alpha v0.5.x — Identity, mail, and operational foundation

- Integrated Authentik OIDC, group-based authorization, directory synchronization, profiles, and Discord account linking.
- Deployed independent VTuber Offices mail with Stalwart, webmail, Cloudflare inbound routing, and Brevo outbound relay.
- Added encrypted complete-stack backups, Synology replication, and non-destructive restore validation.

## Earlier alpha milestones

- Established Northline branding and renamed the original project.
- Added private/shared boards, tasks, comments, filtering, multiple views, administration, audit history, local authentication, and Docker deployment.
