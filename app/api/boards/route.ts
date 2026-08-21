import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import db,{createBoardPublicId,createDefaultBoardColumns,ensurePersonalWorkspace} from "@/lib/db";
import { listWorkspaces,workspacePermission,canCreateBoards } from "@/lib/workspaces";

export async function GET(){
  const user=await currentUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const personal=await ensurePersonalWorkspace(user.id,user.name);
  const personalBoardCount=(await db.prepare("SELECT COUNT(*) count FROM boards WHERE workspace_id=?").get(personal.id) as {count:number}).count;
  if(!personalBoardCount){const result=await db.prepare("INSERT INTO boards(name,description,owner_id,created_by,workspace_id) VALUES(?,?,?,?,?)").run("My first board","Plan your first project and invite collaborators.",user.id,user.id,personal.id),id=Number(result.lastInsertRowid),boardKey=createBoardPublicId();await db.prepare("UPDATE boards SET public_id=? WHERE id=?").run(boardKey,id);await createDefaultBoardColumns(id)}
  const boards=await db.prepare(`SELECT DISTINCT b.id,b.public_id AS "boardKey",b.name,b.description,b.owner_id AS "ownerId",u.name AS "ownerName",b.workspace_id AS "workspaceId",w.name AS "workspaceName",b.updated_at AS "updatedAt",
    CASE WHEN b.owner_id=? OR w.owner_id=? OR wm.user_id IS NOT NULL OR team.owner_id=? OR tm.user_id IS NOT NULL THEN b.workspace_id ELSE 0 END AS "navigationWorkspaceId",
    CASE WHEN b.owner_id=? OR w.owner_id=? THEN 'owner' WHEN bm.permission='editor' OR wm.permission='editor' OR tw.permission='editor' THEN 'editor' ELSE 'viewer' END AS permission,
    (SELECT COUNT(*) FROM tasks t WHERE t.board_id=b.id AND t.archived_at IS NULL) AS "taskCount"
    FROM boards b JOIN users u ON u.id=b.owner_id JOIN workspaces w ON w.id=b.workspace_id
    LEFT JOIN board_members bm ON bm.board_id=b.id AND bm.user_id=?
    LEFT JOIN workspace_members wm ON wm.workspace_id=w.id AND wm.user_id=?
    LEFT JOIN team_workspaces tw ON tw.workspace_id=w.id
    LEFT JOIN teams team ON team.id=tw.team_id
    LEFT JOIN team_members tm ON tm.team_id=tw.team_id AND tm.user_id=?
    WHERE b.owner_id=? OR w.owner_id=? OR bm.user_id=? OR wm.user_id=? OR team.owner_id=? OR tm.user_id=? ORDER BY "updatedAt" DESC`).all(user.id,user.id,user.id,user.id,user.id,user.id,user.id,user.id,user.id,user.id,user.id,user.id,user.id,user.id);
  const directShares=(boards as Array<{navigationWorkspaceId:number}>).filter(board=>board.navigationWorkspaceId===0).length;
  const workspaces=await listWorkspaces(user) as Array<Record<string,unknown>>;
  if(directShares)workspaces.push({id:0,workspaceKey:"shared-with-me",name:"Shared with me",kind:"shared",ownerId:0,ownerName:"Northline",permission:"viewer",boardCount:directShares,memberCount:0,virtual:true});
  return NextResponse.json({boards,workspaces});
}

export async function POST(request:Request){
  const user=await currentUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const{name,description="",template="blank",workspaceId}=await request.json();
  const cleanName=String(name||"").trim(),cleanDescription=String(description||"").trim();
  if(!cleanName)return NextResponse.json({error:"Board name is required"},{status:400});
  if(cleanName.length>100||cleanDescription.length>1000||!["blank","content","launch"].includes(template))return NextResponse.json({error:"Invalid board details"},{status:400});
  const personal=await ensurePersonalWorkspace(user.id,user.name),targetWorkspace=Number(workspaceId||personal.id);
  if(!canCreateBoards(await workspacePermission(user,targetWorkspace)))return NextResponse.json({error:"You cannot create boards in this workspace"},{status:403});
  const presets:Record<string,Array<[string,string,string,string]>>={blank:[],content:[["Collect ideas","ideas","Medium","Planning"],["Draft content","ready","High","Production"],["Review and approve","hold","High","Review"],["Publish","done","Medium","Publishing"]],launch:[["Define launch goals","ideas","High","Strategy"],["Prepare assets","ready","High","Production"],["Run launch checklist","progress","High","Launch"],["Post-launch review","hold","Medium","Review"]]};
  const create=await db.transaction(async ()=>{const result=await db.prepare("INSERT INTO boards(name,description,owner_id,created_by,workspace_id) VALUES(?,?,?,?,?)").run(cleanName,cleanDescription,user.id,user.id,targetWorkspace),id=Number(result.lastInsertRowid),boardKey=createBoardPublicId();await db.prepare("UPDATE boards SET public_id=? WHERE id=?").run(boardKey,id);await createDefaultBoardColumns(id);for(const [title,status,priority,tag] of presets[template])await db.prepare("INSERT INTO tasks(board_id,title,status,priority,tag,created_by) VALUES(?,?,?,?,?,?)").run(id,title,status,priority,tag,user.id);await db.prepare("INSERT INTO audit_log(actor_id,action,target) VALUES(?,?,?)").run(user.id,"BOARD.CREATE",boardKey);return{id,boardKey};});
  return NextResponse.json(create,{status:201});
}
