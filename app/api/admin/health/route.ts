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
  const isPostgres = process.env.NORTHLINE_DB_DRIVER === "postgres";
  const databasePath = path.join(
    process.env.NORTHLINE_DATA_DIR || path.join(process.cwd(), "data"),
    "northline.db",
  );
  const memory = process.memoryUsage();
  let disk: ReturnType<typeof fs.statfsSync>;
  try {
    disk = fs.statfsSync(path.dirname(databasePath));
  } catch {
    // PostgreSQL deployments may not mount the SQLite data directory. The
    // application filesystem is still useful for a storage health signal.
    disk = fs.statfsSync(process.cwd());
  }
  let integrity = "unknown";
  try {
    if (isPostgres) {
      await db.prepare("SELECT 1 AS ok").get();
      integrity = "ok";
    } else {
      integrity =
        (db.pragma("quick_check") as Array<{ quick_check: string }>)[0]
          ?.quick_check || "unknown";
    }
  } catch {
    integrity = "degraded";
  }
  const delivery =
    await db
      .prepare(
        "SELECT status,sent_at sentAt,error FROM reminders ORDER BY COALESCE(sent_at,created_at) DESC LIMIT 1",
      )
      .get() || null;
  const reminders = await db
    .prepare("SELECT status,COUNT(*) count FROM reminders GROUP BY status")
    .all() as Array<{ status: string; count: number }>;
  const sessions = (
    await db
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
  const migration = await db
    .prepare(
      "SELECT MAX(version) version,COUNT(*) count FROM schema_migrations",
    )
    .get() as { version: number; count: number };
  const backup = statusFile("backup"),
    restore = statusFile("restore");
  let databaseSizeBytes = 0;
  try {
    if (isPostgres) {
      const size = await db
        .prepare("SELECT pg_database_size(current_database()) AS sizeBytes")
        .get() as { sizeBytes?: number | string } | undefined;
      databaseSizeBytes = Number(size?.sizeBytes || 0);
    } else if (fs.existsSync(databasePath)) {
      databaseSizeBytes = fs.statSync(databasePath).size;
    }
  } catch {
    databaseSizeBytes = 0;
  }
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    application: {
      version: process.env.npm_package_version || "0.9.5-beta.0",
      uptimeSeconds: Math.round(process.uptime()),
      rssBytes: memory.rss,
      heapBytes: memory.heapUsed,
      node: process.version,
    },
    database: {
      status:
        integrity === "ok" && migration.version >= 21 ? "healthy" : "degraded",
      integrity,
      sizeBytes: databaseSizeBytes,
      migrationVersion: migration.version,
      migrationsApplied: migration.count,
    },
    storage: {
      status: disk.bavail / disk.blocks > 0.1 ? "healthy" : "degraded",
      freeBytes: disk.bavail * disk.bsize,
      totalBytes: disk.blocks * disk.bsize,
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
  const recipient = await db
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
  await db.prepare("INSERT INTO audit_log(actor_id,action,target) VALUES(?,?,?)").run(
    admin.id,
    "HEALTH.DISCORD.TEST",
    "Direct message",
  );
  return NextResponse.json({ ok: true, recipientName: admin.name });
}
