import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  discordConfigured,
  listDiscordChannels,
  sendDiscordDirectMessage,
} from "@/lib/discord";
import db from "@/lib/db";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function cpuSample() {
  return os.cpus().reduce(
    (sum, cpu) => {
      const total = Object.values(cpu.times).reduce((value, time) => value + time, 0);
      return { idle: sum.idle + cpu.times.idle, total: sum.total + total };
    },
    { idle: 0, total: 0 },
  );
}
let previousCpu = cpuSample();
function linuxMemory() {
  try {
    const values = Object.fromEntries(
      fs.readFileSync("/proc/meminfo", "utf8").trim().split("\n").map((line) => {
        const [key, raw = "0"] = line.split(":");
        return [key, Number(raw.trim().split(/\s+/)[0]) * 1024];
      }),
    );
    return {
      totalBytes: values.MemTotal || os.totalmem(),
      availableBytes: values.MemAvailable || os.freemem(),
      swapTotalBytes: values.SwapTotal || 0,
      swapFreeBytes: values.SwapFree || 0,
    };
  } catch {
    return { totalBytes: os.totalmem(), availableBytes: os.freemem(), swapTotalBytes: 0, swapFreeBytes: 0 };
  }
}

function statusFile(name: string) {
  try {
    return JSON.parse(
      fs.readFileSync(
        path.join(
          process.env.NORTHLINE_STATUS_DIR || "/app/status",
          `${name}.json`,
        ),
        "utf8",
      ),
    );
  } catch {
    return {
      status: "unknown",
      message: "No status report has been published yet",
    };
  }
}
export async function GET() {
  if (!(await requireAdmin()))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const databasePath = path.join(
    process.env.NORTHLINE_DATA_DIR || path.join(process.cwd(), "data"),
    "northline.db",
  );
  const memory = process.memoryUsage(),
    disk = fs.statfsSync(path.dirname(databasePath)),
    integrity =
      (db.pragma("quick_check") as Array<{ quick_check: string }>)[0]
        ?.quick_check || "unknown";
  const currentCpu = cpuSample(),
    cpuTotalDelta = currentCpu.total - previousCpu.total,
    cpuIdleDelta = currentCpu.idle - previousCpu.idle,
    cpuUsagePercent = cpuTotalDelta > 0 ? Math.max(0, Math.min(100, (1 - cpuIdleDelta / cpuTotalDelta) * 100)) : 0,
    hostMemory = linuxMemory();
  previousCpu = currentCpu;
  const delivery =
    db
      .prepare(
        "SELECT status,sent_at sentAt,error FROM reminders ORDER BY COALESCE(sent_at,created_at) DESC LIMIT 1",
      )
      .get() || null;
  const reminders = db
    .prepare("SELECT status,COUNT(*) count FROM reminders GROUP BY status")
    .all() as Array<{ status: string; count: number }>;
  const sessions = (
    db
      .prepare(
        "SELECT COUNT(*) count FROM sessions WHERE expires_at>datetime('now')",
      )
      .get() as { count: number }
  ).count;
  const discord = {
    configured: discordConfigured(),
    status: discordConfigured() ? "healthy" : "unconfigured",
    channels: 0,
    error: null as string | null,
  };
  if (discord.configured)
    try {
      discord.channels = (await listDiscordChannels()).length;
    } catch (error) {
      discord.status = "degraded";
      discord.error =
        error instanceof Error ? error.message : "Discord check failed";
    }
  const migration = db
    .prepare(
      "SELECT MAX(version) version,COUNT(*) count FROM schema_migrations",
    )
    .get() as { version: number; count: number };
  const backup = statusFile("backup"),
    restore = statusFile("restore");
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    application: {
      version: process.env.npm_package_version || "0.7.0-beta.0",
      uptimeSeconds: Math.round(process.uptime()),
      rssBytes: memory.rss,
      heapBytes: memory.heapUsed,
      node: process.version,
    },
    database: {
      status:
        integrity === "ok" && migration.version >= 16 ? "healthy" : "degraded",
      integrity,
      sizeBytes: fs.statSync(databasePath).size,
      migrationVersion: migration.version,
      migrationsApplied: migration.count,
    },
    storage: {
      status: disk.bavail / disk.blocks > 0.1 ? "healthy" : "degraded",
      freeBytes: disk.bavail * disk.bsize,
      totalBytes: disk.blocks * disk.bsize,
    },
    linux: {
      platform: `${os.type()} ${os.release()}`,
      hostname: os.hostname(),
      architecture: os.arch(),
      uptimeSeconds: Math.round(os.uptime()),
      cpuModel: os.cpus()[0]?.model || "Unknown CPU",
      cpuCores: os.cpus().length,
      cpuUsagePercent: Math.round(cpuUsagePercent * 10) / 10,
      loadAverage: os.loadavg().map((value) => Math.round(value * 100) / 100),
      memoryTotalBytes: hostMemory.totalBytes,
      memoryAvailableBytes: hostMemory.availableBytes,
      memoryUsedPercent: Math.round((1 - hostMemory.availableBytes / hostMemory.totalBytes) * 1000) / 10,
      swapTotalBytes: hostMemory.swapTotalBytes,
      swapUsedBytes: Math.max(0, hostMemory.swapTotalBytes - hostMemory.swapFreeBytes),
    },
    identity: {
      status: process.env.NORTHLINE_OIDC_ISSUER ? "configured" : "local-only",
      activeSessions: sessions,
    },
    discord,
    reminders: {
      counts: Object.fromEntries(
        reminders.map((item) => [item.status, item.count]),
      ),
      lastDelivery: delivery,
    },
    backup,
    restore,
  });
}
export async function POST() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!discordConfigured())
    return NextResponse.json(
      { error: "Task Buddy is not configured" },
      { status: 409 },
    );
  const recipient = db
    .prepare("SELECT discord_user_id discordUserId FROM users WHERE id=?")
    .get(admin.id) as { discordUserId: string | null } | undefined;
  if (!recipient?.discordUserId)
    return NextResponse.json(
      { error: "Link Discord before testing Task Buddy delivery" },
      { status: 409 },
    );
  await sendDiscordDirectMessage(
    recipient.discordUserId,
    `🩺 **Northline health check**\n✅ **${admin.name}** verified private Task Buddy delivery.\n${(process.env.NORTHLINE_PUBLIC_URL || "https://northline.vtuberoffices.com").replace(/\/$/, "")}`,
  );
  db.prepare("INSERT INTO audit_log(actor_id,action,target) VALUES(?,?,?)").run(
    admin.id,
    "HEALTH.DISCORD.TEST",
    "Direct message",
  );
  return NextResponse.json({ ok: true, recipientName: admin.name });
}
