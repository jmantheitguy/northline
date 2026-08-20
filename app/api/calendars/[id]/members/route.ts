import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import db from "@/lib/db";
import {
  calendarIdByKey,
  calendarPermission,
  recordCalendarActivity,
} from "@/lib/calendars";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = await calendarIdByKey((await params).id);
  if (!id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (await calendarPermission(user, id) !== "owner")
    return NextResponse.json(
      { error: "Only the calendar owner can share it" },
      { status: 403 },
    );
  const body = await request.json();
  const userId = Number(body.userId);
  const permission = String(body.permission);
  if (!["viewer", "editor"].includes(permission))
    return NextResponse.json({ error: "Invalid permission" }, { status: 400 });
  const target = await db
    .prepare("SELECT id,name,status FROM users WHERE id=?")
    .get(userId) as { id: number; name: string; status: string } | undefined;
  if (!target || target.status !== "Active")
    return NextResponse.json(
      { error: "Active user not found" },
      { status: 404 },
    );
  await db.prepare(
    "INSERT INTO calendar_members(calendar_id,user_id,permission) VALUES(?,?,?) ON CONFLICT(calendar_id,user_id) DO UPDATE SET permission=excluded.permission",
  ).run(id, userId, permission);
  await recordCalendarActivity(
    id,
    user.id,
    "CALENDAR.SHARE",
    `Shared calendar with ${target.name} as ${permission}`,
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: Context) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = await calendarIdByKey((await params).id);
  if (!id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (await calendarPermission(user, id) !== "owner")
    return NextResponse.json(
      { error: "Only the calendar owner can change sharing" },
      { status: 403 },
    );
  const userId = Number(new URL(request.url).searchParams.get("userId"));
  const target = await db.prepare("SELECT name FROM users WHERE id=?").get(userId) as
    { name: string } | undefined;
  await db.prepare(
    "DELETE FROM calendar_members WHERE calendar_id=? AND user_id=?",
  ).run(id, userId);
  await recordCalendarActivity(
    id,
    user.id,
    "CALENDAR.UNSHARE",
    `Removed ${target?.name || "a member"} from the calendar`,
  );
  return NextResponse.json({ ok: true });
}
