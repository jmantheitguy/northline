import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import db from "@/lib/db";

export async function GET(request:Request){
  const user=await currentUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const q=new URL(request.url).searchParams.get("q")?.trim()||"";if(q.length<2)return NextResponse.json({results:[]});
  const results=await db.prepare(`SELECT DISTINCT t.id,t.title,t.status,t.priority,b.id boardId,b.public_id boardKey,b.name boardName
    FROM tasks t JOIN boards b ON b.id=t.board_id JOIN workspaces w ON w.id=b.workspace_id LEFT JOIN board_members bm ON bm.board_id=b.id AND bm.user_id=? LEFT JOIN workspace_members wm ON wm.workspace_id=w.id AND wm.user_id=? LEFT JOIN team_workspaces tw ON tw.workspace_id=w.id LEFT JOIN teams team ON team.id=tw.team_id LEFT JOIN team_members tm ON tm.team_id=tw.team_id AND tm.user_id=?
    WHERE t.archived_at IS NULL AND (b.owner_id=? OR w.owner_id=? OR bm.user_id=? OR wm.user_id=? OR team.owner_id=? OR tm.user_id=?) AND (t.title LIKE ? ESCAPE '\\' OR t.description LIKE ? ESCAPE '\\' OR t.tag LIKE ? ESCAPE '\\')
    ORDER BY t.updated_at DESC LIMIT 25`).all(user.id,user.id,user.id,user.id,user.id,user.id,user.id,user.id,user.id,...Array(3).fill(`%${q.replace(/[\\%_]/g,"\\$&")}%`));
  return NextResponse.json({results});
}
