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
    /canEdit\((?:await\s+)?boardPermission\(user,\s*task\.(?:board_id|boardId)\)\)/,
  );
  assert.match(memberRoute, /canShare\((?:await\s+)?boardPermission\(user,boardId\)\)/);
  assert.match(memberRoute, /db\.transaction\(async\(\)=>\{/);
  assert.match(memberRoute, /Invalid user/);
  assert.match(permissions, /permission==="owner"\|\|permission==="editor"/);
  assert.match(permissions, /canShare=.*permission==="owner"/);
  assert.doesNotMatch(permissions, /permission==="admin"|user\.role==="Admin"/);
});

test("directory synchronization revokes removed Authentik accounts", async () => {
  const sync = await read("lib/authentik-directory.ts");
  assert.match(sync, /groups\.includes\("Northline Admins"\)/);
  assert.match(sync, /groups\.includes\("Northline Users"\)/);
  assert.match(sync, /remote\.is_active===false\?"Suspended":"Active"/);
  assert.match(sync, /status='Active',directory_visible=0/);
  assert.match(sync, /DELETE FROM sessions WHERE user_id=/);
  assert.match(sync, /Authentik directory returned no users; refusing destructive reconciliation/);
  assert.match(sync, /Authentik directory returned no accessible Northline users; refusing destructive reconciliation/);
  assert.match(sync, /const accessibleUsers=users\.filter/);
  assert.match(sync, /for\(const remote of accessibleUsers\)/);
});

test("board data is relational and cascade-safe", async () => {
  const schema = await read("lib/db-sqlite.ts");
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
    read("lib/db-sqlite.ts"),
    read("app/api/boards/route.ts"),
    read("app/api/boards/[id]/route.ts"),
    read("lib/reminder-worker.ts"),
    read("app/northline-app.tsx"),
    read("lib/boards.ts"),
  ]);
  assert.match(boards, /created_by/);
  assert.match(boards, /b\.updated_at AS "updatedAt"/);
  assert.match(schema, /brd_\$\{randomBytes\(16\)/);
  assert.match(detail, /boardKey/);
  assert.match(worker, /creatorName/);
  assert.match(worker, /set a reminder/);
  assert.match(ui, /query\.set\("board",\s*active\.boardKey\)/);
  assert.match(permissions, /owner_id/);
});

test("PostgreSQL admin reporting preserves camelCase API fields", async () => {
  const [adminTime, overview, health, clock] = await Promise.all([
    read("app/api/admin/time/route.ts"),
    read("app/api/admin/overview/route.ts"),
    read("app/api/admin/health/route.ts"),
    read("app/time-clock.tsx"),
  ]);
  assert.match(adminTime, /AS "totalSeconds"/);
  assert.match(adminTime, /AS "weekSeconds"/);
  assert.match(adminTime, /AS "activeSince"/);
  assert.match(overview, /AS "sharedUsers"/);
  assert.match(overview, /AS "taskCount"/);
  assert.match(overview, /GROUP BY b\.id,b\.name,b\.description,b\.updated_at,u\.name/);
  assert.doesNotMatch(health, /\blinux:/);
  assert.match(clock, /Number\.isFinite\(numeric\) \? Math\.max/);
});

test("PostgreSQL board details keep the team-aware assignee query orderable", async () => {
  const detail = await read("app/api/boards/[id]/route.ts");
  assert.match(detail, /SELECT id,name,email,avatar\s+FROM \(\s*SELECT DISTINCT u\.id,u\.name,u\.email,u\.avatar/);
  assert.match(detail, /ORDER BY LOWER\(name\),id/);
  assert.doesNotMatch(detail, /SELECT DISTINCT u\.id,u\.name,u\.email,u\.avatar FROM users u[\s\S]*ORDER BY u\.name COLLATE NOCASE/);
});

test("PostgreSQL list queries order DISTINCT rows by selected or outer fields", async () => {
  const [boards, calendars, search] = await Promise.all([
    read("app/api/boards/route.ts"),
    read("app/api/calendars/route.ts"),
    read("app/api/search/route.ts"),
  ]);
  assert.match(boards, /ORDER BY "updatedAt" DESC/);
  assert.match(calendars, /FROM \(\s*SELECT DISTINCT/);
  assert.match(calendars, /ORDER BY owner_order,LOWER\(name\)/);
  assert.match(await read("app/api/collab/schedule/route.ts"), /\.all\(user\.id, to, from, user\.id, user\.id\)/);
  assert.match(search, /t\.updated_at AS "updatedAt"/);
  assert.match(search, /ORDER BY "updatedAt" DESC/);
});

test("board navigation normalizes database identifiers and keeps populated workspaces selected", async () => {
  const ui = await read("app/northline-app.tsx");
  assert.match(ui, /const normalizedBoards = \(d\.boards \|\| \[\]\)\.map/);
  assert.match(ui, /id: Number\(board\.id\)/);
  assert.match(ui, /const boardWorkspaceIds = new Set/);
  assert.match(ui, /boardWorkspaceIds\.has\(current\)/);
  assert.match(ui, /Number\(board\.navigationWorkspaceId \?\? board\.workspaceId\)/);
  assert.match(ui, /const visibleBoards = workspaceBoards/);
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
  assert.match(boardRoute, /canShare\((?:await\s+)?boardPermission/);
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
  assert.match(route, /canEdit\((?:await\s+)?boardPermission\(user,Number\(boardId\)\)\)/);
  assert.match(route, /created_by createdBy/);
  assert.match(route, /has not linked Discord/);
  assert.match(discord, /process\.env\.NORTHLINE_DISCORD_BOT_TOKEN/);
  assert.match(discord, /\/users\/@me\/channels/);
  assert.match(discord, /recipient_id/);
  assert.doesNotMatch(route, /NORTHLINE_DISCORD_BOT_TOKEN/);
  assert.match(discord, /allowed_mentions/);
  assert.match(discord, /flags:4/);
  assert.match(worker, /COALESCE\(r\.recipient_user_id,t\.created_by,r\.created_by\)/);
  assert.match(worker, /setInterval/);
  assert.match(compose, /NORTHLINE_DISCORD_BOT_TOKEN/);
});

test("board-wide reminders fan out privately to every board member", async () => {
  const [route, worker, ui] = await Promise.all([
    read("app/api/reminders/route.ts"),
    read("lib/reminder-worker.ts"),
    read("app/northline-app.tsx"),
  ]);
  assert.match(route, /SELECT DISTINCT u\.id/);
  assert.match(route, /u\.id=b\.owner_id/);
  assert.match(route, /bm\.user_id IS NOT NULL/);
  assert.match(route, /wm\.user_id IS NOT NULL/);
  assert.match(route, /recipients:ids\.length/);
  assert.match(worker, /recipient\.discord_user_id/);
  assert.match(ui, /privately delivered to every active member/);
});

test("local development uses an isolated PostgreSQL runtime", async () => {
  const [environment, compose, runtime, migration] = await Promise.all([
    read(".env.example"),
    read("compose.local-postgres.yaml"),
    read("lib/db.ts"),
    read("scripts/migrate-sqlite-to-postgres.mjs"),
  ]);
  assert.match(environment, /NORTHLINE_DB_DRIVER=postgres/);
  assert.match(environment, /127\.0\.0\.1:55432\/northline/);
  assert.match(compose, /image: postgres:18-alpine/);
  assert.match(compose, /55432:5432/);
  assert.match(compose, /NORTHLINE_DB_DRIVER=postgres/);
  assert.match(compose, /postgres:5432/);
  assert.match(runtime, /NORTHLINE_DB_DRIVER=sqlite/);
  assert.match(migration, /SQLite is kept\s+\*\s+for legacy imports and fixtures/);
});

test("manual task reminders target assigned people and format delivery guidance", async () => {
  const [route, worker, ui] = await Promise.all([
    read("app/api/reminders/route.ts"),
    read("lib/reminder-worker.ts"),
    read("app/northline-app.tsx"),
  ]);
  assert.match(route, /taskAssigneeIds/);
  assert.match(route, /recipientIds=\[\.\.\.new Set/);
  assert.match(route, /Every task assignee must link Discord/);
  assert.match(route, /recipient_user_id/);
  assert.match(worker, /COALESCE\(r\.recipient_user_id,t\.created_by,r\.created_by\)/);
  assert.match(ui, /Task reminders are sent to the assigned people/);
  assert.match(ui, /the creator when no one is assigned/);
  assert.match(ui, /settings-callout/);
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
  assert.doesNotMatch(health, /cpuUsagePercent|memoryUsedPercent|loadAverage/);
  assert.match(search, /b\.owner_id=\?/);
  assert.match(search, /bm\.user_id=\?/);
  assert.match(duplicate, /canEdit\((?:await\s+)?boardPermission/);
  assert.match(activity, /boardPermission/);
  assert.match(activity, /created_at AS/);
  assert.match(activity, /actorName/);
  assert.match(backup, /backup\.json/);
  assert.match(restore, /restore\.json/);
});

test("mutating browser requests survive short deployment interruptions", async () => {
  const [fetcher, app, calendar, collab, reminders, timeCard, timeClock] =
    await Promise.all([
      read("app/client-fetch.ts"),
      read("app/northline-app.tsx"),
      read("app/calendar-hub.tsx"),
      read("app/collab-planner.tsx"),
      read("app/reminder-center.tsx"),
      read("app/time-card.tsx"),
      read("app/time-clock.tsx"),
    ]);
  assert.match(fetcher, /502, 503, 504/);
  assert.match(fetcher, /retrying a network error could duplicate a/i);
  assert.match(fetcher, /write whose response was lost/i);
  assert.match(fetcher, /Your changes were not confirmed/);
  for (const source of [app, calendar, collab, reminders, timeCard, timeClock]) {
    assert.match(source, /resilientFetch/);
    assert.match(source, /apiErrorMessage/);
  }
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
  assert.match(styles, /\.modal-backdrop[\s\S]*overflow: auto/);
  assert.match(styles, /\.modal \{[\s\S]*max-height: calc\(100dvh - 40px\)[\s\S]*overflow-y: auto/);
});

test("search controls render as unified accessible fields", async () => {
  const ui = await read("app/northline-app.tsx");
  const styles = await read("app/globals.css");
  assert.match(ui, /function SearchIcon/);
  assert.match(ui, /className="search-icon"/);
  assert.match(styles, /\.global-search:focus-within/);
  assert.match(styles, /\.global-search input[\s\S]*background: transparent !important/);
  assert.match(styles, /\.search-icon/);
});

test("member help is searchable, actionable, and excludes administration", async () => {
  const [app, help, styles] = await Promise.all([
    read("app/northline-app.tsx"),
    read("app/help-center.tsx"),
    read("app/globals.css"),
  ]);
  assert.match(app, /Help Center/);
  assert.doesNotMatch(app, /northline-welcome-/);
  assert.match(help, /Search help topics/);
  assert.match(help, /Create and organize a board/);
  assert.match(help, /Request and manage a collab/);
  assert.match(help, /Task Buddy reminders/);
  assert.match(help, /Open this guide any time from the Help Center/);
  assert.doesNotMatch(help, /Administration/);
  assert.doesNotMatch(help, /Linux|Docker|Cloudflare|database health/i);
  assert.match(styles, /\.help-page/);
  assert.match(styles, /\.welcome-guide/);
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

test("teams are a server-authorized access boundary", async () => {
  const [schema, teamHelper, teamRoute, membersRoute, workspaceRoute, boardList, calendarRoute, collab, ui, teamsUi] = await Promise.all([
    read("lib/db-sqlite.ts"), read("lib/teams.ts"), read("app/api/teams/[id]/route.ts"),
    read("app/api/teams/[id]/members/route.ts"), read("app/api/teams/[id]/workspaces/route.ts"),
    read("app/api/boards/route.ts"), read("app/api/calendars/route.ts"), read("app/api/collab/schedule/route.ts"),
    read("app/collab-planner.tsx"), read("app/teams.tsx"),
  ]);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS teams/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS team_members/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS team_workspaces/);
  assert.match(schema, /reusable teams and team-linked workspaces/);
  assert.match(teamHelper, /team_members/);
  assert.match(teamHelper, /team_workspaces/);
  assert.match(teamRoute, /canManageTeam/);
  assert.match(membersRoute, /Only the team owner can appoint managers/);
  assert.match(workspaceRoute, /Only the workspace owner can connect it to a team/);
  assert.match(boardList, /team_workspaces/);
  assert.match(boardList, /team.owner_id/);
  assert.match(calendarRoute, /team_id/);
  assert.match(collab, /team_members/);
  assert.match(ui, /Find by team/);
  assert.match(ui, /All streamers/);
  assert.match(teamsUi, /Create a team/);
  assert.match(teamRoute, /Forbidden/);
  assert.match(teamRoute, /FROM \(\s*SELECT u\.id,u\.name,u\.email,u\.avatar,'owner' role/);
  assert.match(teamRoute, /\) members ORDER BY name COLLATE NOCASE/);
  assert.match(teamsUi, /team-color-preview/);
  assert.match(teamsUi, /normalizeTeamColor/);
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
    read("lib/db-sqlite.ts"),
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
      read("lib/db-sqlite.ts"),
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
  assert.match(callback, /authErrorRedirect\(config\.publicUrl,"identity_conflict"\)/);
  assert.match(callback, /authErrorRedirect\(config\.publicUrl,"access_denied"\)/);
  assert.match(callback, /userId=await resolveIdentity/);
  assert.match(callback, /typeof profile\.groups==="string"/);
  assert.match(callback, /OIDC access denied: expected Northline group/);
  assert.doesNotMatch(callback, /auth_error=access_denied[^\n]*request\.url/);
  assert.match(ui, /Northline could not safely match this identity/);
  assert.match(schema, /directory_id TEXT/);
  assert.match(schema, /discord_user_id TEXT/);
  assert.match(sync, /WHERE directory_id=\?/);
  assert.doesNotMatch(sync, /oidc_subject=excluded\.oidc_subject/);
  assert.match(sync, /user_connections\/all/);
  assert.match(sync, /discordMemberProfile/);
  assert.match(sync, /backfillDiscordIdentity/);
  assert.match(sync, /\.\.\.\(user\.attributes\|\|\{\}\)/);
  assert.match(callback, /syncAuthentikDirectory\(true\)/);
  assert.ok(
    callback.indexOf("await createSession(userId)") <
      callback.indexOf("void syncAuthentikDirectory(true)"),
  );
  assert.match(discordSource, /"attributes\.avatar": avatar_url/);
  assert.match(discordSource, /"promoted": False/);
  assert.match(discordSource, /selected_sources\.remove/);
  assert.match(worker, /discordUserId/);
  assert.match(worker, /COALESCE\(r\.recipient_user_id,t\.created_by,r\.created_by\)/);
  assert.match(worker, /sendDiscordDirectMessage/);
});

test("Postgres adapter casts migrated text timestamps at comparison boundaries", async () => {
  const postgres = await read("lib/db-postgres.ts");
  assert.match(postgres, /timestamp columns at comparison boundaries/);
  assert.match(postgres, /\$\{column\}::timestamptz/);
  assert.match(postgres, /CURRENT_TIMESTAMP/);
});

test("schema upgrades and operational failures are observable", async () => {
  const [schema, health, backup, restore, compose] = await Promise.all([
    read("lib/db-sqlite.ts"),
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

test("user time zones are device-synchronized and UTC-safe", async () => {
  const [schema, auth, settings, timezone, time, adminTime, notifications, ui] =
    await Promise.all([
      read("lib/db-sqlite.ts"),
      read("lib/auth.ts"),
      read("app/api/settings/timezone/route.ts"),
      read("lib/timezones.ts"),
      read("app/api/time/route.ts"),
      read("app/api/admin/time/route.ts"),
      read("lib/task-notifications.ts"),
      read("app/northline-app.tsx"),
    ]);
  assert.match(schema, /timezone TEXT NOT NULL DEFAULT 'UTC'/);
  assert.match(schema, /per-user time zones/);
  assert.match(auth, /u\.timezone/);
  assert.match(settings, /validTimezone/);
  assert.match(settings, /scheduleDueNotification/);
  assert.match(timezone, /zonedDateTimeToUtc/);
  assert.match(time, /user\.timezone/);
  assert.match(adminTime, /admin\.timezone/);
  assert.match(notifications, /17:00:00/);
  assert.match(ui, /resolvedOptions\(\)\.timeZone/);
  assert.match(ui, /Device synchronized/);
});

test("time edits preserve wall-clock duration and workspace/board identity boundaries", async () => {
  const [dateTime, timeRoute, timeEntryRoute, calendar, collab, workspace, board, ui] = await Promise.all([
    read("app/date-time.ts"),
    read("app/api/time/route.ts"),
    read("app/api/time/[id]/route.ts"),
    read("app/calendar-hub.tsx"),
    read("app/collab-planner.tsx"),
    read("app/api/workspaces/[id]/route.ts"),
    read("app/api/boards/[id]/route.ts"),
    read("app/northline-app.tsx"),
  ]);
  assert.match(dateTime, /shiftEndWithStartChange/);
  assert.match(dateTime, /oldEnd - oldStart/);
  assert.match(timeRoute, /parseDateTimeInZone\(body\.startedAt, user\.timezone\)/);
  assert.match(timeEntryRoute, /edit-clock-out/);
  assert.match(timeEntryRoute, /parseDateTimeInZone\(body\.endedAt, user\.timezone\)/);
  assert.match(calendar, /shiftEndWithStartChange/);
  assert.match(collab, /shiftEndWithStartChange/);
  assert.match(workspace, /WORKSPACE\.RENAME/);
  assert.match(workspace, /WORKSPACE\.DELETE/);
  assert.match(board, /Board IDs are permanent and cannot be changed/);
  assert.match(board, /sharedWith/);
  assert.match(ui, /Workspace name/);
  assert.doesNotMatch(ui, /<b>Board reference<\/b>/);
});

test("shared board viewers can inspect access while archive controls stay edit-only", async () => {
  const [ui, boardRoute, archiveRoute] = await Promise.all([
    read("app/northline-app.tsx"),
    read("app/api/boards/[id]/route.ts"),
    read("app/api/boards/[id]/archive/route.ts"),
  ]);
  assert.match(ui, /openModal\("members"\)/);
  assert.match(ui, /type === "members"/);
  assert.match(ui, /data\.canEdit && \([\s\S]*openModal\("archive"\)/);
  assert.match(ui, /boardAccess\.map/);
  assert.match(boardRoute, /boardOwner/);
  assert.match(boardRoute, /sharedWith/);
  assert.match(archiveRoute, /canRestore:permission!=="viewer"/);
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
  assert.match(detail, /const assignees\s*=\s*await db/);
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
      read("lib/db-sqlite.ts"),
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
    assert.match(route, /canEdit\((?:await\s+)?boardPermission/);
  assert.match(collection, /COLUMN\.REORDER/);
  assert.match(item, /destinationId/);
  assert.match(item, /UPDATE tasks SET status=/);
  assert.match(item, /A board must keep at least one column/);
  assert.match(detail, /column_key\s+AS/);
  assert.match(createTask, /SELECT 1 FROM board_columns/);
  assert.match(updateTask, /SELECT 1 FROM board_columns/);
  assert.match(ui, /function ColumnManager/);
  assert.match(ui, /Move tasks to/);
  assert.match(ui, /data\.columns\.map/);
  assert.match(ui, /drop-target/);
  assert.match(ui, /drag it to another category/);
  assert.match(styles, /\.task-actions/);
});

test("personal and shared workspaces inherit board access safely", async () => {
  const [
    schema,
    permissions,
    boards,
    workspaces,
    workspaceQueries,
    members,
    search,
    reminders,
    ui,
    announce,
  ] = await Promise.all([
    read("lib/db-sqlite.ts"),
    read("lib/boards.ts"),
    read("app/api/boards/route.ts"),
    read("app/api/workspaces/route.ts"),
    read("lib/workspaces.ts"),
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
  assert.match(permissions, /workspacePermission/);
  assert.match(boards, /workspaceId/);
  assert.match(boards, /workspace_members/);
  assert.match(boards, /navigationWorkspaceId/);
  assert.match(boards, /AS "navigationWorkspaceId"/);
  assert.match(boards, /AS "workspaceId"/);
  assert.match(boards, /Shared with me/);
  assert.match(boards, /navigationWorkspaceId===0/);
  assert.match(workspaces, /kind\).*shared|kind.*shared/s);
  assert.match(workspaceQueries, /AS "workspaceKey"/);
  assert.match(workspaceQueries, /AS "boardCount"/);
  assert.match(members, /WORKSPACE\.SHARE/);
  assert.match(search, /workspace_members/);
  assert.match(reminders, /workspace_members/);
  assert.match(ui, /New shared workspace/);
  assert.match(ui, /Manage workspace/);
  assert.match(ui, /navigationWorkspaceId \?\? board\.workspaceId/);
  assert.match(announce, /New Push to/);
  assert.match(announce, /GitHub Push Event/);
  assert.match(announce, /allowed_mentions/);
});

test("board sharing keeps the active board mounted during refresh", async () => {
  const ui = await read("app/northline-app.tsx");
  assert.match(ui, /current\?\.board\.id === id \? current : null/);
  assert.match(ui, /disabled=\{busy \|\| !selectedUser\}/);
  assert.match(ui, /await refresh\(\);\s*setSelectedUser\(""\);\s*notify\("Board access updated"\)/);
});

test("shared board detail ordering is PostgreSQL-safe", async () => {
  const route = await read("app/api/boards/[id]/route.ts");
  assert.match(route, /SELECT DISTINCT u\.id,u\.name,u\.avatar[\s\S]*ORDER BY u\.name, u\.id/);
  assert.match(route, /SELECT DISTINCT u\.id,u\.name,u\.email,u\.avatar,access\.permission[\s\S]*ORDER BY u\.name,u\.id/);
  assert.doesNotMatch(route, /SELECT DISTINCT u\.id,u\.name,u\.avatar[\s\S]*ORDER BY u\.name COLLATE NOCASE/);
  assert.doesNotMatch(route, /access\.permission[\s\S]*ORDER BY LOWER\(u\.name\),u\.id/);
});

test("moving boards preserves access and is authorized server-side", async () => {
  const route = await read("app/api/boards/[id]/route.ts");
  const overview = await read("app/api/admin/overview/route.ts");
  const ui = await read("app/northline-app.tsx");
  assert.match(route, /canShare\(permission\)/);
  assert.match(route, /workspacePermission\(user, targetWorkspace\)/);
  assert.match(route, /board_members[\s\S]*ON CONFLICT\(board_id,user_id\)/);
  assert.match(route, /direct shares preserved and inherited access retained/);
  assert.match(route, /db\.transaction\(async \(\) =>/);
  assert.match(route, /BOARD\.MOVE/);
  assert.match(overview, /BOARD\.MOVE/);
  assert.match(ui, /Move this board to the selected workspace/);
  assert.match(ui, /Direct board shares stay in place/);
  assert.match(ui, /notificationsDirty/);
  assert.match(ui, /Board move.*failed/);
});

test("release announcements follow successful deployments without duplicates", async () => {
  const deploy = await read("ops/release/deploy-production.sh");
  const announce = await read("ops/release/announce-discord.mjs");
  const workflow = await read(".github/workflows/release-announcement.yml");
  assert.match(deploy, /docker compose up -d --build/);
  assert.match(deploy, /health.*healthy/s);
  assert.match(deploy, /last-announced-deploy/);
  assert.match(deploy, /last-announced-deploy-\$\{channel_hash\}/);
  assert.match(deploy, /previous_version/);
  assert.match(deploy, /Discord announcement skipped because the semver major version did not change/);
  assert.match(deploy, /announce-discord\.mjs/);
  assert.match(workflow, /Check for a semver major-version change/);
  assert.match(workflow, /fetch-depth: 2/);
  assert.match(workflow, /-n "\$previous_major"/);
  assert.match(workflow, /steps\.major\.outputs\.changed == 'true'/);
  assert.match(announce, /NORTHLINE_RELEASE_CHANNEL_IDS/);
  assert.match(announce, /Promise\.all/);
  assert.match(announce, /description:`\$\{shortCommit\} \$\{version\}: \$\{summary\}`/);
  assert.doesNotMatch(announce, /commitUrl|icon_url|https:\/\/github\.com/);
  assert.ok(
    deploy.indexOf('health" = "healthy') <
      deploy.indexOf("announce-discord.mjs"),
  );
  assert.ok(
    deploy.indexOf("announce-discord.mjs") <
      deploy.indexOf('printf \'%s\\n\' "$commit" > "$marker"'),
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
  assert.match(await read("lib/db-sqlite.ts"), /tasks_assignee_idx/);
  assert.doesNotMatch(route, /role.*Admin|Admin.*role/);
  assert.match(ui, /Overdue/);
  assert.match(ui, /Due soon/);
  assert.match(ui, /Unscheduled/);
  assert.match(ui, /Completed/);
  assert.match(ui, /Filter by workspace|Filter by board/i);
  assert.match(ui, /task\.permission\s*!==\s*"viewer"/);
  for (const field of ["status", "priority", "due_date"])
    assert.match(ui, new RegExp(field));
  assert.match(taskRoute, /canEdit\((?:await\s+)?boardPermission/);
  assert.match(styles, /\.my-work-page/);
});

test("editing, reminder time, and completed task lifecycle are safe", async () => {
  const [schema, task, archive, board, search, myWork, ui, reminders] =
    await Promise.all([
      read("lib/db-sqlite.ts"),
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

test("shared task discussions are available without opening the editor", async () => {
  const [comments, ui, styles] = await Promise.all([
    read("app/api/tasks/[id]/comments/route.ts"),
    read("app/northline-app.tsx"),
    read("app/globals.css"),
  ]);
  assert.match(comments, /boardPermission/);
  assert.match(comments, /5,000 characters or fewer/);
  assert.match(ui, /task-comments/);
  assert.match(ui, /Open discussion for/);
  assert.match(ui, /Discuss this task with everyone who can access the board/);
  assert.match(styles, /comment-quick-button/);
});

test("persistent personal time cards remain auditable and administrator visible", async () => {
  const [schema, timeApi, timeEntry, adminApi, timeClock, timeCard, ui] =
    await Promise.all([
      read("lib/db-sqlite.ts"),
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
  assert.match(timeApi, /timeOptions\(user\)/);
  const timeOptions = await read("lib/time-entries.ts");
  assert.match(timeOptions, /accessibleBoardIds\(user\)/);
  assert.doesNotMatch(timeOptions, /FROM boards b[\s\S]*LEFT JOIN board_members/);
  assert.match(timeEntry, /RESTORE/);
  assert.match(timeClock, /LONG_TIMER_SECONDS/);
  assert.match(timeClock, /northline-open-time-clock/);
  assert.match(timeCard, /Export CSV/);
  assert.match(timeCard, /Recently deleted/);
  assert.match(adminApi, /organization-time\.csv/);
  assert.match(ui, /Start timer/);
});

test("core workflow supports authorized multi-assignees and editable pauseable timers", async () => {
  const [schema, assignments, createTask, updateTask, myWork, timeEntry, clock, card, notifications, ui, boardRoute, styles] = await Promise.all([
    read("lib/db-sqlite.ts"),
    read("lib/task-assignments.ts"),
    read("app/api/boards/[id]/tasks/route.ts"),
    read("app/api/tasks/[id]/route.ts"),
    read("app/api/my-work/route.ts"),
    read("app/api/time/[id]/route.ts"),
    read("app/time-clock.tsx"),
    read("app/time-card.tsx"),
    read("lib/task-notifications.ts"),
    read("app/northline-app.tsx"),
    read("app/api/boards/[id]/route.ts"),
    read("app/globals.css"),
  ]);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS task_assignees/);
  assert.match(schema, /multi-assignee tasks and pauseable time entries/);
  assert.match(assignments, /validateAssigneeIds/);
  assert.match(createTask, /assigneeIds/);
  assert.match(updateTask, /assignee_ids|assigneeIds/);
  assert.match(myWork, /task_assignees/);
  assert.match(timeEntry, /action === "pause"/);
  assert.match(timeEntry, /action === "resume"/);
  assert.match(timeEntry, /EDIT_CLOCK_IN/);
  assert.match(clock, /Save time in/);
  assert.match(clock, /Pause|Resume/);
  assert.match(card, /updateTimeIn/);
  assert.match(notifications, /assigneeIds/);
  assert.match(ui, /assignee-picker/);
  assert.match(ui, /aria-multiselectable/);
  assert.match(assignments, /SELECT assignee_id assigneeId FROM tasks WHERE id=\?/);
  assert.match(boardRoute, /SELECT t\.assignee_id FROM tasks t WHERE t\.id=\?/);
  assert.match(styles, /\.comment > \.avatar/);
});

test("private calendars use opaque identifiers and explicit per-calendar permissions", async () => {
  const [
    schema,
    permissions,
    calendars,
    detail,
    members,
    events,
    eventRoute,
    ui,
    app,
  ] = await Promise.all([
    read("lib/db-sqlite.ts"),
    read("lib/calendars.ts"),
    read("app/api/calendars/route.ts"),
    read("app/api/calendars/[id]/route.ts"),
    read("app/api/calendars/[id]/members/route.ts"),
    read("app/api/calendars/[id]/events/route.ts"),
    read("app/api/calendar-events/[id]/route.ts"),
    read("app/calendar-hub.tsx"),
    read("app/northline-app.tsx"),
  ]);
  for (const table of [
    "calendars",
    "calendar_members",
    "calendar_events",
    "calendar_activity",
  ])
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
  assert.match(app, /CollabPlanner/);
  assert.match(app, /Collab planner/);
  assert.match(app, /view === "collabs"/);
  assert.match(ui, /month.*week.*agenda/s);
  assert.match(ui, /viewer.*editor/s);
  assert.match(app, /CalendarHub/);
});

test("the PostgreSQL driver preserves camelCase API aliases", async () => {
  const postgres = await read("lib/db-postgres.ts"),
    compatibility = await read("lib/postgres-compat.ts");
  assert.match(postgres, /quoteCamelCaseAliases/);
  assert.match(postgres, /\(\?=\\s\+RETURNING\\b\|;\|\$\)/);
  assert.match(postgres, /generated-id RETURNING clause after the compatibility conflict/);
  assert.match(compatibility, /PostgreSQL folds unquoted identifiers/);
  assert.match(compatibility, /AS "\$\{alias\}"/);
  assert.match(compatibility, /withBareAlias/);
});

test("calendar stabilization keeps reminders and recovery private", async () => {
  const [
    schema,
    detail,
    restoreCalendar,
    restoreEvent,
    reminders,
    worker,
    ui,
    styles,
  ] = await Promise.all([
    read("lib/db-sqlite.ts"),
    read("app/api/calendars/[id]/route.ts"),
    read("app/api/calendars/[id]/restore/route.ts"),
    read("app/api/calendar-events/[id]/restore/route.ts"),
    read("app/api/calendar-events/[id]/reminders/route.ts"),
    read("lib/reminder-worker.ts"),
    read("app/calendar-hub.tsx"),
    read("app/globals.css"),
  ]);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS calendar_reminders/);
  assert.match(schema, /calendar reminders and recoverable deletion/);
  assert.match(schema, /ALTER TABLE calendars ADD COLUMN deleted_at/);
  assert.match(schema, /ALTER TABLE calendar_events ADD COLUMN deleted_at/);
  assert.match(detail, /permission\s*===\s*"owner"[\s\S]*deletedEvents/);
  assert.match(restoreCalendar, /owner_id=\?/);
  assert.match(restoreCalendar, /datetime\('now','-30 days'\)/);
  assert.match(
    restoreEvent,
    /(?:await\s+)?calendarPermission\(user, event\.calendarId\) !== "owner"/,
  );
  assert.match(reminders, /(?:await\s+)?calendarPermission\(user, event\.calendarId\)/);
  assert.match(reminders, /recipient_user_id/);
  assert.match(worker, /calendar_reminders/);
  assert.match(worker, /sendDiscordDirectMessage/);
  assert.match(ui, /Calendar activity/);
  assert.match(ui, /Recently deleted/);
  assert.match(ui, /Task Buddy reminder/);
  assert.match(ui, /Discard your unsaved event changes/);
  assert.match(styles, /\.my-work-metrics article\.danger/);
  assert.match(styles, /\.audit-row > span\.audit-event-icon/);
});

test("stream collaboration discovery preserves private calendar boundaries", async () => {
  const [
    schema,
    postgresSchema,
    schedule,
    requests,
    response,
    proposeReschedule,
    respondReschedule,
    worker,
    ui,
    styles,
  ] = await Promise.all([
    read("lib/db-sqlite.ts"),
    read("lib/db-postgres.ts"),
    read("app/api/collab/schedule/route.ts"),
    read("app/api/collab/requests/route.ts"),
    read("app/api/collab/requests/[id]/route.ts"),
    read("app/api/collab/requests/[id]/reschedule/route.ts"),
    read("app/api/collab/reschedule/[proposalId]/route.ts"),
    read("lib/reminder-worker.ts"),
    read("app/collab-planner.tsx"),
    read("app/globals.css"),
  ]);
  assert.match(schema, /stream schedules and collaboration requests/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS collab_requests/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS collab_notifications/);
  assert.match(
    schema,
    /CREATE TABLE IF NOT EXISTS collab_request_participants/,
  );
  assert.match(schema, /multi-user collaboration participants/);
  assert.match(
    schema,
    /CREATE TABLE IF NOT EXISTS collab_reschedule_proposals/,
  );
  assert.match(
    schema,
    /CREATE TABLE IF NOT EXISTS collab_reschedule_responses/,
  );
  assert.match(schema, /collaboration reschedule proposals/);
  assert.match(postgresSchema, /ensureCollabSchema/);
  assert.match(postgresSchema, /runPostgresSchemaMigrations/);
  assert.match(postgresSchema, /pg_advisory_xact_lock/);
  assert.match(postgresSchema, /calendar_events_collab_request_id_fkey/);
  assert.match(postgresSchema, /calendar_events_collab_request_idx/);
  assert.match(postgresSchema, /schema hardening and collaboration integrity/);
  assert.match(schema, /northline_v26_calendar_events_collab_request_insert/);
  assert.match(schema, /northline_v26_\$\{table\}_\$\{column\}/);
  assert.match(schema, /schema hardening and collaboration integrity/);
  assert.match(postgresSchema, /CREATE TABLE IF NOT EXISTS "collab_requests"/);
  assert.match(
    postgresSchema,
    /CREATE TABLE IF NOT EXISTS "collab_request_participants"/,
  );
  assert.match(schedule, /c\.calendar_type='streaming'/);
  assert.match(schedule, /c\.visibility IN \('team','public'\)/);
  assert.match(schedule, /c\.visibility='public' OR \(u\.status='Active'/);
  assert.match(schedule, /event\.visibility === "busy"/);
  assert.match(schedule, /seen\.has\(requestId\)/);
  assert.match(requests, /canEditCalendar\((?:await\s+)?calendarPermission/);
  assert.match(requests, /recipientIds\.includes\(source\.ownerId\)/);
  assert.match(requests, /recipientIds\.length > 20/);
  assert.match(requests, /for \(const recipientId of recipientIds\)/);
  assert.match(response, /db\.transaction/);
  assert.match(response, /createCalendarEventPublicId/);
  assert.match(response, /collab_request_participants/);
  assert.match(response, /participantUserId/);
  assert.match(response, /group time cannot change after someone has accepted/);
  assert.match(response, /SET status='cancelled',deleted_at=CURRENT_TIMESTAMP/);
  assert.match(response, /Only the organizer can cancel the collaboration/);
  assert.match(proposeReschedule, /accepted collaboration participants/);
  assert.match(proposeReschedule, /collab_reschedule_responses/);
  assert.match(
    respondReschedule,
    /UPDATE calendar_events SET start_at=\?,end_at=\?/,
  );
  assert.match(respondReschedule, /remaining\s*===\s*0/);
  assert.match(response, /scheduleAutomaticReminders/);
  assert.match(response, /30 \* 60 \* 1000/);
  assert.match(response, /INSERT INTO calendar_reminders/);
  assert.match(schema, /Collab starts in 30 minutes:/);
  assert.match(respondReschedule, /UPDATE calendar_reminders SET remind_at=/);
  assert.match(worker, /collab_notifications/);
  assert.match(worker, /Northline collab update/);
  assert.match(ui, /Team stream schedule/);
  assert.match(ui, /showPastCollabs/);
  assert.match(ui, /Show past collabs/);
  assert.match(ui, /hideCancelledCollabs/);
  assert.match(ui, /Hide cancelled collabs/);
  assert.match(ui, /setHideCancelledCollabs\] = useState\(true\)/);
  assert.match(ui, /request\.status === "cancelled"/);
  assert.match(ui, /visibleRequests/);
  assert.match(ui, /visibleEvents/);
  assert.match(ui, /CollabPlannerBoundary/);
  assert.match(ui, /account-wide/);
  assert.doesNotMatch(ui, /workspace\. Your boards/);
  assert.match(ui, /Promise\.allSettled/);
  assert.match(ui, /normalizeRequest/);
  assert.match(ui, /normalizeEvent/);
  assert.ok(ui.includes("Array.isArray(schedule?.events)"));
  assert.ok(ui.toLowerCase().includes("collab planner couldn&apos;t load"));
  assert.match(ui, /collabRequestId/);
  assert.match(ui, /Ask to collab/);
  assert.match(ui, /Reschedule collab/);
  assert.match(ui, /Cancel collab for everyone/);
  assert.match(ui, /automatically reminds every accepted member 30 minutes before/);
  assert.match(ui, /Search streamers/);
  assert.match(ui, /availableStreamers/);
  assert.match(ui, /streamerPickerOpen/);
  assert.match(ui, /collab-selected-streamers/);
  assert.match(ui, /role="combobox"/);
  assert.match(styles, /\.collab-grid/);
  assert.match(styles, /\.collab-picker-search/);
  assert.match(styles, /\.collab-selected-streamers/);
  assert.match(styles, /\.collab-error/);
});

test("directory profiles expose only explicitly public stream schedules", async () => {
  const directory = await read("app/api/directory/route.ts");
  const schedule = await read(
    "app/api/directory/[id]/stream-schedule/route.ts",
  );
  const ui = await read("app/northline-app.tsx");
  const styles = await read("app/globals.css");
  assert.match(directory, /publicStreamCalendarCount/);
  assert.match(directory, /c\.visibility='public'/);
  assert.match(directory, /\) AS publicStreamCalendarCount/);
  assert.match(directory, /\) AS publicStreamCalendarName/);
  assert.match(schedule, /calendar_type='streaming'/);
  assert.match(schedule, /c\.visibility='public'/);
  assert.match(schedule, /e\.visibility IN \('calendar','public'\)/);
  assert.match(schedule, /e\.status!='cancelled'/);
  assert.match(ui, /View public stream schedule/);
  assert.match(ui, /No public stream schedule/);
  assert.match(styles, /\.public-schedule-events/);
});

test("admin health works with the PostgreSQL driver", async () => {
  const health = await read("app/api/admin/health/route.ts");
  assert.match(health, /NORTHLINE_DB_DRIVER === "postgres"/);
  assert.match(health, /SELECT 1 AS ok/);
  assert.match(health, /pg_database_size\(current_database\(\)\)/);
  assert.match(health, /fs\.statfsSync\(process\.cwd\(\)\)/);
  assert.match(health, /fs\.existsSync\(databasePath\)/);
});

test("emergency management identities remain outside member-facing directories", async () => {
  const schema = await read("lib/db-sqlite.ts");
  const sync = await read("lib/authentik-directory.ts");
  const directory = await read("app/api/directory/route.ts");
  const collabDirectory = await read("app/api/collab/schedule/route.ts");
  const collabRequests = await read("app/api/collab/requests/route.ts");
  assert.match(schema, /directory_visible/);
  assert.match(schema, /management identity directory visibility/);
  assert.match(schema, /auth_source='local' AND role='Admin'/);
  assert.doesNotMatch(sync, /is_superuser/);
  assert.match(sync, /directory_visible=1/);
  assert.match(directory, /u\.directory_visible=1/);
  assert.match(collabDirectory, /directory_visible=1/);
  assert.match(collabRequests, /directory_visible=1/);
});

test("member contact details stay behind authenticated contact cards", async () => {
  const schema = await read("lib/db-sqlite.ts");
  const sync = await read("lib/authentik-directory.ts");
  const directory = await read("app/api/directory/route.ts");
  const ui = await read("app/northline-app.tsx");
  const styles = await read("app/globals.css");
  assert.match(schema, /discord_username/);
  assert.match(schema, /directory Discord contact profiles/);
  assert.match(sync, /discordUsername/);
  assert.match(directory, /discord_username discordUsername/);
  assert.match(ui, /Contact card/);
  assert.match(ui, /Discord not linked/);
  assert.match(ui, /mailto:/);
  assert.match(styles, /\.contact-card-details/);
});
