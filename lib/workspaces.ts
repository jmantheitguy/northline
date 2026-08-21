import db,{ensurePersonalWorkspace} from "./db";
import type { SessionUser } from "./auth";
import { teamWorkspacePermission } from "./teams";

export type WorkspacePermission="owner"|"editor"|"viewer";

export async function workspacePermission(user:SessionUser,workspaceId:number):Promise<WorkspacePermission|null>{
  const workspace=await db.prepare("SELECT owner_id,kind FROM workspaces WHERE id=?").get(workspaceId) as {owner_id:number;kind:"personal"|"shared"}|undefined;
  if(!workspace)return null;
  if(workspace.owner_id===user.id)return "owner";
  if(workspace.kind==="personal")return null;
  const member=await db.prepare("SELECT permission FROM workspace_members WHERE workspace_id=? AND user_id=?").get(workspaceId,user.id) as {permission:"viewer"|"editor"}|undefined;
  if(member?.permission) return member.permission;
  return await teamWorkspacePermission(user,workspaceId);
}

export async function listWorkspaces(user:SessionUser){
  await ensurePersonalWorkspace(user.id,user.name);
  const rows=await db.prepare(`SELECT w.id,w.public_id AS "workspaceKey",w.name,w.kind,w.owner_id AS "ownerId",u.name AS "ownerName",
    (SELECT COUNT(*) FROM boards b WHERE b.workspace_id=w.id) AS "boardCount",
    (SELECT COUNT(*) FROM workspace_members m WHERE m.workspace_id=w.id) AS "memberCount"
    FROM workspaces w JOIN users u ON u.id=w.owner_id ORDER BY w.kind='personal' DESC,w.name COLLATE NOCASE`).all() as Array<Record<string,unknown>>;
  const visible=[] as Array<Record<string,unknown>>;
  for(const row of rows){
    const permission=await workspacePermission(user,Number(row.id));
    if(permission) visible.push({...row,permission,boardCount:Number(row.boardCount||0),memberCount:Number(row.memberCount||0)});
  }
  return visible;
}

export const canCreateBoards=(permission:WorkspacePermission|null)=>permission==="owner"||permission==="editor";
