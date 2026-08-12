import db from "./db";
import type { SessionUser } from "./auth";

export type BoardPermission="owner"|"editor"|"viewer";

export function boardPermission(user:SessionUser,boardId:number):BoardPermission|null {
  const board=db.prepare("SELECT b.owner_id,w.owner_id workspace_owner_id,wm.permission workspace_permission FROM boards b LEFT JOIN workspaces w ON w.id=b.workspace_id LEFT JOIN workspace_members wm ON wm.workspace_id=w.id AND wm.user_id=? WHERE b.id=?").get(user.id,boardId) as {owner_id:number;workspace_owner_id:number|null;workspace_permission:"viewer"|"editor"|null}|undefined;
  if(!board)return null;
  if(board.owner_id===user.id||board.workspace_owner_id===user.id)return "owner";
  const membership=db.prepare("SELECT permission FROM board_members WHERE board_id=? AND user_id=?").get(boardId,user.id) as {permission:"viewer"|"editor"}|undefined;
  if(membership?.permission==="editor"||board.workspace_permission==="editor")return "editor";
  if(membership?.permission==="viewer"||board.workspace_permission==="viewer")return "viewer";
  return null;
}

export const canEdit=(permission:BoardPermission|null)=>permission==="owner"||permission==="editor";
export const canShare=(permission:BoardPermission|null)=>permission==="owner";
