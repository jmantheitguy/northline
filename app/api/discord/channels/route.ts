import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { discordConfigured, listDiscordChannels } from "@/lib/discord";

export async function GET() {
  if (!await currentUser()) return NextResponse.json({error:"Unauthorized"},{status:401});
  if (!discordConfigured()) return NextResponse.json({configured:false,channels:[]});
  try { return NextResponse.json({configured:true,channels:await listDiscordChannels()}); }
  catch (error) { return NextResponse.json({configured:true,channels:[],error:error instanceof Error?error.message:"Discord unavailable"},{status:502}); }
}
