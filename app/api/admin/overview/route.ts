import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import db from "@/lib/db";

export async function GET() {
  if(!await requireAdmin())return NextResponse.json({error:"Forbidden"},{status:403});
  const metrics={
    users:Number((db.prepare("SELECT COUNT(*) count FROM users").get() as {count:number}).count),
    activeBoards:Number((db.prepare("SELECT COUNT(*) count FROM boards").get() as {count:number}).count),
    admins:Number((db.prepare("SELECT COUNT(*) count FROM users WHERE role='Admin' AND status='Active'").get() as {count:number}).count),
    suspended:Number((db.prepare("SELECT COUNT(*) count FROM users WHERE status='Suspended'").get() as {count:number}).count),
  };
  const boards=db.prepare(`SELECT b.id,b.name,b.description,u.name ownerName,COUNT(DISTINCT bm.user_id) sharedUsers,COUNT(DISTINCT t.id) taskCount
    FROM boards b JOIN users u ON u.id=b.owner_id LEFT JOIN board_members bm ON bm.board_id=b.id LEFT JOIN tasks t ON t.board_id=b.id
    GROUP BY b.id ORDER BY b.updated_at DESC`).all();
  const audit=db.prepare(`SELECT a.id,a.action,a.target,a.created_at createdAt,COALESCE(u.name,'System') actorName
    FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 100`).all();
  return NextResponse.json({metrics,boards,audit});
}
