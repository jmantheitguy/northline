import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { createSession } from "@/lib/auth";
import { oidcConfig } from "@/lib/oidc";
import { syncAuthentikDirectory } from "@/lib/authentik-directory";

type UserInfo={sub:string;email?:string;name?:string;preferred_username?:string;picture?:string;groups?:string[]};

type IdentityUser={id:number;oidcSubject:string|null;directoryId:string|null};

function authErrorRedirect(publicUrl:string,code:string) {
  const target=new URL(publicUrl);
  target.searchParams.set("auth_error",code);
  return NextResponse.redirect(target);
}

function resolveIdentity(profile:{sub:string;email:string;name:string;avatar:string|null;role:"Admin"|"Member"}) {
  return db.transaction(async ()=>{
    const bySubject=await db.prepare("SELECT id,oidc_subject oidcSubject,directory_id directoryId FROM users WHERE oidc_subject=?").get(profile.sub) as IdentityUser|undefined;
    const byEmail=await db.prepare("SELECT id,oidc_subject oidcSubject,directory_id directoryId FROM users WHERE email=? COLLATE NOCASE").get(profile.email) as IdentityUser|undefined;
    if(bySubject){
      if(byEmail&&byEmail.id!==bySubject.id)throw new Error("OIDC_IDENTITY_CONFLICT");
      if(!byEmail||byEmail.id===bySubject.id)await db.prepare("UPDATE users SET name=?,email=?,role=?,status='Active',auth_source='oidc',identity_synced_at=CURRENT_TIMESTAMP,last_active_at=CURRENT_TIMESTAMP,avatar=COALESCE(?,avatar) WHERE id=?").run(profile.name,profile.email,profile.role,profile.avatar,bySubject.id);
      else await db.prepare("UPDATE users SET name=?,role=?,status='Active',auth_source='oidc',identity_synced_at=CURRENT_TIMESTAMP,last_active_at=CURRENT_TIMESTAMP,avatar=COALESCE(?,avatar) WHERE id=?").run(profile.name,profile.role,profile.avatar,bySubject.id);
      return bySubject.id;
    }
    if(byEmail){
      if(byEmail.oidcSubject&&byEmail.oidcSubject!==profile.sub&&!byEmail.directoryId)throw new Error("OIDC_IDENTITY_CONFLICT");
      await db.prepare("UPDATE users SET name=?,role=?,status='Active',oidc_subject=?,auth_source='oidc',identity_synced_at=CURRENT_TIMESTAMP,last_active_at=CURRENT_TIMESTAMP,avatar=COALESCE(?,avatar) WHERE id=?").run(profile.name,profile.role,profile.sub,profile.avatar,byEmail.id);
      return byEmail.id;
    }
    return Number(await db.prepare("INSERT INTO users(name,email,password_hash,role,status,oidc_subject,auth_source,identity_synced_at,last_active_at,avatar) VALUES(?,?,?,?,?,?,'oidc',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?)").run(profile.name,profile.email,"oidc-managed-account",profile.role,"Active",profile.sub,profile.avatar).lastInsertRowid);
  });
}

export async function GET(request:NextRequest) {
  const config=oidcConfig();
  if(!config) return authErrorRedirect(process.env.NORTHLINE_PUBLIC_URL||request.nextUrl.origin,"oidc_not_configured");
  const code=request.nextUrl.searchParams.get("code");
  const state=request.nextUrl.searchParams.get("state");
  const jar=await cookies();
  const expectedState=jar.get("northline_oidc_state")?.value;
  const verifier=jar.get("northline_oidc_verifier")?.value;
  if(!code || !state || !expectedState || state!==expectedState || !verifier) return authErrorRedirect(config.publicUrl,"invalid_state");

  const tokenResponse=await fetch(`${config.origin}/application/o/token/`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"authorization_code",code,redirect_uri:`${config.publicUrl}/api/auth/oidc/callback`,client_id:config.clientId,client_secret:config.clientSecret,code_verifier:verifier})});
  if(!tokenResponse.ok) return authErrorRedirect(config.publicUrl,"token_exchange");
  const token=await tokenResponse.json() as {access_token:string};
  const userResponse=await fetch(`${config.origin}/application/o/userinfo/`,{headers:{Authorization:`Bearer ${token.access_token}`}});
  if(!userResponse.ok) return authErrorRedirect(config.publicUrl,"userinfo");
  const profile=await userResponse.json() as UserInfo;
  const groups=Array.isArray(profile.groups)?profile.groups:[];
  const isAdmin=groups.includes("Northline Admins");
  const hasAccess=isAdmin || groups.includes("Northline Users");
  if(!hasAccess) return authErrorRedirect(config.publicUrl,"access_denied");
  const email=(profile.email || profile.preferred_username)?.trim().toLowerCase();
  if(!email || !profile.sub) return authErrorRedirect(config.publicUrl,"incomplete_profile");
  const name=profile.name || profile.preferred_username || email;
  const role=isAdmin?"Admin":"Member";
  let userId:number;
  try{userId=resolveIdentity({sub:profile.sub,email,name,avatar:profile.picture||null,role});}
  catch(error){console.error("OIDC identity resolution failed",error instanceof Error?error.message:"unknown error");jar.delete("northline_oidc_state");jar.delete("northline_oidc_verifier");return authErrorRedirect(config.publicUrl,"identity_conflict");}
  try{await syncAuthentikDirectory(true);}catch(error){console.error("Post-login Authentik directory sync failed",error);}
  await createSession(userId);
  jar.delete("northline_oidc_state"); jar.delete("northline_oidc_verifier");
  return NextResponse.redirect(config.publicUrl);
}
