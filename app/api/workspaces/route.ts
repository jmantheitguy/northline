import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import db,{createWorkspacePublicId} from "@/lib/db";
import { listWorkspaces } from "@/lib/workspaces";

export async function GET(){const user=await currentUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});return NextResponse.json({workspaces:await listWorkspaces(user)})}

export async function POST(request:Request){const user=await currentUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});const{name}=await request.json(),cleanName=String(name||"").trim();if(!cleanName||cleanName.length>80)return NextResponse.json({error:"Workspace name must be between 1 and 80 characters"},{status:400});const publicId=createWorkspacePublicId(),result=await db.prepare("INSERT INTO workspaces(public_id,name,owner_id,kind) VALUES(?,?,?,'shared')").run(publicId,cleanName,user.id);await db.prepare("INSERT INTO audit_log(actor_id,action,target) VALUES(?,?,?)").run(user.id,"WORKSPACE.CREATE",publicId);return NextResponse.json({id:Number(result.lastInsertRowid),workspaceKey:publicId},{status:201})}
