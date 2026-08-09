import db from "./db";

type AuthentikGroup=string|{name?:string};
type AuthentikUser={pk?:number;uuid?:string;username?:string;name?:string;email?:string;avatar?:string;is_active?:boolean;groups?:AuthentikGroup[];groups_obj?:AuthentikGroup[];attributes?:{discord?:{id?:string;avatar_url?:string}}};

const groupNames=(user:AuthentikUser)=>[...(user.groups||[]),...(user.groups_obj||[])].map(group=>typeof group==="string"?group:group.name||"");

export async function syncAuthentikDirectory(force=false){
  const base=process.env.NORTHLINE_AUTHENTIK_API_URL?.replace(/\/$/,"");
  const token=process.env.NORTHLINE_AUTHENTIK_API_TOKEN;
  if(!base||!token)return {configured:false,synced:0};
  const last=db.prepare("SELECT value FROM app_meta WHERE key='authentik_directory_synced_at'").get() as {value:string}|undefined;
  if(!force&&last&&Date.now()-new Date(last.value).getTime()<300000)return {configured:true,synced:0,cached:true};
  const response=await fetch(`${base}/api/v3/core/users/?page_size=100`,{headers:{Authorization:`Bearer ${token}`,Accept:"application/json"},cache:"no-store"});
  if(!response.ok)throw new Error(`Authentik directory returned ${response.status}`);
  const payload=await response.json() as {results?:AuthentikUser[]};
  const users=payload.results||[];
  if(users.length&&!users.some(user=>Array.isArray(user.groups_obj)))throw new Error("Authentik response did not include expanded group membership");
  const activeDirectoryIds:string[]=[];
  db.transaction(()=>{
    for(const remote of users){
      const groups=groupNames(remote),isAdmin=groups.includes("Northline Admins"),hasAccess=isAdmin||groups.includes("Northline Users");
      const directoryId=remote.uuid||String(remote.pk||"");
      const email=remote.email||remote.username;
      if(!hasAccess||!directoryId||!email)continue;
      activeDirectoryIds.push(directoryId);
      const existing=db.prepare("SELECT id FROM users WHERE directory_id=? OR email=? COLLATE NOCASE ORDER BY directory_id=? DESC LIMIT 1").get(directoryId,email,directoryId) as {id:number}|undefined;
      const avatar=remote.attributes?.discord?.avatar_url||remote.avatar||null;
      if(existing)db.prepare("UPDATE users SET name=?,email=?,role=?,status=?,directory_id=?,discord_user_id=?,auth_source='oidc',identity_synced_at=CURRENT_TIMESTAMP,avatar=COALESCE(?,avatar) WHERE id=?").run(remote.name||remote.username||email,email,isAdmin?"Admin":"Member",remote.is_active===false?"Suspended":"Active",directoryId,remote.attributes?.discord?.id||null,avatar,existing.id);
      else db.prepare("INSERT INTO users(name,email,password_hash,role,status,directory_id,discord_user_id,auth_source,identity_synced_at,avatar) VALUES(?,?,?,?,?,?,?,'oidc',CURRENT_TIMESTAMP,?)").run(remote.name||remote.username||email,email,"oidc-managed-account",isAdmin?"Admin":"Member",remote.is_active===false?"Suspended":"Active",directoryId,remote.attributes?.discord?.id||null,avatar);
    }
    const managed=db.prepare("SELECT id,directory_id directoryId FROM users WHERE auth_source='oidc' AND directory_id IS NOT NULL").all() as Array<{id:number;directoryId:string}>;
    for(const local of managed)if(!activeDirectoryIds.includes(local.directoryId)){db.prepare("UPDATE users SET status='Suspended',identity_synced_at=CURRENT_TIMESTAMP WHERE id=?").run(local.id);db.prepare("DELETE FROM sessions WHERE user_id=?").run(local.id);}
    db.prepare("INSERT INTO app_meta(key,value) VALUES('authentik_directory_synced_at',CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=CURRENT_TIMESTAMP").run();
  })();
  return {configured:true,synced:activeDirectoryIds.length};
}
