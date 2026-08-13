import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import db, { createCollabRequestPublicId } from "@/lib/db";
import { calendarIdByKey, canEditCalendar, calendarPermission, validTimezone } from "@/lib/calendars";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const requests = db.prepare(`SELECT r.public_id id,r.requester_id requesterId,r.recipient_id recipientId,
    r.proposed_start_at startAt,r.proposed_end_at endAt,r.timezone,r.title,r.message,r.status,
    r.response_message responseMessage,r.created_at createdAt,r.updated_at updatedAt,
    requester.name requesterName,requester.avatar requesterAvatar,recipient.name recipientName,recipient.avatar recipientAvatar,
    e.public_id sourceEventId,e.title sourceEventTitle
    FROM collab_requests r JOIN users requester ON requester.id=r.requester_id JOIN users recipient ON recipient.id=r.recipient_id
    LEFT JOIN calendar_events e ON e.id=r.source_event_id
    WHERE r.requester_id=? OR r.recipient_id=? ORDER BY CASE WHEN r.status='pending' THEN 0 ELSE 1 END,r.updated_at DESC`).all(user.id, user.id);
  return NextResponse.json({ requests, currentUserId: user.id });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const recipientId = Number(body.recipientId);
    const calendarId = calendarIdByKey(String(body.calendarId || ""));
    const start = new Date(body.startAt), end = new Date(body.endAt);
    const title = String(body.title || "").trim().slice(0, 160);
    const message = String(body.message || "").trim().slice(0, 2000);
    const timezone = validTimezone(body.timezone);
    if (!calendarId || !canEditCalendar(calendarPermission(user, calendarId))) throw new Error("Choose a calendar you can edit");
    if (!recipientId || recipientId === user.id) throw new Error("Choose another streamer");
    const recipient = db.prepare("SELECT id FROM users WHERE id=? AND status='Active'").get(recipientId);
    if (!recipient || !title || Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf()) || end <= start) throw new Error("Enter a valid streamer, title, and time range");
    const pendingCount=(db.prepare("SELECT COUNT(*) count FROM collab_requests WHERE requester_id=? AND status IN ('pending','countered')").get(user.id) as {count:number}).count;
    if(pendingCount>=20) throw new Error("Resolve or cancel an open collaboration request before sending more");
    let sourceEventId: number | null = null;
    if (body.sourceEventId) {
      const source = db.prepare(`SELECT e.id,c.owner_id ownerId,c.calendar_type calendarType,c.visibility calendarVisibility,e.visibility,e.collab_enabled collabEnabled
        FROM calendar_events e JOIN calendars c ON c.id=e.calendar_id WHERE e.public_id=? AND e.deleted_at IS NULL AND c.deleted_at IS NULL`).get(String(body.sourceEventId)) as { id:number;ownerId:number;calendarType:string;calendarVisibility:string;visibility:string } | undefined;
      if (!source || source.ownerId !== recipientId || source.calendarType !== "streaming" || !["team","public"].includes(source.calendarVisibility) || !["calendar","team","public"].includes(source.visibility) || Number((source as {collabEnabled?:number}).collabEnabled)!==1) throw new Error("That schedule item is not available for collaboration requests");
      sourceEventId = source.id;
    }
    const key = createCollabRequestPublicId();
    const result = db.prepare(`INSERT INTO collab_requests(public_id,source_event_id,requester_id,recipient_id,requester_calendar_id,proposed_start_at,proposed_end_at,timezone,title,message)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).run(key,sourceEventId,user.id,recipientId,calendarId,start.toISOString(),end.toISOString(),timezone,title,message);
    db.prepare("INSERT INTO collab_notifications(collab_request_id,recipient_user_id,message) VALUES(?,?,?)").run(Number(result.lastInsertRowid),recipientId,`${user.name} invited you to collaborate on “${title}”.`);
    return NextResponse.json({ id:key }, { status:201 });
  } catch (error) {
    return NextResponse.json({ error:(error as Error).message }, { status:400 });
  }
}
