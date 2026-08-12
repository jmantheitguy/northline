import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import db from "@/lib/db";

type WorkTask={id:number;boardId:number};

export async function GET(){
  const user=await currentUser();
  if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const tasks=db.prepare(`
    SELECT t.id,t.title,t.description,t.status,t.priority,t.tag,t.due_date due,t.updated_at updatedAt,
      b.id boardId,b.public_id boardKey,b.name boardName,w.id workspaceId,w.public_id workspaceKey,w.name workspaceName,
      c.name statusName,c.color statusColor,c.is_done isDone,
      CASE
        WHEN b.owner_id=? OR w.owner_id=? THEN 'owner'
        WHEN bm.permission='editor' OR wm.permission='editor' THEN 'editor'
        ELSE 'viewer'
      END permission
    FROM tasks t
    JOIN boards b ON b.id=t.board_id
    JOIN workspaces w ON w.id=b.workspace_id
    JOIN board_columns c ON c.board_id=b.id AND c.column_key=t.status
    LEFT JOIN board_members bm ON bm.board_id=b.id AND bm.user_id=?
    LEFT JOIN workspace_members wm ON wm.workspace_id=w.id AND wm.user_id=?
    WHERE t.assignee_id=?
      AND (b.owner_id=? OR w.owner_id=? OR bm.user_id IS NOT NULL OR wm.user_id IS NOT NULL)
    ORDER BY c.is_done,t.due_date IS NULL,t.due_date,t.updated_at DESC
  `).all(user.id,user.id,user.id,user.id,user.id,user.id,user.id) as Array<WorkTask&Record<string,unknown>>;
  const boardIds=[...new Set(tasks.map(task=>task.boardId))];
  const columns=boardIds.length?db.prepare(`SELECT board_id boardId,column_key key,name,color,position,is_done isDone FROM board_columns WHERE board_id IN (${boardIds.map(()=>"?").join(",")}) ORDER BY board_id,position`).all(...boardIds):[];
  return NextResponse.json({tasks,columns});
}
