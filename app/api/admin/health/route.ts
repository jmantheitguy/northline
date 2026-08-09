import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { discordConfigured,listDiscordChannels,sendDiscordReminder } from "@/lib/discord";
import db from "@/lib/db";
import fs from "node:fs";
import path from "node:path";

function statusFile(name:string){try{return JSON.parse(fs.readFileSync(path.join(process.env.NORTHLINE_STATUS_DIR||"/app/status",`${name}.json`),"utf8"))}catch{return {status:"unknown",message:"No status report has been published yet"}}}
export async function GET(){
  if(!await requireAdmin())return NextResponse.json({error:"Forbidden"},{status:403});
  const databasePath=path.join(process.env.NORTHLINE_DATA_DIR||path.join(process.cwd(),"data"),"northline.db");
  const memory=process.memoryUsage(),disk=fs.statfsSync(path.dirname(databasePath)),integrity=(db.pragma("quick_check") as Array<{quick_check:string}>)[0]?.quick_check||"unknown";
  const delivery=db.prepare("SELECT status,sent_at sentAt,error FROM reminders ORDER BY COALESCE(sent_at,created_at) DESC LIMIT 1").get()||null;
  const reminders=db.prepare("SELECT status,COUNT(*) count FROM reminders GROUP BY status").all() as Array<{status:string;count:number}>;
  const sessions=(db.prepare("SELECT COUNT(*) count FROM sessions WHERE expires_at>datetime('now')").get() as {count:number}).count;
  const discord={configured:discordConfigured(),status:discordConfigured()?"healthy":"unconfigured",channels:0,error:null as string|null};
  if(discord.configured)try{discord.channels=(await listDiscordChannels()).length}catch(error){discord.status="degraded";discord.error=error instanceof Error?error.message:"Discord check failed"}
  const migration=(db.prepare("SELECT MAX(version) version,COUNT(*) count FROM schema_migrations").get() as {version:number;count:number});
  const backup=statusFile("backup"),restore=statusFile("restore");
  return NextResponse.json({generatedAt:new Date().toISOString(),application:{version:process.env.npm_package_version||"0.8.0-alpha.0",uptimeSeconds:Math.round(process.uptime()),rssBytes:memory.rss,heapBytes:memory.heapUsed,node:process.version},database:{status:integrity==="ok"&&migration.version>=8?"healthy":"degraded",integrity,sizeBytes:fs.statSync(databasePath).size,migrationVersion:migration.version,migrationsApplied:migration.count},storage:{status:disk.bavail/disk.blocks>.1?"healthy":"degraded",freeBytes:disk.bavail*disk.bsize,totalBytes:disk.blocks*disk.bsize},identity:{status:process.env.NORTHLINE_OIDC_ISSUER?"configured":"local-only",activeSessions:sessions},discord,reminders:{counts:Object.fromEntries(reminders.map(item=>[item.status,item.count])),lastDelivery:delivery},backup,restore});
}
export async function POST(){
  const admin=await requireAdmin();if(!admin)return NextResponse.json({error:"Forbidden"},{status:403});if(!discordConfigured())return NextResponse.json({error:"Task Buddy is not configured"},{status:409});
  const preferred=db.prepare("SELECT channel_id channelId,channel_name channelName FROM board_notification_settings WHERE channel_id IS NOT NULL ORDER BY updated_at DESC LIMIT 1").get() as {channelId:string;channelName:string}|undefined;
  if(!preferred)return NextResponse.json({error:"Configure a board notification channel first"},{status:409});
  const available=(await listDiscordChannels()).some(channel=>channel.id===preferred.channelId);if(!available)return NextResponse.json({error:"Configured test channel is unavailable"},{status:409});
  await sendDiscordReminder(preferred.channelId,`🩺 **Northline health check**\n✅ **${admin.name}** verified Task Buddy delivery.\n${(process.env.NORTHLINE_PUBLIC_URL||"https://northline.vtuberoffices.com").replace(/\/$/,"")}`);
  db.prepare("INSERT INTO audit_log(actor_id,action,target) VALUES(?,?,?)").run(admin.id,"HEALTH.DISCORD.TEST",preferred.channelName);
  return NextResponse.json({ok:true,channelName:preferred.channelName});
}
