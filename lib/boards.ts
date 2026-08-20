import db from "./db";
import type { SessionUser } from "./auth";

export type BoardPermission="owner"|"editor"|"viewer";

export async function boardPermission(user:SessionUser,boardId:number):Promise<BoardPermission|null> {
  const board=await db.prepare("SELECT b.owner_id,w.owner_id workspace_owner_id,wm.permission workspace_permission FROM boards b LEFT JOIN workspaces w ON w.id=b.workspace_id LEFT JOIN workspace_members wm ON wm.workspace_id=w.id AND wm.user_id=? WHERE b.id=?").get(user.id,boardId) as {owner_id:number;workspace_owner_id:number|null;workspace_permission:"viewer"|"editor"|null}|undefined;
  if(!board)return null;
  if(board.owner_id===user.id||board.workspace_owner_id===user.id)return "owner";
  const membership=await db.prepare("SELECT permission FROM board_members WHERE board_id=? AND user_id=?").get(boardId,user.id) as {permission:"viewer"|"editor"}|undefined;
  if(membership?.permission==="editor"||board.workspace_permission==="editor")return "editor";
  if(membership?.permission==="viewer"||board.workspace_permission==="viewer")return "viewer";
  return null;
}

export async function accessibleBoardIds(user:SessionUser):Promise<number[]> {
  const boards=await db.prepare("SELECT id FROM boards ORDER BY id").all() as Array<{id:number}>;
  const accessible: number[] = [];
  for (const board of boards) if (await boardPermission(user, board.id) !== null) accessible.push(board.id);
  return accessible;
}

export const canEdit=(permission:BoardPermission|null)=>permission==="owner"||permission==="editor";
export const canShare=(permission:BoardPermission|null)=>permission==="owner";
