import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { boardPermission } from "@/lib/boards";
import db from "@/lib/db";

export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
  const user=await currentUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});const boardId=Number((await params).id);
  if(!await boardPermission(user,boardId))return NextResponse.json({error:"Forbidden"},{status:403});
  const activity=await db.prepare(`SELECT a.id,a.action,a.detail,a.created_at AS "createdAt",COALESCE(u.name,'Former user') AS "actorName",u.avatar AS "actorAvatar" FROM board_activity a LEFT JOIN users u ON u.id=a.actor_id WHERE a.board_id=? ORDER BY a.created_at DESC LIMIT 100`).all(boardId);
  return NextResponse.json({activity});
}
