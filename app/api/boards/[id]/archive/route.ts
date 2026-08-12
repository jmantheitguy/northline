import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import db from "@/lib/db";
import { boardPermission } from "@/lib/boards";

export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){
  const user=await currentUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const id=Number((await params).id),permission=boardPermission(user,id);if(!permission)return NextResponse.json({error:"Forbidden"},{status:403});
  const tasks=db.prepare("SELECT t.id,t.title,t.archived_at archivedAt,t.priority,c.name statusName FROM tasks t JOIN board_columns c ON c.board_id=t.board_id AND c.column_key=t.status WHERE t.board_id=? AND t.archived_at IS NOT NULL ORDER BY t.archived_at DESC").all(id);
  return NextResponse.json({tasks,canRestore:permission!=="viewer"});
}
