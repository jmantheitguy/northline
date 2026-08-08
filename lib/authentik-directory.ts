import db from "./db";

type AuthentikGroup=string|{name?:string};
type AuthentikUser={pk?:number;uuid?:string;username?:string;name?:string;email?:string;is_active?:boolean;groups?:AuthentikGroup[];groups_obj?:AuthentikGroup[]};

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
  const activeEmails:string[]=[];
  const upsert=db.prepare(`INSERT INTO users(name,email,password_hash,role,status,oidc_subject,auth_source,identity_synced_at) VALUES(?,?,?,?,?,?, 'oidc',CURRENT_TIMESTAMP)
    ON CONFLICT(email) DO UPDATE SET name=excluded.name,role=excluded.role,status=excluded.status,oidc_subject=excluded.oidc_subject,auth_source='oidc',identity_synced_at=CURRENT_TIMESTAMP`);
  db.transaction(()=>{
    for(const remote of users){
      const groups=groupNames(remote),isAdmin=groups.includes("Northline Admins"),hasAccess=isAdmin||groups.includes("Northline Users");
      const subject=remote.uuid||String(remote.pk||"");
      const email=remote.email||remote.username;
      if(!hasAccess||!subject||!email)continue;
      activeEmails.push(email.toLowerCase());
      upsert.run(remote.name||remote.username||email,email,"oidc-managed-account",isAdmin?"Admin":"Member",remote.is_active===false?"Suspended":"Active",subject);
    }
    const managed=db.prepare("SELECT id,email FROM users WHERE auth_source='oidc'").all() as Array<{id:number;email:string}>;
    for(const local of managed)if(!activeEmails.includes(local.email.toLowerCase())){db.prepare("UPDATE users SET status='Suspended',identity_synced_at=CURRENT_TIMESTAMP WHERE id=?").run(local.id);db.prepare("DELETE FROM sessions WHERE user_id=?").run(local.id);}
    db.prepare("INSERT INTO app_meta(key,value) VALUES('authentik_directory_synced_at',CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=CURRENT_TIMESTAMP").run();
  })();
  return {configured:true,synced:activeEmails.length};
}
