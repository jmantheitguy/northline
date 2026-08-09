# Beta validation status

Beta v0.0.1 begins controlled validation with a small team. This document distinguishes verified release evidence from work that requires an interactive browser or deliberate failure simulation.

## Verified for Beta v0.0.1

- Production containers report healthy operation for Northline, Authentik, its database and worker, and the mail server.
- The public Northline route responds successfully through the configured edge tunnel.
- SQLite quick-check passes, foreign-key validation has no findings, and all recorded migrations are applied.
- Authentik office identities, Northline access groups, optional Discord source connections, profile images, and targeted Discord IDs are present for the initial team.
- The latest recorded complete-stack backup is encrypted, verified, and replicated to network storage.
- The latest recorded non-destructive restore drill completed successfully.
- VM storage has safe operating headroom after unused container-build artifacts were removed.
- Lint, production build, architecture/authorization tests, larger-data performance tests, secret scanning, and full dependency audit pass.

## Active interactive validation

- Complete Admin, Member, owner, editor, viewer, suspended-user, and expired-session browser journeys.
- Exercise complete board/task/comment/search/activity/reminder workflows, including controlled failure and retry.
- Validate keyboard-only operation, focus containment, screen-reader semantics, contrast, 200% zoom, and responsive layouts.
- Confirm offline, expired-session, stale-form, unavailable-Discord, refresh, back-navigation, and inaccessible deep-link behavior.

Failures found during Beta should be filed without private infrastructure details and linked from the acceptance record.
