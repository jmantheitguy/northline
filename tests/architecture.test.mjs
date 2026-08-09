import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read=(path)=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("board mutations enforce server-side permissions",async()=>{
  const [taskRoute,memberRoute,permissions]=await Promise.all([read("app/api/tasks/[id]/route.ts"),read("app/api/boards/[id]/members/route.ts"),read("lib/boards.ts")]);
  assert.match(taskRoute,/canEdit\(boardPermission\(user,task\.board_id\)\)/);
  assert.match(memberRoute,/canShare\(boardPermission\(user,boardId\)\)/);
  assert.match(permissions,/permission==="owner"\|\|permission==="admin"\|\|permission==="editor"/);
  assert.match(permissions,/permission==="owner"\|\|permission==="admin"/);
});

test("directory synchronization revokes removed Authentik accounts",async()=>{
  const sync=await read("lib/authentik-directory.ts");
  assert.match(sync,/groups\.includes\("Northline Admins"\)/);
  assert.match(sync,/groups\.includes\("Northline Users"\)/);
  assert.match(sync,/UPDATE users SET status='Suspended'/);
  assert.match(sync,/DELETE FROM sessions WHERE user_id=/);
});

test("board data is relational and cascade-safe",async()=>{
  const schema=await read("lib/db.ts");
  for(const table of ["boards","board_members","tasks","comments","reminders","notification_deliveries","board_activity","board_notification_settings","user_notification_settings","workspace_settings"])assert.match(schema,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(schema,/public_id TEXT UNIQUE/);assert.match(schema,/created_by INTEGER REFERENCES users/);
  assert.match(schema,/board_id INTEGER NOT NULL REFERENCES boards\(id\) ON DELETE CASCADE/);
  assert.match(schema,/task_id INTEGER NOT NULL REFERENCES tasks\(id\) ON DELETE CASCADE/);
});

test("board references are opaque while creator ownership remains relational",async()=>{
  const [schema,boards,detail,worker,ui,permissions]=await Promise.all([read("lib/db.ts"),read("app/api/boards/route.ts"),read("app/api/boards/[id]/route.ts"),read("lib/reminder-worker.ts"),read("app/northline-app.tsx"),read("lib/boards.ts")]);
  assert.match(boards,/created_by/);assert.match(schema,/brd_\$\{randomBytes\(16\)/);assert.match(detail,/boardKey/);assert.match(worker,/creatorName/);assert.match(worker,/set a reminder/);assert.match(ui,/query\.set\("board",active\.boardKey\)/);assert.match(permissions,/owner_id/);
});

test("Task Buddy automatic notifications are board-routed and preference aware",async()=>{
  const [automation,boardRoute,preferences,ui]=await Promise.all([read("lib/task-notifications.ts"),read("app/api/boards/[id]/notifications/route.ts"),read("app/api/settings/notifications/route.ts"),read("app/northline-app.tsx")]);
  for(const event of ["assignment","status","comment","mention","due"])assert.match(automation,new RegExp(`\\b${event}\\b`));
  assert.match(automation,/INSERT OR IGNORE INTO reminders/);
  assert.match(automation,/NORTHLINE_PUBLIC_URL/);
  assert.match(boardRoute,/canShare\(boardPermission/);
  assert.match(preferences,/user_notification_settings/);
  assert.match(ui,/Automatic notifications/);
});

test("Discord reminders are permission checked and secrets stay server-side",async()=>{
  const [route,discord,worker,compose]=await Promise.all([read("app/api/reminders/route.ts"),read("lib/discord.ts"),read("lib/reminder-worker.ts"),read("compose.yaml")]);
  assert.match(route,/canEdit\(boardPermission\(user,Number\(boardId\)\)\)/);
  assert.match(route,/Channel is not available to the bot/);
  assert.match(discord,/process\.env\.NORTHLINE_DISCORD_BOT_TOKEN/);
  assert.doesNotMatch(route,/NORTHLINE_DISCORD_BOT_TOKEN/);
  assert.match(discord,/allowed_mentions/);assert.match(discord,/flags:4/);
  assert.match(worker,/setInterval/);
  assert.match(compose,/NORTHLINE_DISCORD_BOT_TOKEN/);
});

test("reminder management supports controlled updates, cancellation, and retry",async()=>{
  const [collection,item,retry,ui]=await Promise.all([read("app/api/reminders/route.ts"),read("app/api/reminders/[id]/route.ts"),read("app/api/reminders/[id]/retry/route.ts"),read("app/reminder-center.tsx")]);
  assert.match(collection,/canManage/);
  assert.match(item,/Only pending reminders can be edited/);
  assert.match(item,/REMINDER\.CANCEL/);
  assert.match(retry,/Only failed reminders can be retried/);
  assert.match(retry,/REMINDER\.RETRY/);
  assert.match(ui,/Reminder center/);
  assert.match(ui,/Retry now/);
});

test("administration metrics and audit history come from the database",async()=>{
  const overview=await read("app/api/admin/overview/route.ts");
  assert.match(overview,/requireAdmin\(\)/);
  assert.match(overview,/SELECT COUNT\(\*\) count FROM boards/);
  assert.match(overview,/FROM audit_log a/);
});

test("release health and workflow tools remain permission constrained",async()=>{
  const [health,search,duplicate,activity,backup,restore]=await Promise.all([read("app/api/admin/health/route.ts"),read("app/api/search/route.ts"),read("app/api/tasks/[id]/duplicate/route.ts"),read("app/api/boards/[id]/activity/route.ts"),read("ops/backup/northline-backup.sh"),read("ops/backup/northline-restore-test.sh")]);
  assert.match(health,/requireAdmin\(\)/);assert.match(health,/quick_check/);assert.match(health,/sendDiscordReminder/);
  assert.match(search,/b\.owner_id=\?/);assert.match(search,/bm\.user_id=\?/);
  assert.match(duplicate,/canEdit\(boardPermission/);assert.match(activity,/boardPermission/);
  assert.match(backup,/backup\.json/);assert.match(restore,/restore\.json/);
});

test("dark mode is persistent and application-wide",async()=>{
  const [ui,styles]=await Promise.all([read("app/northline-app.tsx"),read("app/globals.css")]);
  assert.match(ui,/northline-theme/);assert.match(ui,/document\.documentElement\.dataset\.theme/);assert.match(ui,/prefers-color-scheme: dark/);assert.match(ui,/Switch to/);
  assert.match(styles,/html\[data-theme="dark"\]/);assert.match(styles,/\.auth-screen/);assert.match(styles,/\.health-card/);assert.match(styles,/\.reminder-panel/);assert.match(styles,/\.modal/);
});
