import { compare } from "bcryptjs";
import { NextResponse } from "next/server";
import db from "@/lib/db";
import { createSession } from "@/lib/auth";

export async function POST(request:Request) {
  const {email,password}=await request.json();
  const user=db.prepare("SELECT id,name,email,role,status,password_hash FROM users WHERE email=?").get(String(email||"")) as {id:number;name:string;email:string;role:string;status:string;password_hash:string}|undefined;
  if(!user || user.status!=="Active" || !(await compare(String(password||""),user.password_hash))) return NextResponse.json({error:"Invalid email or password"},{status:401});
  await createSession(user.id); db.prepare("UPDATE users SET last_active_at=CURRENT_TIMESTAMP WHERE id=?").run(user.id);
  return NextResponse.json({user:{id:user.id,name:user.name,email:user.email,role:user.role}});
}
