import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { syncAuthentikDirectory } from "@/lib/authentik-directory";
export async function POST(){if(!await requireAdmin())return NextResponse.json({error:"Forbidden"},{status:403});try{return NextResponse.json(await syncAuthentikDirectory(true))}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Directory sync failed"},{status:502});}}
