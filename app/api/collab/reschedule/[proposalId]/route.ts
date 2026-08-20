import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import db from "@/lib/db";

type Proposal = {
  id: number;
  collab_request_id: number;
  proposed_by: number;
  proposed_start_at: string;
  proposed_end_at: string;
  timezone: string;
  status: string;
  title: string;
  requester_id: number;
};
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ proposalId: string }> },
) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const proposal = await db
    .prepare(
      `SELECT p.*,r.title,r.requester_id FROM collab_reschedule_proposals p JOIN collab_requests r ON r.id=p.collab_request_id WHERE p.public_id=?`,
    )
    .get((await params).proposalId) as Proposal | undefined;
  if (!proposal || proposal.status !== "pending")
    return NextResponse.json(
      { error: "Open reschedule proposal not found" },
      { status: 404 },
    );
  const response = await db
    .prepare(
      "SELECT status FROM collab_reschedule_responses WHERE proposal_id=? AND user_id=?",
    )
    .get(proposal.id, user.id) as { status: string } | undefined;
  if (!response || response.status !== "pending")
    return NextResponse.json(
      { error: "You do not have a pending response" },
      { status: 403 },
    );
  const action = String((await request.json()).action || "");
  if (!["accept", "decline"].includes(action))
    return NextResponse.json(
      { error: "Choose accept or decline" },
      { status: 400 },
    );
  await db.transaction(async () => {
    await db.prepare(
      "UPDATE collab_reschedule_responses SET status=?,responded_at=CURRENT_TIMESTAMP WHERE proposal_id=? AND user_id=?",
    ).run(action === "accept" ? "accepted" : "declined", proposal.id, user.id);
    if (action === "decline") {
      await db.prepare(
        "UPDATE collab_reschedule_proposals SET status='declined',resolved_at=CURRENT_TIMESTAMP WHERE id=?",
      ).run(proposal.id);
      await queue(
        proposal.collab_request_id,
        proposal.proposed_by,
        `${user.name} could not accept the proposed new time for “${proposal.title}”.`,
      );
      return;
    }
    const remaining = (
      await db
        .prepare(
          "SELECT COUNT(*) count FROM collab_reschedule_responses WHERE proposal_id=? AND status='pending'",
        )
        .get(proposal.id) as { count: number }
    ).count;
    if (remaining === 0) {
      await db.prepare(
        "UPDATE calendar_events SET start_at=?,end_at=?,timezone=?,updated_at=CURRENT_TIMESTAMP WHERE collab_request_id=? AND deleted_at IS NULL",
      ).run(
        proposal.proposed_start_at,
        proposal.proposed_end_at,
        proposal.timezone,
        proposal.collab_request_id,
      );
      await db.prepare(
        "UPDATE collab_requests SET proposed_start_at=?,proposed_end_at=?,timezone=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      ).run(
        proposal.proposed_start_at,
        proposal.proposed_end_at,
        proposal.timezone,
        proposal.collab_request_id,
      );
      const reminderAt = new Date(
        new Date(proposal.proposed_start_at).getTime() - 30 * 60 * 1000,
      );
      if (reminderAt > new Date())
        await db.prepare(
          `UPDATE calendar_reminders SET remind_at=?,error=NULL
           WHERE status='pending' AND message LIKE 'Collab starts in 30 minutes:%'
             AND calendar_event_id IN
               (SELECT id FROM calendar_events WHERE collab_request_id=?)`,
        ).run(reminderAt.toISOString(), proposal.collab_request_id);
      else
        await db.prepare(
          `UPDATE calendar_reminders SET status='cancelled',error=NULL
           WHERE status='pending' AND message LIKE 'Collab starts in 30 minutes:%'
             AND calendar_event_id IN
               (SELECT id FROM calendar_events WHERE collab_request_id=?)`,
        ).run(proposal.collab_request_id);
      await db.prepare(
        "UPDATE collab_reschedule_proposals SET status='accepted',resolved_at=CURRENT_TIMESTAMP WHERE id=?",
      ).run(proposal.id);
      const members = await db
        .prepare(
          "SELECT user_id userId FROM collab_request_participants WHERE collab_request_id=? AND status='accepted'",
        )
        .all(proposal.collab_request_id) as Array<{ userId: number }>;
      for (const recipientId of new Set([
        proposal.requester_id,
        ...members.map((item) => item.userId),
      ]))
        if (recipientId !== user.id)
          await queue(
            proposal.collab_request_id,
            recipientId,
            `The new time for “${proposal.title}” was accepted by everyone and all calendars were updated.`,
          );
    } else {
      await queue(
        proposal.collab_request_id,
        proposal.proposed_by,
        `${user.name} accepted the proposed new time for “${proposal.title}”.`,
      );
      if (user.id === proposal.requester_id) {
        const waiting = await db
          .prepare(
            "SELECT user_id userId FROM collab_reschedule_responses WHERE proposal_id=? AND status='pending'",
          )
          .all(proposal.id) as Array<{ userId: number }>;
        for (const item of waiting)
          await queue(
            proposal.collab_request_id,
            item.userId,
            `The organizer approved a proposed new time for “${proposal.title}”. Please review it in the Collab planner.`,
          );
      }
    }
  });
  return NextResponse.json({ ok: true });
}
async function queue(requestId: number, recipient: number, message: string) {
  await db.prepare(
    "INSERT INTO collab_notifications(collab_request_id,recipient_user_id,message) VALUES(?,?,?)",
  ).run(requestId, recipient, message);
}
