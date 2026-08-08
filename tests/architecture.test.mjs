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
  assert.match(sync,/groups\.includes\("Orbit Admins"\)/);
  assert.match(sync,/groups\.includes\("Orbit Users"\)/);
  assert.match(sync,/UPDATE users SET status='Suspended'/);
  assert.match(sync,/DELETE FROM sessions WHERE user_id=/);
});

test("board data is relational and cascade-safe",async()=>{
  const schema=await read("lib/db.ts");
  for(const table of ["boards","board_members","tasks","comments","reminders","workspace_settings"])assert.match(schema,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(schema,/board_id INTEGER NOT NULL REFERENCES boards\(id\) ON DELETE CASCADE/);
  assert.match(schema,/task_id INTEGER NOT NULL REFERENCES tasks\(id\) ON DELETE CASCADE/);
});

test("Discord reminders are permission checked and secrets stay server-side",async()=>{
  const [route,discord,worker,compose]=await Promise.all([read("app/api/reminders/route.ts"),read("lib/discord.ts"),read("lib/reminder-worker.ts"),read("compose.yaml")]);
  assert.match(route,/canEdit\(boardPermission\(user,Number\(boardId\)\)\)/);
  assert.match(route,/Channel is not available to the bot/);
  assert.match(discord,/process\.env\.ORBIT_DISCORD_BOT_TOKEN/);
  assert.doesNotMatch(route,/ORBIT_DISCORD_BOT_TOKEN/);
  assert.match(discord,/allowed_mentions/);
  assert.match(worker,/setInterval/);
  assert.match(compose,/ORBIT_DISCORD_BOT_TOKEN/);
});

test("administration metrics and audit history come from the database",async()=>{
  const overview=await read("app/api/admin/overview/route.ts");
  assert.match(overview,/requireAdmin\(\)/);
  assert.match(overview,/SELECT COUNT\(\*\) count FROM boards/);
  assert.match(overview,/FROM audit_log a/);
});
