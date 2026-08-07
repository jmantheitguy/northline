import db from "./db";
import type { SessionUser } from "./auth";

export type BoardPermission="owner"|"editor"|"viewer"|"admin";

export function boardPermission(user:SessionUser,boardId:number):BoardPermission|null {
  const board=db.prepare("SELECT owner_id FROM boards WHERE id=?").get(boardId) as {owner_id:number}|undefined;
  if(!board)return null;
  if(board.owner_id===user.id)return "owner";
  if(user.role==="Admin")return "admin";
  const membership=db.prepare("SELECT permission FROM board_members WHERE board_id=? AND user_id=?").get(boardId,user.id) as {permission:"viewer"|"editor"}|undefined;
  return membership?.permission||null;
}

export const canEdit=(permission:BoardPermission|null)=>permission==="owner"||permission==="admin"||permission==="editor";
export const canShare=(permission:BoardPermission|null)=>permission==="owner"||permission==="admin";
