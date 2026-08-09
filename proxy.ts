import { NextResponse,type NextRequest } from "next/server";

const buckets=new Map<string,{count:number;reset:number}>();
const mutations=new Set(["POST","PUT","PATCH","DELETE"]);
function clientKey(request:NextRequest){return request.headers.get("cf-connecting-ip")||request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"unknown"}
function allowedOrigin(request:NextRequest){
  const origin=request.headers.get("origin");if(!origin)return request.headers.get("sec-fetch-site")!="cross-site";
  const configured=process.env.NORTHLINE_PUBLIC_URL;const candidates=new Set<string>([request.nextUrl.origin]);
  if(configured)try{candidates.add(new URL(configured).origin)}catch{console.error("NORTHLINE_PUBLIC_URL is not a valid URL")}
  const forwardedHost=request.headers.get("x-forwarded-host")||request.headers.get("host"),protocol=request.headers.get("x-forwarded-proto")||request.nextUrl.protocol.replace(":","");if(forwardedHost)candidates.add(`${protocol}://${forwardedHost}`);
  return candidates.has(origin);
}
function limited(key:string,limit:number,windowMs:number){const now=Date.now(),current=buckets.get(key);if(!current||current.reset<=now){buckets.set(key,{count:1,reset:now+windowMs});return false}current.count++;return current.count>limit}

export function proxy(request:NextRequest){
  if(mutations.has(request.method)&&!allowedOrigin(request))return NextResponse.json({error:"Cross-origin request rejected"},{status:403});
  if(request.nextUrl.pathname==="/api/auth/login"&&request.method==="POST"&&limited(`login:${clientKey(request)}`,10,15*60_000))return NextResponse.json({error:"Too many sign-in attempts. Try again later."},{status:429,headers:{"Retry-After":"900"}});
  if(request.nextUrl.pathname.startsWith("/api/admin/")&&mutations.has(request.method)&&limited(`admin:${clientKey(request)}`,120,60_000))return NextResponse.json({error:"Administrative request limit exceeded"},{status:429,headers:{"Retry-After":"60"}});
  return NextResponse.next();
}
export const config={matcher:"/api/:path*"};
