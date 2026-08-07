import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { syncAuthentikDirectory } from "@/lib/authentik-directory";
export async function GET(){if(!await requireAdmin())return NextResponse.json({error:"Forbidden"},{status:403});try{await syncAuthentikDirectory()}catch{}return NextResponse.json({users:db.prepare(`SELECT u.id,u.name,u.email,u.role,u.status,u.auth_source authSource,u.created_at,u.last_active_at,
  (SELECT COUNT(*) FROM boards b WHERE b.owner_id=u.id)+(SELECT COUNT(*) FROM board_members bm WHERE bm.user_id=u.id) boards FROM users u ORDER BY u.id`).all()});}
export async function POST(request:Request){const admin=await requireAdmin();if(!admin)return NextResponse.json({error:"Forbidden"},{status:403});const {name,email,role,password}=await request.json();if(!name||!email||!password||!['Admin','Member','Guest'].includes(role))return NextResponse.json({error:"Invalid user details"},{status:400});try{const result=db.prepare("INSERT INTO users(name,email,password_hash,role,status) VALUES(?,?,?,?,?)").run(name,email,await hash(password,12),role,"Active");db.prepare("INSERT INTO audit_log(actor_id,action,target) VALUES(?,?,?)").run(admin.id,"USER.CREATE",email);return NextResponse.json({id:Number(result.lastInsertRowid)},{status:201});}catch{return NextResponse.json({error:"Email already exists"},{status:409});}}
