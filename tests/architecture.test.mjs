import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("board mutations enforce server-side permissions", async () => {
  const [taskRoute, memberRoute, permissions] = await Promise.all([
    read("app/api/tasks/[id]/route.ts"),
    read("app/api/boards/[id]/members/route.ts"),
    read("lib/boards.ts"),
  ]);
  assert.match(
    taskRoute,
    /canEdit\(boardPermission\(user,\s*task\.(?:board_id|boardId)\)\)/,
  );
  assert.match(memberRoute, /canShare\(boardPermission\(user,boardId\)\)/);
  assert.match(permissions, /permission==="owner"\|\|permission==="editor"/);
  assert.match(permissions, /canShare=.*permission==="owner"/);
  assert.doesNotMatch(permissions, /permission==="admin"|user\.role==="Admin"/);
});

test("directory synchronization revokes removed Authentik accounts", async () => {
  const sync = await read("lib/authentik-directory.ts");
  assert.match(sync, /groups\.includes\("Northline Admins"\)/);
  assert.match(sync, /groups\.includes\("Northline Users"\)/);
  assert.match(sync, /UPDATE users SET status='Suspended'/);
  assert.match(sync, /DELETE FROM sessions WHERE user_id=/);
});

test("board data is relational and cascade-safe", async () => {
  const schema = await read("lib/db.ts");
  for (const table of [
    "boards",
    "board_members",
    "tasks",
    "comments",
    "reminders",
    "notification_deliveries",
    "board_activity",
    "board_notification_settings",
    "user_notification_settings",
    "workspace_settings",
  ])
    assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(schema, /public_id TEXT UNIQUE/);
  assert.match(schema, /created_by INTEGER REFERENCES users/);
  assert.match(
    schema,
    /board_id INTEGER NOT NULL REFERENCES boards\(id\) ON DELETE CASCADE/,
  );
  assert.match(
    schema,
    /task_id INTEGER NOT NULL REFERENCES tasks\(id\) ON DELETE CASCADE/,
  );
});

test("board references are opaque while creator ownership remains relational", async () => {
  const [schema, boards, detail, worker, ui, permissions] = await Promise.all([
    read("lib/db.ts"),
    read("app/api/boards/route.ts"),
    read("app/api/boards/[id]/route.ts"),
    read("lib/reminder-worker.ts"),
    read("app/northline-app.tsx"),
    read("lib/boards.ts"),
  ]);
  assert.match(boards, /created_by/);
  assert.match(schema, /brd_\$\{randomBytes\(16\)/);
  assert.match(detail, /boardKey/);
  assert.match(worker, /creatorName/);
  assert.match(worker, /set a reminder/);
  assert.match(ui, /query\.set\("board",\s*active\.boardKey\)/);
  assert.match(permissions, /owner_id/);
});

test("Task Buddy automatic notifications are creator-routed and preference aware", async () => {
  const [automation, boardRoute, preferences, ui] = await Promise.all([
    read("lib/task-notifications.ts"),
    read("app/api/boards/[id]/notifications/route.ts"),
    read("app/api/settings/notifications/route.ts"),
    read("app/northline-app.tsx"),
  ]);
  for (const event of ["assignment", "status", "comment", "mention", "due"])
    assert.match(automation, new RegExp(`\\b${event}\\b`));
  assert.match(automation, /INSERT OR IGNORE INTO reminders/);
  assert.match(automation, /NORTHLINE_PUBLIC_URL/);
  assert.match(boardRoute, /canShare\(boardPermission/);
  assert.match(preferences, /user_notification_settings/);
  assert.match(ui, /Automatic notifications/);
});

test("Discord reminders are permission checked and secrets stay server-side", async () => {
  const [route, discord, worker, compose] = await Promise.all([
    read("app/api/reminders/route.ts"),
    read("lib/discord.ts"),
    read("lib/reminder-worker.ts"),
    read("compose.yaml"),
  ]);
  assert.match(route, /canEdit\(boardPermission\(user,Number\(boardId\)\)\)/);
  assert.match(route, /created_by createdBy/);
  assert.match(route, /has not linked Discord/);
  assert.match(discord, /process\.env\.NORTHLINE_DISCORD_BOT_TOKEN/);
  assert.match(discord, /\/users\/@me\/channels/);
  assert.match(discord, /recipient_id/);
  assert.doesNotMatch(route, /NORTHLINE_DISCORD_BOT_TOKEN/);
  assert.match(discord, /allowed_mentions/);
  assert.match(discord, /flags:4/);
  assert.match(worker, /COALESCE\(t\.created_by/);
  assert.match(worker, /setInterval/);
  assert.match(compose, /NORTHLINE_DISCORD_BOT_TOKEN/);
});

test("reminder management supports controlled updates, cancellation, and retry", async () => {
  const [collection, item, retry, ui] = await Promise.all([
    read("app/api/reminders/route.ts"),
    read("app/api/reminders/[id]/route.ts"),
    read("app/api/reminders/[id]/retry/route.ts"),
    read("app/reminder-center.tsx"),
  ]);
  assert.match(collection, /canManage/);
  assert.match(item, /Only pending reminders can be edited/);
  assert.match(item, /REMINDER\.CANCEL/);
  assert.match(retry, /Only failed reminders can be retried/);
  assert.match(retry, /REMINDER\.RETRY/);
  assert.match(ui, /Reminder center/);
  assert.match(ui, /Retry now/);
});

test("administration metrics and audit history come from the database", async () => {
  const [overview, ui, styles] = await Promise.all([
    read("app/api/admin/overview/route.ts"),
    read("app/northline-app.tsx"),
    read("app/globals.css"),
  ]);
  assert.match(overview, /requireAdmin\(\)/);
  assert.match(overview, /SELECT COUNT\(\*\) count FROM boards/);
  assert.match(overview, /FROM audit_log a/);
  assert.match(overview, /activeTimers/);
  assert.match(overview, /failedReminders/);
  assert.match(overview, /describeAudit/);
  assert.match(overview, /private or removed board/);
  assert.match(ui, /Administration overview/);
  assert.match(ui, /Currently clocked in/);
  assert.match(ui, /Local backup/);
  assert.match(styles, /admin-status-grid/);
  assert.match(styles, /html\[data-theme="dark"\] \.admin-dashboard/);
});

test("release health and workflow tools remain permission constrained", async () => {
  const [health, search, duplicate, activity, backup, restore] =
    await Promise.all([
      read("app/api/admin/health/route.ts"),
      read("app/api/search/route.ts"),
      read("app/api/tasks/[id]/duplicate/route.ts"),
      read("app/api/boards/[id]/activity/route.ts"),
      read("ops/backup/northline-backup.sh"),
      read("ops/backup/northline-restore-test.sh"),
    ]);
  assert.match(health, /requireAdmin\(\)/);
  assert.match(health, /quick_check/);
  assert.match(health, /sendDiscordDirectMessage/);
  assert.match(health, /cpuUsagePercent/);
  assert.match(health, /memoryUsedPercent/);
  assert.match(search, /b\.owner_id=\?/);
  assert.match(search, /bm\.user_id=\?/);
  assert.match(duplicate, /canEdit\(boardPermission/);
  assert.match(activity, /boardPermission/);
  assert.match(backup, /backup\.json/);
  assert.match(restore, /restore\.json/);
});

test("dark mode is persistent and application-wide", async () => {
  const [ui, styles] = await Promise.all([
    read("app/northline-app.tsx"),
    read("app/globals.css"),
  ]);
  assert.match(ui, /northline-theme/);
  assert.match(ui, /document\.documentElement\.dataset\.theme/);
  assert.match(ui, /prefers-color-scheme: dark/);
  assert.match(ui, /Switch to/);
  assert.match(styles, /html\[data-theme="dark"\]/);
  assert.match(styles, /\.auth-screen/);
  assert.match(styles, /\.health-card/);
  assert.match(styles, /\.reminder-panel/);
  assert.match(styles, /\.modal/);
});

test("public documentation covers the deployed platform without private network addresses", async () => {
  const docs = await Promise.all(
    [
      "README.md",
      "ROADMAP.md",
      "SECURITY.md",
      "CHANGELOG.md",
      "docs/FEATURES.md",
      "docs/ARCHITECTURE.md",
      "docs/OPERATIONS.md",
      "docs/ONBOARDING.md",
      "docs/RELEASE-CHECKLIST.md",
      "docs/FUTURE-PLANS.md",
      "ops/backup/README.md",
      "infra/authentik/README.md",
      "infra/mail/README.md",
    ].map(read),
  );
  const combined = docs.join("\n");
  for (const topic of [
    "dark theme",
    "global search",
    "board activity",
    "task duplication",
    "health dashboard",
    "Task Buddy",
    "Authentik",
    "restore test",
  ])
    assert.match(combined, new RegExp(topic, "i"));
  assert.match(combined, /streaming calendars/i);
  assert.match(combined, /collaboration requests/i);
  assert.doesNotMatch(combined, /192\.168\.\d+\.\d+/);
  assert.doesNotMatch(combined, /Password1!/);
});

test("beta security boundary rejects CSRF and throttles sensitive endpoints", async () => {
  const proxy = await read("proxy.ts");
  assert.match(proxy, /Cross-origin request rejected/);
  assert.match(proxy, /sec-fetch-site/);
  assert.match(proxy, /NORTHLINE_PUBLIC_URL/);
  assert.match(proxy, /Too many sign-in attempts/);
  assert.match(proxy, /Administrative request limit exceeded/);
  assert.match(proxy, /Retry-After/);
});

test("users can inspect and revoke only their own sessions", async () => {
  const [schema, auth, route, ui] = await Promise.all([
    read("lib/db.ts"),
    read("lib/auth.ts"),
    read("app/api/settings/sessions/route.ts"),
    read("app/northline-app.tsx"),
  ]);
  assert.match(schema, /user_agent/);
  assert.match(schema, /created_ip/);
  assert.match(auth, /currentSessionHash/);
  assert.match(route, /WHERE user_id=\?/);
  assert.match(route, /token_hash<>\?/);
  assert.match(route, /Sign out normally/);
  assert.match(ui, /Revoke all others/);
});

test("directory, login, and Discord identities remain separate", async () => {
  const [callback, ui, schema, sync, discordSource, worker] = await Promise.all(
    [
      read("app/api/auth/oidc/callback/route.ts"),
      read("app/northline-app.tsx"),
      read("lib/db.ts"),
      read("lib/authentik-directory.ts"),
      read("ops/identity/configure-discord-source.py"),
      read("lib/reminder-worker.ts"),
    ],
  );
  assert.ok(
    callback.indexOf("WHERE oidc_subject=?") <
      callback.indexOf("WHERE email=? COLLATE NOCASE"),
  );
  assert.match(callback, /OIDC_IDENTITY_CONFLICT/);
  assert.match(callback, /!byEmail\.directoryId/);
  assert.match(callback, /auth_error=identity_conflict/);
  assert.match(ui, /Northline could not safely match this identity/);
  assert.match(schema, /directory_id TEXT/);
  assert.match(schema, /discord_user_id TEXT/);
  assert.match(sync, /WHERE directory_id=\?/);
  assert.doesNotMatch(sync, /oidc_subject=excluded\.oidc_subject/);
  assert.match(sync, /user_connections\/all/);
  assert.match(sync, /discordMemberProfile/);
  assert.match(discordSource, /"promoted": False/);
  assert.match(discordSource, /selected_sources\.remove/);
  assert.match(worker, /discordUserId/);
  assert.match(worker, /COALESCE\(t\.created_by/);
  assert.match(worker, /sendDiscordDirectMessage/);
});

test("schema upgrades and operational failures are observable", async () => {
  const [schema, health, backup, restore, compose] = await Promise.all([
    read("lib/db.ts"),
    read("app/api/admin/health/route.ts"),
    read("ops/backup/northline-backup.sh"),
    read("ops/backup/northline-restore-test.sh"),
    read("compose.yaml"),
  ]);
  assert.match(schema, /schema_migrations/);
  assert.match(schema, /session inventory and beta hardening/);
  assert.match(health, /migrationVersion/);
  assert.match(backup, /Backup failed/);
  assert.match(restore, /Restore validation failed/);
  assert.match(compose, /healthcheck/);
});

test("authorization matrix is enforced at every board capability", async () => {
  const routes = await Promise.all(
    [
      "app/api/boards/[id]/route.ts",
      "app/api/boards/[id]/tasks/route.ts",
      "app/api/boards/[id]/members/route.ts",
      "app/api/boards/[id]/notifications/route.ts",
      "app/api/boards/[id]/activity/route.ts",
      "app/api/tasks/[id]/route.ts",
      "app/api/tasks/[id]/duplicate/route.ts",
      "app/api/tasks/[id]/comments/route.ts",
      "app/api/reminders/route.ts",
      "app/api/search/route.ts",
    ].map(read),
  );
  const joined = routes.join("\n");
  assert.match(joined, /boardPermission/);
  assert.match(joined, /canEdit/);
  assert.match(joined, /canShare/);
  assert.match(joined, /b\.owner_id=\?/);
  assert.match(joined, /bm\.user_id=\?/);
});

test("site administration does not bypass private board membership", async () => {
  const [permissions, boards, detail, search, reminders, ui] =
    await Promise.all([
      read("lib/boards.ts"),
      read("app/api/boards/route.ts"),
      read("app/api/boards/[id]/route.ts"),
      read("app/api/search/route.ts"),
      read("app/api/reminders/route.ts"),
      read("app/northline-app.tsx"),
    ]);
  for (const source of [permissions, boards, search, reminders])
    assert.doesNotMatch(
      source,
      /\?='Admin'|role==="Admin"|permission==="admin"/,
    );
  assert.match(detail, /const assignees\s*=\s*db/);
  assert.match(
    detail,
    /u\.id=b\.owner_id OR u\.id=w\.owner_id OR bm\.user_id IS NOT NULL OR wm\.user_id IS NOT NULL/,
  );
  assert.match(ui, /people=\{boardData\?\.assignees \|\| \[\]\}/);
  assert.match(ui, /directoryPeople=\{directoryUsers\}/);
});

test("board workflow columns are persistent, mutable, and task safe", async () => {
  const [schema, collection, item, detail, createTask, updateTask, ui, styles] =
    await Promise.all([
      read("lib/db.ts"),
      read("app/api/boards/[id]/columns/route.ts"),
      read("app/api/boards/[id]/columns/[columnId]/route.ts"),
      read("app/api/boards/[id]/route.ts"),
      read("app/api/boards/[id]/tasks/route.ts"),
      read("app/api/tasks/[id]/route.ts"),
      read("app/northline-app.tsx"),
      read("app/v2.css"),
    ]);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS board_columns/);
  assert.match(schema, /custom board workflow columns/);
  assert.match(schema, /CREATE TABLE tasks_dynamic/);
  for (const route of [collection, item])
    assert.match(route, /canEdit\(boardPermission/);
  assert.match(collection, /COLUMN\.REORDER/);
  assert.match(item, /destinationId/);
  assert.match(item, /UPDATE tasks SET status=/);
  assert.match(item, /A board must keep at least one column/);
  assert.match(detail, /column_key key/);
  assert.match(createTask, /SELECT 1 FROM board_columns/);
  assert.match(updateTask, /SELECT 1 FROM board_columns/);
  assert.match(ui, /function ColumnManager/);
  assert.match(ui, /Move tasks to/);
  assert.match(ui, /data\.columns\.map/);
  assert.match(styles, /\.task-actions/);
});

test("personal and shared workspaces inherit board access safely", async () => {
  const [
    schema,
    permissions,
    boards,
    workspaces,
    members,
    search,
    reminders,
    ui,
    announce,
  ] = await Promise.all([
    read("lib/db.ts"),
    read("lib/boards.ts"),
    read("app/api/boards/route.ts"),
    read("app/api/workspaces/route.ts"),
    read("app/api/workspaces/[id]/members/route.ts"),
    read("app/api/search/route.ts"),
    read("app/api/reminders/route.ts"),
    read("app/northline-app.tsx"),
    read("ops/release/announce-discord.mjs"),
  ]);
  for (const table of ["workspaces", "workspace_members"])
    assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(schema, /ensurePersonalWorkspace/);
  assert.match(schema, /personal and shared workspaces/);
  assert.match(permissions, /workspace_permission/);
  assert.match(boards, /workspaceId/);
  assert.match(boards, /workspace_members/);
  assert.match(workspaces, /kind\).*shared|kind.*shared/s);
  assert.match(members, /WORKSPACE\.SHARE/);
  assert.match(search, /workspace_members/);
  assert.match(reminders, /workspace_members/);
  assert.match(ui, /New shared workspace/);
  assert.match(ui, /Manage workspace/);
  assert.match(announce, /New Push to/);
  assert.match(announce, /GitHub Push Event/);
  assert.match(announce, /allowed_mentions/);
});

test("release announcements follow successful deployments without duplicates", async () => {
  const deploy = await read("ops/release/deploy-production.sh");
  assert.match(deploy, /docker compose up -d --build/);
  assert.match(deploy, /health.*healthy/s);
  assert.match(deploy, /last-announced-deploy/);
  assert.match(deploy, /announce-discord\.mjs/);
  assert.ok(
    deploy.indexOf('health" = "healthy') <
      deploy.indexOf("announce-discord.mjs"),
  );
  assert.ok(
    deploy.indexOf("announce-discord.mjs") < deploy.indexOf("printf '%s\\n'"),
  );
});

test("My Work aggregates only accessible assignments and preserves edit permissions", async () => {
  const [route, ui, taskRoute, styles] = await Promise.all([
    read("app/api/my-work/route.ts"),
    read("app/northline-app.tsx"),
    read("app/api/tasks/[id]/route.ts"),
    read("app/globals.css"),
  ]);
  assert.match(route, /t\.assignee_id=\?/);
  assert.match(
    route,
    /b\.owner_id=\? OR w\.owner_id=\? OR bm\.user_id IS NOT NULL OR wm\.user_id IS NOT NULL/,
  );
  assert.match(route, /CASE[\s\S]*workspace_members/);
  assert.match(await read("lib/db.ts"), /tasks_assignee_idx/);
  assert.doesNotMatch(route, /role.*Admin|Admin.*role/);
  assert.match(ui, /Overdue/);
  assert.match(ui, /Due soon/);
  assert.match(ui, /Unscheduled/);
  assert.match(ui, /Completed/);
  assert.match(ui, /Filter by workspace|Filter by board/i);
  assert.match(ui, /task\.permission\s*!==\s*"viewer"/);
  for (const field of ["status", "priority", "due_date"])
    assert.match(ui, new RegExp(field));
  assert.match(taskRoute, /canEdit\(boardPermission/);
  assert.match(styles, /\.my-work-page/);
});

test("editing, reminder time, and completed task lifecycle are safe", async () => {
  const [schema, task, archive, board, search, myWork, ui, reminders] =
    await Promise.all([
      read("lib/db.ts"),
      read("app/api/tasks/[id]/route.ts"),
      read("app/api/boards/[id]/archive/route.ts"),
      read("app/api/boards/[id]/route.ts"),
      read("app/api/search/route.ts"),
      read("app/api/my-work/route.ts"),
      read("app/northline-app.tsx"),
      read("app/reminder-center.tsx"),
    ]);
  assert.match(schema, /archived_at/);
  assert.match(schema, /recoverable task archive/);
  assert.match(task, /Only completed tasks can be archived/);
  assert.match(archive, /boardPermission/);
  for (const source of [board, search, myWork])
    assert.match(source, /archived_at IS NULL/);
  assert.match(ui, /Show completed/);
  assert.match(ui, /Task archive/);
  assert.match(ui, /Discard your unsaved changes/);
  assert.match(ui, /Array\.from\(\{\s*length:\s*12\s*\}/);
  assert.match(ui, /AM or PM/);
  assert.match(reminders, /Discard your unsaved changes/);
  assert.match(reminders, /Array\.from\(\{\s*length:\s*12\s*\}/);
  assert.match(reminders, /AM or PM/);
});

test("persistent personal time cards remain auditable and administrator visible", async () => {
  const [schema, timeApi, timeEntry, adminApi, timeClock, timeCard, ui] =
    await Promise.all([
      read("lib/db.ts"),
      read("app/api/time/route.ts"),
      read("app/api/time/[id]/route.ts"),
      read("app/api/admin/time/route.ts"),
      read("app/time-clock.tsx"),
      read("app/time-card.tsx"),
      read("app/northline-app.tsx"),
    ]);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS time_entries/);
  assert.match(schema, /time_entries_one_active_user_idx/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS time_entry_audit/);
  assert.match(schema, /persistent time cards and audit history/);
  assert.match(timeApi, /currentUser/);
  assert.match(timeApi, /clock-in/);
  assert.match(timeApi, /ensureNoOverlap/);
  assert.match(timeEntry, /clock-out/);
  assert.match(timeEntry, /Correction reason|reason/);
  assert.match(adminApi, /requireAdmin/);
  assert.match(timeClock, /northline-time-changed/);
  assert.match(timeClock, /setInterval/);
  assert.match(timeClock, /Time out/);
  assert.match(timeCard, /My time card/);
  assert.match(timeCard, /Manual entry/);
  assert.match(ui, /TimeClock/);
  assert.match(ui, /AdminTime/);
  assert.match(schema, /deleted_at/);
  assert.match(schema, /audited time entry deletion/);
  assert.match(timeEntry, /export async function DELETE/);
  assert.match(timeEntry, /Stop the active timer before deleting it/);
  assert.match(timeCard, /Time entry deleted/);
  assert.match(timeApi, /format.*csv/s);
  assert.match(timeEntry, /RESTORE/);
  assert.match(timeClock, /LONG_TIMER_SECONDS/);
  assert.match(timeClock, /northline-open-time-clock/);
  assert.match(timeCard, /Export CSV/);
  assert.match(timeCard, /Recently deleted/);
  assert.match(adminApi, /organization-time\.csv/);
  assert.match(ui, /Start timer/);
});

test("private calendars use opaque identifiers and explicit per-calendar permissions", async () => {
  const [schema, permissions, calendars, detail, members, events, eventRoute, ui, app] =
    await Promise.all([
      read("lib/db.ts"),
      read("lib/calendars.ts"),
      read("app/api/calendars/route.ts"),
      read("app/api/calendars/[id]/route.ts"),
      read("app/api/calendars/[id]/members/route.ts"),
      read("app/api/calendars/[id]/events/route.ts"),
      read("app/api/calendar-events/[id]/route.ts"),
      read("app/calendar-hub.tsx"),
      read("app/northline-app.tsx"),
    ]);
  for (const table of ["calendars", "calendar_members", "calendar_events", "calendar_activity"])
    assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(schema, /private calendars and selective sharing/);
  assert.match(schema, /createCalendarPublicId/);
  assert.match(schema, /createCalendarEventPublicId/);
  assert.doesNotMatch(permissions, /role.*Admin|Admin.*role/);
  assert.match(permissions, /calendarIdByKey/);
  assert.match(permissions, /calendarEventByKey/);
  assert.match(calendars, /c\.public_id id/);
  assert.match(detail, /calendarIdByKey/);
  assert.match(members, /Only the calendar owner/);
  assert.match(events, /canEditCalendar/);
  assert.match(eventRoute, /calendarEventByKey/);
  assert.match(ui, /My calendars/);
  assert.match(ui, /month.*week.*agenda/s);
  assert.match(ui, /viewer.*editor/s);
  assert.match(app, /CalendarHub/);
});
