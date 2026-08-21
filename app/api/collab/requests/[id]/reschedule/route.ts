import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import db, { createCollabReschedulePublicId } from "@/lib/db";
import { validTimezone } from "@/lib/calendars";
import { parseDateTimeInZone } from "@/lib/timezones";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const collab = await db
    .prepare(
      "SELECT id,requester_id requesterId,title,status FROM collab_requests WHERE public_id=?",
    )
    .get((await params).id) as
    | { id: number; requesterId: number; title: string; status: string }
    | undefined;
  if (!collab)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  const accepted = await db
    .prepare(
      "SELECT user_id userId FROM collab_request_participants WHERE collab_request_id=? AND status='accepted'",
    )
    .all(collab.id) as Array<{ userId: number }>;
  const members = new Set([
    collab.requesterId,
    ...accepted.map((item) => item.userId),
  ]);
  if (collab.status !== "accepted" || !members.has(user.id))
    return NextResponse.json(
      {
        error:
          "Only accepted collaboration participants can request a new time",
      },
      { status: 403 },
    );
  try {
    const body = await request.json(),
      timezone = validTimezone(body.timezone),
      start = parseDateTimeInZone(body.startAt, timezone),
      end = parseDateTimeInZone(body.endAt, timezone),
      message = String(body.message || "")
        .trim()
        .slice(0, 1000);
    if (
      Number.isNaN(start.valueOf()) ||
      Number.isNaN(end.valueOf()) ||
      end <= start
    )
      throw new Error("Enter a valid proposed time");
    const key = createCollabReschedulePublicId();
    await db.transaction(async () => {
      const result = await db
        .prepare(
          "INSERT INTO collab_reschedule_proposals(public_id,collab_request_id,proposed_by,proposed_start_at,proposed_end_at,timezone,message) VALUES(?,?,?,?,?,?,?)",
        )
        .run(
          key,
          collab.id,
          user.id,
          start.toISOString(),
          end.toISOString(),
          timezone,
          message,
        );
      const proposalId = Number(result.lastInsertRowid),
        add = db.prepare(
          "INSERT INTO collab_reschedule_responses(proposal_id,user_id) VALUES(?,?)",
        );
      for (const memberId of members)
        if (memberId !== user.id) await add.run(proposalId, memberId);
      const recipients =
        user.id === collab.requesterId
          ? accepted.map((item) => item.userId)
          : [collab.requesterId];
      for (const recipientId of recipients)
        await queue(
          collab.id,
          recipientId,
          `${user.name} proposed a new time for “${collab.title}”. Review it in the Collab planner.`,
        );
    });
    return NextResponse.json({ id: key }, { status: 201 });
  } catch (error) {
    const message = (error as Error).message.includes("UNIQUE constraint")
      ? "A reschedule proposal is already waiting for responses"
      : (error as Error).message;
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
async function queue(requestId: number, recipient: number, message: string) {
  await db.prepare(
    "INSERT INTO collab_notifications(collab_request_id,recipient_user_id,message) VALUES(?,?,?)",
  ).run(requestId, recipient, message);
}
