import db,{ensurePersonalWorkspace} from "./db";
import type { SessionUser } from "./auth";

export type WorkspacePermission="owner"|"editor"|"viewer";

export function workspacePermission(user:SessionUser,workspaceId:number):WorkspacePermission|null{
  const workspace=db.prepare("SELECT owner_id,kind FROM workspaces WHERE id=?").get(workspaceId) as {owner_id:number;kind:"personal"|"shared"}|undefined;
  if(!workspace)return null;
  if(workspace.owner_id===user.id)return "owner";
  if(workspace.kind==="personal")return null;
  const member=db.prepare("SELECT permission FROM workspace_members WHERE workspace_id=? AND user_id=?").get(workspaceId,user.id) as {permission:"viewer"|"editor"}|undefined;
  return member?.permission||null;
}

export function listWorkspaces(user:SessionUser){
  ensurePersonalWorkspace(user.id,user.name);
  return db.prepare(`SELECT w.id,w.public_id workspaceKey,w.name,w.kind,w.owner_id ownerId,u.name ownerName,
    CASE WHEN w.owner_id=? THEN 'owner' ELSE wm.permission END permission,
    (SELECT COUNT(*) FROM boards b WHERE b.workspace_id=w.id) boardCount,
    (SELECT COUNT(*) FROM workspace_members m WHERE m.workspace_id=w.id) memberCount
    FROM workspaces w JOIN users u ON u.id=w.owner_id LEFT JOIN workspace_members wm ON wm.workspace_id=w.id AND wm.user_id=?
    WHERE w.owner_id=? OR wm.user_id=? ORDER BY w.kind='personal' DESC,w.name COLLATE NOCASE`).all(user.id,user.id,user.id,user.id);
}

export const canCreateBoards=(permission:WorkspacePermission|null)=>permission==="owner"||permission==="editor";
