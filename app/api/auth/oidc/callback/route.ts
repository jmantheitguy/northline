import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { createSession } from "@/lib/auth";
import { oidcConfig } from "@/lib/oidc";

type UserInfo={sub:string;email?:string;name?:string;preferred_username?:string;groups?:string[]};

export async function GET(request:NextRequest) {
  const config=oidcConfig();
  if(!config) return NextResponse.redirect(new URL("/?auth_error=oidc_not_configured",request.url));
  const code=request.nextUrl.searchParams.get("code");
  const state=request.nextUrl.searchParams.get("state");
  const jar=await cookies();
  const expectedState=jar.get("orbit_oidc_state")?.value;
  const verifier=jar.get("orbit_oidc_verifier")?.value;
  if(!code || !state || !expectedState || state!==expectedState || !verifier) return NextResponse.redirect(new URL("/?auth_error=invalid_state",request.url));

  const tokenResponse=await fetch(`${config.origin}/application/o/token/`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"authorization_code",code,redirect_uri:`${config.publicUrl}/api/auth/oidc/callback`,client_id:config.clientId,client_secret:config.clientSecret,code_verifier:verifier})});
  if(!tokenResponse.ok) return NextResponse.redirect(new URL("/?auth_error=token_exchange",request.url));
  const token=await tokenResponse.json() as {access_token:string};
  const userResponse=await fetch(`${config.origin}/application/o/userinfo/`,{headers:{Authorization:`Bearer ${token.access_token}`}});
  if(!userResponse.ok) return NextResponse.redirect(new URL("/?auth_error=userinfo",request.url));
  const profile=await userResponse.json() as UserInfo;
  const groups=Array.isArray(profile.groups)?profile.groups:[];
  const isAdmin=groups.includes("Orbit Admins");
  const hasAccess=isAdmin || groups.includes("Orbit Users");
  if(!hasAccess) return NextResponse.redirect(new URL("/?auth_error=access_denied",request.url));
  const email=profile.email || profile.preferred_username;
  if(!email || !profile.sub) return NextResponse.redirect(new URL("/?auth_error=incomplete_profile",request.url));
  const name=profile.name || profile.preferred_username || email;
  const role=isAdmin?"Admin":"Member";
  db.prepare(`INSERT INTO users(name,email,password_hash,role,status,oidc_subject,last_active_at) VALUES(?,?,?,?,? ,?,CURRENT_TIMESTAMP)
    ON CONFLICT(email) DO UPDATE SET name=excluded.name,role=excluded.role,status='Active',oidc_subject=excluded.oidc_subject,last_active_at=CURRENT_TIMESTAMP`).run(name,email,"oidc-managed-account",role,"Active",profile.sub);
  const user=db.prepare("SELECT id FROM users WHERE email=?").get(email) as {id:number};
  await createSession(user.id);
  jar.delete("orbit_oidc_state"); jar.delete("orbit_oidc_verifier");
  return NextResponse.redirect(config.publicUrl);
}
