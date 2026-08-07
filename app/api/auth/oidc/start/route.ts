import { NextResponse } from "next/server";
import { oidcConfig, oidcCookieOptions, pkceChallenge, randomUrlToken } from "@/lib/oidc";

export async function GET() {
  const config = oidcConfig();
  if (!config) return NextResponse.json({error:"Authentik sign-in is not configured"},{status:503});
  const state=randomUrlToken();
  const verifier=randomUrlToken(48);
  const authorize=new URL("/application/o/authorize/",config.origin);
  authorize.searchParams.set("client_id",config.clientId);
  authorize.searchParams.set("redirect_uri",`${config.publicUrl}/api/auth/oidc/callback`);
  authorize.searchParams.set("response_type","code");
  authorize.searchParams.set("scope","openid email profile");
  authorize.searchParams.set("state",state);
  authorize.searchParams.set("code_challenge",pkceChallenge(verifier));
  authorize.searchParams.set("code_challenge_method","S256");
  const response=NextResponse.redirect(authorize);
  response.cookies.set("orbit_oidc_state",state,oidcCookieOptions);
  response.cookies.set("orbit_oidc_verifier",verifier,oidcCookieOptions);
  return response;
}
