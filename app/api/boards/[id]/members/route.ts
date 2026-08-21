import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import db from "@/lib/db";
import { boardPermission,canShare } from "@/lib/boards";

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  const user=await currentUser();
  if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const boardId=Number((await params).id);
  if(!Number.isInteger(boardId)||boardId<=0||!canShare(await boardPermission(user,boardId)))return NextResponse.json({error:"Forbidden"},{status:403});
  const{userId,permission}=await request.json();
  const targetId=Number(userId);
  if(!Number.isInteger(targetId)||targetId<=0)return NextResponse.json({error:"Invalid user"},{status:400});
  if(!["viewer","editor"].includes(permission))return NextResponse.json({error:"Invalid permission"},{status:400});
  const target=await db.prepare("SELECT id,status FROM users WHERE id=?").get(targetId) as {id:number;status:string}|undefined;
  if(!target||target.status!=="Active")return NextResponse.json({error:"Active user not found"},{status:404});
  const owner=await db.prepare("SELECT owner_id FROM boards WHERE id=?").get(boardId) as {owner_id:number}|undefined;
  if(!owner)return NextResponse.json({error:"Board not found"},{status:404});
  if(owner.owner_id===targetId)return NextResponse.json({error:"The owner already has full access"},{status:400});
  await db.transaction(async()=>{
    await db.prepare("INSERT INTO board_members(board_id,user_id,permission) VALUES(?,?,?) ON CONFLICT(board_id,user_id) DO UPDATE SET permission=excluded.permission").run(boardId,targetId,permission);
    await db.prepare("INSERT INTO audit_log(actor_id,action,target) VALUES(?,?,?)").run(user.id,"BOARD.SHARE",`${boardId}:${targetId}:${permission}`);
  });
  return NextResponse.json({ok:true});
}

export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}) {
  const user=await currentUser();
  if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const boardId=Number((await params).id);
  if(!Number.isInteger(boardId)||boardId<=0||!canShare(await boardPermission(user,boardId)))return NextResponse.json({error:"Forbidden"},{status:403});
  const{userId}=await request.json();
  const targetId=Number(userId);
  if(!Number.isInteger(targetId)||targetId<=0)return NextResponse.json({error:"Invalid user"},{status:400});
  await db.prepare("DELETE FROM board_members WHERE board_id=? AND user_id=?").run(boardId,targetId);
  return NextResponse.json({ok:true});
}
