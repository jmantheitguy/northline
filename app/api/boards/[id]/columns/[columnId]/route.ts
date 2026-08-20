import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { boardPermission,canEdit } from "@/lib/boards";
import db from "@/lib/db";
import { recordBoardActivity } from "@/lib/activity";

const colorPattern=/^#[0-9a-f]{6}$/i;
type Column={id:number;columnKey:string;name:string};
async function context(params:Promise<{id:string;columnId:string}>){const value=await params;return{boardId:Number(value.id),columnId:Number(value.columnId)}}

export async function PATCH(request:Request,{params}:{params:Promise<{id:string;columnId:string}>}){
  const user=await currentUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});const{boardId,columnId}=await context(params);
  if(!canEdit(await boardPermission(user,boardId)))return NextResponse.json({error:"Forbidden"},{status:403});
  const column=await db.prepare("SELECT id,column_key columnKey,name FROM board_columns WHERE id=? AND board_id=?").get(columnId,boardId) as Column|undefined;if(!column)return NextResponse.json({error:"Column not found"},{status:404});
  const body=await request.json(),name=body.name===undefined?undefined:String(body.name).trim(),color=body.color===undefined?undefined:String(body.color);
  if(name!==undefined&&(!name||name.length>50)||color!==undefined&&!colorPattern.test(color)||body.isDone!==undefined&&typeof body.isDone!=="boolean")return NextResponse.json({error:"Invalid column details"},{status:400});
  await db.prepare("UPDATE board_columns SET name=COALESCE(?,name),color=COALESCE(?,color),is_done=COALESCE(?,is_done) WHERE id=? AND board_id=?").run(name??null,color??null,body.isDone===undefined?null:body.isDone?1:0,columnId,boardId);
  await db.prepare("UPDATE boards SET updated_at=CURRENT_TIMESTAMP WHERE id=?").run(boardId);await recordBoardActivity(boardId,user.id,"COLUMN.UPDATE",`Updated ${name||column.name}`);return NextResponse.json({ok:true});
}

export async function DELETE(request:Request,{params}:{params:Promise<{id:string;columnId:string}>}){
  const user=await currentUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});const{boardId,columnId}=await context(params);
  if(!canEdit(await boardPermission(user,boardId)))return NextResponse.json({error:"Forbidden"},{status:403});
  const column=await db.prepare("SELECT id,column_key columnKey,name FROM board_columns WHERE id=? AND board_id=?").get(columnId,boardId) as Column|undefined;if(!column)return NextResponse.json({error:"Column not found"},{status:404});
  const count=(await db.prepare("SELECT COUNT(*) count FROM board_columns WHERE board_id=?").get(boardId) as {count:number}).count;if(count<=1)return NextResponse.json({error:"A board must keep at least one column"},{status:400});
  const destinationId=Number(new URL(request.url).searchParams.get("destinationId")),destination=await db.prepare("SELECT column_key columnKey FROM board_columns WHERE id=? AND board_id=? AND id<>?").get(destinationId,boardId,columnId) as {columnKey:string}|undefined;
  if(!destination)return NextResponse.json({error:"Choose another column to receive existing tasks"},{status:400});
  await db.transaction(async ()=>{await db.prepare("UPDATE tasks SET status=?,updated_at=CURRENT_TIMESTAMP WHERE board_id=? AND status=?").run(destination.columnKey,boardId,column.columnKey);await db.prepare("DELETE FROM board_columns WHERE id=? AND board_id=?").run(columnId,boardId);const remaining=await db.prepare("SELECT id FROM board_columns WHERE board_id=? ORDER BY position").all(boardId) as Array<{id:number}>;const update=db.prepare("UPDATE board_columns SET position=? WHERE id=?");for(const [index,item] of remaining.entries())await update.run(index,item.id);await db.prepare("UPDATE boards SET updated_at=CURRENT_TIMESTAMP WHERE id=?").run(boardId);await recordBoardActivity(boardId,user.id,"COLUMN.DELETE",`Removed ${column.name} and moved its tasks`)});
  return NextResponse.json({ok:true});
}
