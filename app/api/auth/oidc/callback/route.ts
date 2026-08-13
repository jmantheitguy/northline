import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { createSession } from "@/lib/auth";
import { oidcConfig } from "@/lib/oidc";
import { syncAuthentikDirectory } from "@/lib/authentik-directory";

type UserInfo={sub:string;email?:string;name?:string;preferred_username?:string;picture?:string;groups?:string[]};

type IdentityUser={id:number;oidcSubject:string|null;directoryId:string|null};

function resolveIdentity(profile:{sub:string;email:string;name:string;avatar:string|null;role:"Admin"|"Member"}) {
  return db.transaction(()=>{
    const bySubject=db.prepare("SELECT id,oidc_subject oidcSubject,directory_id directoryId FROM users WHERE oidc_subject=?").get(profile.sub) as IdentityUser|undefined;
    const byEmail=db.prepare("SELECT id,oidc_subject oidcSubject,directory_id directoryId FROM users WHERE email=? COLLATE NOCASE").get(profile.email) as IdentityUser|undefined;
    if(bySubject){
      if(byEmail&&byEmail.id!==bySubject.id)throw new Error("OIDC_IDENTITY_CONFLICT");
      if(!byEmail||byEmail.id===bySubject.id)db.prepare("UPDATE users SET name=?,email=?,role=?,status='Active',auth_source='oidc',identity_synced_at=CURRENT_TIMESTAMP,last_active_at=CURRENT_TIMESTAMP,avatar=COALESCE(?,avatar) WHERE id=?").run(profile.name,profile.email,profile.role,profile.avatar,bySubject.id);
      else db.prepare("UPDATE users SET name=?,role=?,status='Active',auth_source='oidc',identity_synced_at=CURRENT_TIMESTAMP,last_active_at=CURRENT_TIMESTAMP,avatar=COALESCE(?,avatar) WHERE id=?").run(profile.name,profile.role,profile.avatar,bySubject.id);
      return bySubject.id;
    }
    if(byEmail){
      if(byEmail.oidcSubject&&byEmail.oidcSubject!==profile.sub&&!byEmail.directoryId)throw new Error("OIDC_IDENTITY_CONFLICT");
      db.prepare("UPDATE users SET name=?,role=?,status='Active',oidc_subject=?,auth_source='oidc',identity_synced_at=CURRENT_TIMESTAMP,last_active_at=CURRENT_TIMESTAMP,avatar=COALESCE(?,avatar) WHERE id=?").run(profile.name,profile.role,profile.sub,profile.avatar,byEmail.id);
      return byEmail.id;
    }
    return Number(db.prepare("INSERT INTO users(name,email,password_hash,role,status,oidc_subject,auth_source,identity_synced_at,last_active_at,avatar) VALUES(?,?,?,?,?,?,'oidc',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?)").run(profile.name,profile.email,"oidc-managed-account",profile.role,"Active",profile.sub,profile.avatar).lastInsertRowid);
  })();
}

export async function GET(request:NextRequest) {
  const config=oidcConfig();
  if(!config) return NextResponse.redirect(new URL("/?auth_error=oidc_not_configured",request.url));
  const code=request.nextUrl.searchParams.get("code");
  const state=request.nextUrl.searchParams.get("state");
  const jar=await cookies();
  const expectedState=jar.get("northline_oidc_state")?.value;
  const verifier=jar.get("northline_oidc_verifier")?.value;
  if(!code || !state || !expectedState || state!==expectedState || !verifier) return NextResponse.redirect(new URL("/?auth_error=invalid_state",request.url));

  const tokenResponse=await fetch(`${config.origin}/application/o/token/`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"authorization_code",code,redirect_uri:`${config.publicUrl}/api/auth/oidc/callback`,client_id:config.clientId,client_secret:config.clientSecret,code_verifier:verifier})});
  if(!tokenResponse.ok) return NextResponse.redirect(new URL("/?auth_error=token_exchange",request.url));
  const token=await tokenResponse.json() as {access_token:string};
  const userResponse=await fetch(`${config.origin}/application/o/userinfo/`,{headers:{Authorization:`Bearer ${token.access_token}`}});
  if(!userResponse.ok) return NextResponse.redirect(new URL("/?auth_error=userinfo",request.url));
  const profile=await userResponse.json() as UserInfo;
  const groups=Array.isArray(profile.groups)?profile.groups:[];
  const isAdmin=groups.includes("Northline Admins");
  const hasAccess=isAdmin || groups.includes("Northline Users");
  if(!hasAccess) return NextResponse.redirect(new URL("/?auth_error=access_denied",request.url));
  const email=(profile.email || profile.preferred_username)?.trim().toLowerCase();
  if(!email || !profile.sub) return NextResponse.redirect(new URL("/?auth_error=incomplete_profile",request.url));
  const name=profile.name || profile.preferred_username || email;
  const role=isAdmin?"Admin":"Member";
  let userId:number;
  try{userId=resolveIdentity({sub:profile.sub,email,name,avatar:profile.picture||null,role});}
  catch(error){console.error("OIDC identity resolution failed",error instanceof Error?error.message:"unknown error");jar.delete("northline_oidc_state");jar.delete("northline_oidc_verifier");return NextResponse.redirect(new URL("/?auth_error=identity_conflict",config.publicUrl));}
  try{await syncAuthentikDirectory(true);}catch(error){console.error("Post-login Authentik directory sync failed",error);}
  await createSession(userId);
  jar.delete("northline_oidc_state"); jar.delete("northline_oidc_verifier");
  return NextResponse.redirect(config.publicUrl);
}
