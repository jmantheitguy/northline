import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import db,{createBoardPublicId} from "@/lib/db";

export async function GET(){
  const user=await currentUser(); if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  let boards=db.prepare(`SELECT b.id,b.public_id boardKey,b.name,b.description,b.owner_id ownerId,u.name ownerName,
    CASE WHEN b.owner_id=? THEN 'owner' WHEN ?='Admin' THEN 'admin' ELSE bm.permission END permission,
    (SELECT COUNT(*) FROM tasks t WHERE t.board_id=b.id) taskCount
    FROM boards b JOIN users u ON u.id=b.owner_id LEFT JOIN board_members bm ON bm.board_id=b.id AND bm.user_id=?
    WHERE b.owner_id=? OR ?='Admin' OR bm.user_id=? ORDER BY b.updated_at DESC`).all(user.id,user.role,user.id,user.id,user.role,user.id);
  if(!boards.length){const result=db.prepare("INSERT INTO boards(name,description,owner_id,created_by) VALUES(?,?,?,?)").run("My first board","Plan your first project and invite collaborators.",user.id,user.id),id=Number(result.lastInsertRowid),boardKey=createBoardPublicId();db.prepare("UPDATE boards SET public_id=? WHERE id=?").run(boardKey,id);boards=[{id,boardKey,name:"My first board",description:"Plan your first project and invite collaborators.",ownerId:user.id,ownerName:user.name,permission:"owner",taskCount:0}];}
  return NextResponse.json({boards});
}

export async function POST(request:Request){const user=await currentUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});const{name,description="",template="blank"}=await request.json();const cleanName=String(name||"").trim(),cleanDescription=String(description||"").trim();if(!cleanName)return NextResponse.json({error:"Board name is required"},{status:400});if(cleanName.length>100||cleanDescription.length>1000||!["blank","content","launch"].includes(template))return NextResponse.json({error:"Invalid board details"},{status:400});const presets:Record<string,Array<[string,string,string,string]>>={blank:[],content:[["Collect ideas","ideas","Medium","Planning"],["Draft content","ready","High","Production"],["Review and approve","hold","High","Review"],["Publish","done","Medium","Publishing"]],launch:[["Define launch goals","ideas","High","Strategy"],["Prepare assets","ready","High","Production"],["Run launch checklist","progress","High","Launch"],["Post-launch review","hold","Medium","Review"]]};const create=db.transaction(()=>{const result=db.prepare("INSERT INTO boards(name,description,owner_id,created_by) VALUES(?,?,?,?)").run(cleanName,cleanDescription,user.id,user.id),id=Number(result.lastInsertRowid),boardKey=createBoardPublicId();db.prepare("UPDATE boards SET public_id=? WHERE id=?").run(boardKey,id);for(const [title,status,priority,tag] of presets[template])db.prepare("INSERT INTO tasks(board_id,title,status,priority,tag,created_by) VALUES(?,?,?,?,?,?)").run(id,title,status,priority,tag,user.id);db.prepare("INSERT INTO audit_log(actor_id,action,target) VALUES(?,?,?)").run(user.id,"BOARD.CREATE",boardKey);return{id,boardKey};});return NextResponse.json(create(),{status:201});}
