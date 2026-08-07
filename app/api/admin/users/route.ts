import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
export async function GET(){if(!await requireAdmin())return NextResponse.json({error:"Forbidden"},{status:403});return NextResponse.json({users:db.prepare("SELECT id,name,email,role,status,created_at,last_active_at FROM users ORDER BY id").all()});}
export async function POST(request:Request){const admin=await requireAdmin();if(!admin)return NextResponse.json({error:"Forbidden"},{status:403});const {name,email,role,password}=await request.json();if(!name||!email||!password||!['Admin','Member','Guest'].includes(role))return NextResponse.json({error:"Invalid user details"},{status:400});try{const result=db.prepare("INSERT INTO users(name,email,password_hash,role,status) VALUES(?,?,?,?,?)").run(name,email,await hash(password,12),role,"Active");db.prepare("INSERT INTO audit_log(actor_id,action,target) VALUES(?,?,?)").run(admin.id,"USER.CREATE",email);return NextResponse.json({id:Number(result.lastInsertRowid)},{status:201});}catch{return NextResponse.json({error:"Email already exists"},{status:409});}}
