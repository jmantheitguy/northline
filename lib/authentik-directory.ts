import db from "./db";
import { discordMemberProfile } from "./discord";

type AuthentikGroup=string|{name?:string};
type DiscordAttributes={id?:string;username?:string|null;global_name?:string|null;avatar_url?:string|null};
type AuthentikAttributes=Record<string,unknown>&{discord?:DiscordAttributes;avatar?:string};
type AuthentikUser={pk?:number;uuid?:string;username?:string;name?:string;email?:string;avatar?:string;is_active?:boolean;groups?:AuthentikGroup[];groups_obj?:AuthentikGroup[];attributes?:AuthentikAttributes};
type SourceConnection={user?:number;identifier?:string;source?:string};
type DiscordProfile={id:string;username:string|null;globalName:string|null;avatarUrl:string|null};

const groupNames=(user:AuthentikUser)=>[...(user.groups||[]),...(user.groups_obj||[])].map(group=>typeof group==="string"?group:group.name||"");

async function backfillDiscordIdentity(base:string,token:string,user:AuthentikUser,profile:DiscordProfile){
  if(!user.pk)return false;
  const current=user.attributes?.discord;
  if(current?.id===profile.id&&current.avatar_url===profile.avatarUrl)return false;
  const discord={id:profile.id,username:profile.username,global_name:profile.globalName,avatar_url:profile.avatarUrl};
  const attributes={...(user.attributes||{}),discord,...(profile.avatarUrl?{avatar:profile.avatarUrl}:{})};
  const response=await fetch(`${base}/api/v3/core/users/${user.pk}/`,{
    method:"PATCH",
    headers:{Authorization:`Bearer ${token}`,Accept:"application/json","Content-Type":"application/json"},
    body:JSON.stringify({attributes}),
    cache:"no-store",
  });
  if(!response.ok)throw new Error(`Authentik Discord profile backfill returned ${response.status}`);
  user.attributes=attributes;
  user.avatar=profile.avatarUrl||user.avatar;
  return true;
}

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
  const [sourceResponse,connectionsResponse]=await Promise.all([
    fetch(`${base}/api/v3/sources/oauth/?slug=discord&page_size=10`,{headers:{Authorization:`Bearer ${token}`,Accept:"application/json"},cache:"no-store"}),
    fetch(`${base}/api/v3/sources/user_connections/all/?page_size=100`,{headers:{Authorization:`Bearer ${token}`,Accept:"application/json"},cache:"no-store"}),
  ]);
  const sourcePayload=sourceResponse.ok?await sourceResponse.json() as {results?:Array<{pk?:string}>}:{results:[]};
  const connectionsPayload=connectionsResponse.ok?await connectionsResponse.json() as {results?:SourceConnection[]}:{results:[]};
  const discordSource=sourcePayload.results?.[0]?.pk;
  const connectionByUser=new Map((connectionsPayload.results||[]).filter(item=>item.source===discordSource&&item.user&&item.identifier).map(item=>[item.user as number,item.identifier as string]));
  const discordProfiles=new Map<number,DiscordProfile>();
  let discordProfilesBackfilled=0;
  for(const remote of users){
    const linkedId=remote.pk?connectionByUser.get(remote.pk):undefined;
    if(!linkedId)continue;
    const profile=await discordMemberProfile(linkedId).catch(()=>null);
    if(!profile)continue;
    discordProfiles.set(remote.pk as number,profile);
    try{if(await backfillDiscordIdentity(base,token,remote,profile))discordProfilesBackfilled++;}
    catch(error){console.error(`Authentik Discord profile backfill failed for user ${remote.pk}`,error);}
  }
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
      const linked=remote.pk?discordProfiles.get(remote.pk):undefined;
      const discordId=linked?.id||remote.attributes?.discord?.id||null;
      const discordUsername=linked?.username||remote.attributes?.discord?.username||null;
      const avatar=linked?.avatarUrl||remote.attributes?.discord?.avatar_url||remote.avatar||null;
      if(existing)db.prepare("UPDATE users SET name=?,email=?,role=?,status=?,directory_id=?,discord_user_id=?,discord_username=?,auth_source='oidc',identity_synced_at=CURRENT_TIMESTAMP,avatar=COALESCE(?,avatar),directory_visible=1 WHERE id=?").run(remote.name||remote.username||email,email,isAdmin?"Admin":"Member",remote.is_active===false?"Suspended":"Active",directoryId,discordId,discordUsername,avatar,existing.id);
      else db.prepare("INSERT INTO users(name,email,password_hash,role,status,directory_id,discord_user_id,discord_username,auth_source,identity_synced_at,avatar,directory_visible) VALUES(?,?,?,?,?,?,?,?,'oidc',CURRENT_TIMESTAMP,?,1)").run(remote.name||remote.username||email,email,"oidc-managed-account",isAdmin?"Admin":"Member",remote.is_active===false?"Suspended":"Active",directoryId,discordId,discordUsername,avatar);
    }
    const managed=db.prepare("SELECT id,directory_id directoryId FROM users WHERE auth_source='oidc' AND directory_id IS NOT NULL").all() as Array<{id:number;directoryId:string}>;
    for(const local of managed)if(!activeDirectoryIds.includes(local.directoryId)){db.prepare("UPDATE users SET status='Suspended',identity_synced_at=CURRENT_TIMESTAMP WHERE id=?").run(local.id);db.prepare("DELETE FROM sessions WHERE user_id=?").run(local.id);}
    db.prepare("INSERT INTO app_meta(key,value) VALUES('authentik_directory_synced_at',CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=CURRENT_TIMESTAMP").run();
  })();
  return {configured:true,synced:activeDirectoryIds.length,discordProfilesBackfilled};
}
