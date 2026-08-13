# Northline future plans

This document describes longer-term product directions under consideration after the initial Beta stabilization work. It is a planning reference rather than a promise of delivery dates. Priorities may change as the team learns from real use.

## Delivered in Beta v0.7.0 — Private calendars

Beta v0.7.0 delivers the first calendar foundation, not the complete public collaboration network. It includes multiple private calendars per user, calendar colors and names, month/week/agenda views, one-time events, time-zone-safe storage and display, and explicit calendar sharing with viewer or editor permission. Every calendar is private by default, and sharing one calendar does not expose the owner's other calendars, private boards, Discord identifiers, or administrative data.

The delivered foundation provides:

- A user can create, rename, recolor, and delete multiple calendars without affecting another user's data.
- Events retain their intended wall-clock time across time zones and daylight-saving transitions.
- A calendar owner can grant and revoke viewer or editor access to a specific Northline user.
- Viewers cannot change events; editors cannot change calendar ownership or sharing policy.
- Private calendar and event IDs cannot be enumerated or opened through guessed URLs.
- Event changes and sharing changes produce an auditable activity record.
- Calendar data is covered by the existing local backup and restore process before production use.
- Desktop and mobile month, week, and agenda journeys pass interactive testing with the production identity flow.

Event reminders, public schedule pages, recurring-event edge cases, collaboration requests, guest invitations, `.ics` feeds, and external provider synchronization remain later phases.

## Streaming calendars and collaboration planning

The largest planned feature is a calendar system designed specifically for streamers. Every Northline member would have a private calendar workspace where they can plan streams, appearances, production deadlines, and collaboration events. A member could maintain multiple calendars—for example, a public stream schedule, private planning calendar, collaboration calendar, and channel-specific schedules—and choose the visibility of each calendar independently.

### Personal stream scheduling

Members should be able to create one-time and recurring events with:

- Stream title, description, category, platform, and destination link
- Start time, expected duration, and the member's preferred time zone
- Recurrence rules for regular weekly or monthly programming
- Draft, tentative, confirmed, postponed, cancelled, and completed states
- Optional preparation windows, reminders, and related Northline tasks or boards
- Public notes for viewers and private production notes for the streamer
- Optional thumbnail or event artwork

Calendar views should include month, week, day, agenda, and an upcoming-stream list. Times must be stored consistently and rendered in each viewer's local time zone, with the original organizer time zone clearly available.

### Privacy and public schedules

Calendars and individual events should support separate visibility levels:

- **Private:** visible only to the owner
- **Shared:** visible to specifically invited Northline members
- **Team:** visible to approved members of the workspace
- **Public:** visible to anyone with the public schedule page

Making a calendar public must be an explicit choice. Private notes, reminders, internal task links, guest responses, Discord identifiers, email addresses, and unannounced collaboration details must never leak onto a public page. A streamer should be able to share one public calendar while keeping every other calendar private.

Public schedule pages should be easy to browse on mobile, have stable shareable URLs, show events in the visitor's time zone, and provide calendar subscription options without requiring a Northline account. Search engines and social previews should be configurable so streamers can decide how discoverable their schedule is.

### Collaboration discovery and requests

When a streamer publishes their schedule, other authenticated streamers should be able to review appropriate open dates and request a collaboration. The workflow should avoid treating every visible event as an invitation.

A collaboration request would contain:

- Proposed title or concept
- Proposed date, start time, duration, and alternative times
- Participating streamers
- Platforms or channels involved
- A private message describing the idea
- Optional links to a Northline board or planning task

The recipient could accept, decline, suggest another time, ask a question, or leave the request pending. Accepting a request would create or update a shared calendar event and invite all approved participants. Declining a request should not expose a private reason unless the recipient chooses to send one.

Members should be able to specify collaboration preferences such as unavailable dates, minimum notice, preferred stream types, whether unsolicited requests are accepted, and who may send requests. Blocking and reporting controls are required before collaboration discovery can be opened beyond a trusted workspace.

### Invitations and attendance

Calendar events should support organizer and guest roles. Organizers can invite Northline users to an event; invitees can respond **Yes**, **No**, or **Maybe**, optionally proposing a new time. The organizer should see response status without exposing one guest's private profile information to unrelated viewers.

Event updates and cancellations should notify affected participants without generating duplicate messages. Important changes—such as time, date, cancellation, or removal from the guest list—should be recorded in an event activity history.

For external collaborators who do not use Northline, a later phase may provide limited email invitations or secure guest links. External invitations require additional anti-abuse, expiration, and privacy controls and should not be part of the first calendar release.

### Northline and Task Buddy integration

Calendar events should integrate with the existing project-management workflow:

- Link an event to a board, task, or launch plan
- Create preparation tasks from reusable stream templates
- Schedule Task Buddy reminders for organizers and confirmed guests
- Post an approved schedule announcement to a configured Discord channel
- Open the related Northline task directly from a reminder
- Reflect cancellations or major schedule changes without repeatedly notifying the channel

Discord should remain a notification and profile-linking integration, not the source of calendar authorization. Northline and Authentik identities remain authoritative for permissions and invitations.

### Calendar interoperability

After the native workflow is stable, Northline may support:

- Read-only iCalendar subscriptions for public and shared calendars
- Exporting individual events as `.ics` files
- Importing an existing calendar into a separate user-controlled calendar
- Optional two-way synchronization with external calendar providers
- Public schedule widgets that streamers can embed on their websites

Two-way synchronization is deliberately later work because conflict resolution, deleted events, recurring-event exceptions, provider rate limits, and credential security are substantially more complex than export or subscription feeds.

### Administration, safety, and retention

Workspace administrators should be able to configure whether public calendars and collaboration discovery are permitted, but ordinary administrators should not automatically receive access to private calendar content. Operational access must follow a documented support and audit process.

The system should record invitation and visibility changes, enforce request rate limits, prevent enumeration of private calendars, and offer controls for muted, blocked, or abusive users. Deleted calendars and events need a recoverable retention window before permanent removal, with backup and restore coverage included from the first production release.

### Proposed delivery phases

1. **Private calendar foundation:** multiple calendars per member, event creation and editing, recurrence, time zones, reminders, and private views.
2. **Selective sharing:** user invitations, viewer/editor calendar permissions, attendance responses, and event activity history.
3. **Public streaming schedules:** explicit public visibility, safe public pages, local-time rendering, and read-only calendar feeds.
4. **Collaboration requests:** availability preferences, proposals, negotiation, acceptance, shared events, blocking, and reporting.
5. **Workflow integration:** Northline task templates, Task Buddy reminders and announcements, and public widgets.
6. **External interoperability:** imports, provider integrations, secure external guests, and carefully designed two-way synchronization.

Each phase should receive its own threat review, authorization tests, migration plan, accessibility review, and Beta acceptance checklist before moving to the next phase.

## Other longer-term directions

- File attachments backed by configurable self-hosted storage
- Expanded personal task planning beyond the delivered My Work dashboard
- Workflow automation for task status, due dates, and reminders
- Additional notification providers
- Public API keys and scoped webhooks
- Reporting and workload dashboards
- Optional multi-workspace support

Feature proposals should be discussed publicly only when they do not reveal private infrastructure or personal information. Security-sensitive design concerns should follow the private reporting process in `SECURITY.md`.
