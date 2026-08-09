import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { boardPermission,canEdit } from "@/lib/boards";
import db,{createColumnKey} from "@/lib/db";
import { recordBoardActivity } from "@/lib/activity";

const colorPattern=/^#[0-9a-f]{6}$/i;

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await currentUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const boardId=Number((await params).id);if(!canEdit(boardPermission(user,boardId)))return NextResponse.json({error:"Forbidden"},{status:403});
  const body=await request.json(),name=String(body.name||"").trim(),color=String(body.color||"#7c6ce7");
  if(!name||name.length>50||!colorPattern.test(color))return NextResponse.json({error:"A column name under 50 characters and valid color are required"},{status:400});
  const position=(db.prepare("SELECT COALESCE(MAX(position),-1)+1 position FROM board_columns WHERE board_id=?").get(boardId) as {position:number}).position;
  const key=createColumnKey(),isDone=body.isDone?1:0,result=db.prepare("INSERT INTO board_columns(board_id,column_key,name,color,position,is_done) VALUES(?,?,?,?,?,?)").run(boardId,key,name,color,position,isDone);
  recordBoardActivity(boardId,user.id,"COLUMN.CREATE",`Added ${name}`);return NextResponse.json({column:{id:Number(result.lastInsertRowid),key,name,color,position,isDone}},{status:201});
}

export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){
  const user=await currentUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const boardId=Number((await params).id);if(!canEdit(boardPermission(user,boardId)))return NextResponse.json({error:"Forbidden"},{status:403});
  const ids=(await request.json()).columnIds;if(!Array.isArray(ids)||ids.some(id=>!Number.isInteger(Number(id))))return NextResponse.json({error:"Invalid column order"},{status:400});
  const existing=db.prepare("SELECT id FROM board_columns WHERE board_id=? ORDER BY position").all(boardId) as Array<{id:number}>;
  if(ids.length!==existing.length||new Set(ids.map(Number)).size!==existing.length||existing.some(column=>!ids.map(Number).includes(column.id)))return NextResponse.json({error:"Column order must include every board column once"},{status:400});
  db.transaction(()=>{db.prepare("UPDATE board_columns SET position=position+1000 WHERE board_id=?").run(boardId);const update=db.prepare("UPDATE board_columns SET position=? WHERE id=? AND board_id=?");ids.forEach((id,index)=>update.run(index,Number(id),boardId));db.prepare("UPDATE boards SET updated_at=CURRENT_TIMESTAMP WHERE id=?").run(boardId);recordBoardActivity(boardId,user.id,"COLUMN.REORDER","Reordered workflow columns")})();
  return NextResponse.json({ok:true});
}
