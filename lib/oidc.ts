import { createHash, randomBytes } from "node:crypto";

export const oidcConfig = () => {
  const issuer = process.env.ORBIT_OIDC_ISSUER?.replace(/\/$/, "");
  const clientId = process.env.ORBIT_OIDC_CLIENT_ID;
  const clientSecret = process.env.ORBIT_OIDC_CLIENT_SECRET;
  const publicUrl = process.env.ORBIT_PUBLIC_URL?.replace(/\/$/, "");
  if (!issuer || !clientId || !clientSecret || !publicUrl) return null;
  return { issuer, clientId, clientSecret, publicUrl };
};

export const randomUrlToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const pkceChallenge = (verifier:string) => createHash("sha256").update(verifier).digest("base64url");
export const oidcCookieOptions = {httpOnly:true,sameSite:"lax" as const,secure:process.env.ORBIT_COOKIE_SECURE==="true",path:"/",maxAge:600};
