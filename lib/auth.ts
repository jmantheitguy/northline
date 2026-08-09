import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { headers } from "next/headers";
import db from "./db";

export type SessionUser = { id: number; name: string; email: string; avatar: string|null; role: "Admin"|"Member"|"Guest"; status: string };
const digest = (token:string) => createHash("sha256").update(token).digest("hex");

export async function currentUser(): Promise<SessionUser|null> {
  const token = (await cookies()).get("northline_session")?.value;
  if (!token) return null;
  return (db.prepare(`SELECT u.id,u.name,u.email,u.avatar,u.role,u.status FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>datetime('now') AND u.status='Active'`).get(digest(token)) as SessionUser) || null;
}
export async function requireAdmin() { const user=await currentUser(); return user?.role==="Admin"?user:null; }
export async function createSession(userId:number) {
  const token=randomBytes(32).toString("base64url");
  const requestHeaders=await headers(),userAgent=requestHeaders.get("user-agent")?.slice(0,300)||null,ip=(requestHeaders.get("cf-connecting-ip")||requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim()||null)?.slice(0,64)||null;
  db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
  db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at,user_agent,created_ip,last_seen_at) VALUES (?,?,datetime('now','+7 days'),?,?,CURRENT_TIMESTAMP)").run(digest(token),userId,userAgent,ip);
  (await cookies()).set("northline_session",token,{httpOnly:true,sameSite:"lax",secure:process.env.NORTHLINE_COOKIE_SECURE==="true",path:"/",maxAge:604800});
}
export async function destroySession() { const jar=await cookies(); const token=jar.get("northline_session")?.value; if(token) db.prepare("DELETE FROM sessions WHERE token_hash=?").run(digest(token)); jar.delete("northline_session"); }
export async function currentSessionHash(){const token=(await cookies()).get("northline_session")?.value;return token?digest(token):null}
