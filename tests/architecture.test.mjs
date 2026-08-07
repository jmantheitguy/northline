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
  for(const table of ["boards","board_members","tasks","comments"])assert.match(schema,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(schema,/board_id INTEGER NOT NULL REFERENCES boards\(id\) ON DELETE CASCADE/);
  assert.match(schema,/task_id INTEGER NOT NULL REFERENCES tasks\(id\) ON DELETE CASCADE/);
});
