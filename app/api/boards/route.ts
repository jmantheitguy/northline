import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import db from "@/lib/db";

export async function GET(){
  const user=await currentUser(); if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  let boards=db.prepare(`SELECT b.id,b.name,b.description,b.owner_id ownerId,u.name ownerName,
    CASE WHEN b.owner_id=? THEN 'owner' WHEN ?='Admin' THEN 'admin' ELSE bm.permission END permission,
    (SELECT COUNT(*) FROM tasks t WHERE t.board_id=b.id) taskCount
    FROM boards b JOIN users u ON u.id=b.owner_id LEFT JOIN board_members bm ON bm.board_id=b.id AND bm.user_id=?
    WHERE b.owner_id=? OR ?='Admin' OR bm.user_id=? ORDER BY b.updated_at DESC`).all(user.id,user.role,user.id,user.id,user.role,user.id);
  if(!boards.length){const result=db.prepare("INSERT INTO boards(name,description,owner_id) VALUES(?,?,?)").run("My first board","Plan your first project and invite collaborators.",user.id);boards=[{id:Number(result.lastInsertRowid),name:"My first board",description:"Plan your first project and invite collaborators.",ownerId:user.id,ownerName:user.name,permission:"owner",taskCount:0}];}
  return NextResponse.json({boards});
}

export async function POST(request:Request){const user=await currentUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});const{name,description=""}=await request.json();if(!String(name||"").trim())return NextResponse.json({error:"Board name is required"},{status:400});const result=db.prepare("INSERT INTO boards(name,description,owner_id) VALUES(?,?,?)").run(String(name).trim(),String(description),user.id);return NextResponse.json({id:Number(result.lastInsertRowid)},{status:201});}
