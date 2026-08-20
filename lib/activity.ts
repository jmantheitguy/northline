import "server-only";
import db from "./db";

export async function recordBoardActivity(boardId:number,actorId:number,action:string,detail:string){
  await db.prepare("INSERT INTO board_activity(board_id,actor_id,action,detail) VALUES(?,?,?,?)").run(boardId,actorId,action,detail.slice(0,500));
}
