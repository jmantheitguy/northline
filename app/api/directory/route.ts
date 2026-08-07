import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import db from "@/lib/db";
import { syncAuthentikDirectory } from "@/lib/authentik-directory";
export async function GET(){const user=await currentUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});try{await syncAuthentikDirectory()}catch(error){console.error("Authentik directory sync failed",error)}const users=db.prepare(`SELECT u.id,u.name,u.email,u.role,u.status,u.auth_source authSource,
  (SELECT COUNT(*) FROM boards b WHERE b.owner_id=u.id)+(SELECT COUNT(*) FROM board_members bm WHERE bm.user_id=u.id) boards
  FROM users u WHERE u.status='Active' ORDER BY u.name COLLATE NOCASE`).all();return NextResponse.json({users});}
