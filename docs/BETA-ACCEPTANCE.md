# Beta acceptance checklist

This is the remaining human/browser gate after Alpha v0.8.0. Record the browser, viewport, identity role, result, and issue link for each failure. Do not mark Beta ready from automated tests alone.

## Identity and sessions

- Sign in through Authentik as Admin and Member; sign in through the local recovery path.
- Confirm suspended users, users removed from Northline groups, expired sessions, and invalid OIDC state cannot enter.
- Link Discord and verify the profile picture; unlink it and verify a safe fallback.
- Open two browsers, confirm both sessions appear, revoke one, and confirm it loses access.
- Trigger repeated invalid local sign-ins and confirm throttling is understandable without leaking account existence.

## Authorization matrix

- Owner: board settings, sharing, Task Buddy configuration, edits, duplication, reminders, and deletion.
- Editor: task/comment/reminder mutations and activity, without board sharing/settings/deletion.
- Viewer: read/search/activity only; every mutation must fail even when called directly.
- Admin: administration and health access; non-admin roles must receive a server rejection.

## Product journeys

- Create blank and templated boards; create, edit, drag, duplicate, comment on, remind, complete, and delete tasks.
- Exercise board, list, timeline, and calendar views plus filtering, sorting, global search, deep links, and activity.
- Schedule, edit, cancel, deliver, fail, and retry Task Buddy reminders; verify history after deleting the source task/board.
- Create/suspend/reactivate a recovery user, synchronize Authentik, review audits, send the health test, and verify backup/restore status.

## Accessibility and responsive presentation

- Complete every journey with keyboard only; verify visible focus, logical order, modal focus containment, Escape/close behavior, and no keyboard trap.
- Inspect headings, landmarks, labels, control names, live errors/toasts, tables, and modal announcements with a screen reader.
- Verify contrast and state differentiation in light/dark themes without relying only on color.
- Test narrow phone, tablet, laptop, and wide desktop viewports with zoom at 200%; confirm no inaccessible horizontal clipping.

## Failure recovery

- Simulate offline/API failures, Discord unavailability, expired sessions, and invalid/stale form data.
- Confirm destructive actions require clear confirmation and successful actions cannot be submitted twice.
- Confirm refresh/back/deep-link behavior does not expose inaccessible data or lose critical unsaved state without warning.
