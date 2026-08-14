import "server-only";

const apiBase = "https://discord.com/api/v10";

export const discordConfigured = () => Boolean(process.env.NORTHLINE_DISCORD_BOT_TOKEN && process.env.NORTHLINE_DISCORD_GUILD_ID);

async function discord(path: string, init?: RequestInit) {
  const token = process.env.NORTHLINE_DISCORD_BOT_TOKEN;
  if (!token) throw new Error("Discord bot is not configured");
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!response.ok) throw new Error(`Discord API returned ${response.status}`);
  return response.status === 204 ? null : response.json();
}

export async function listDiscordChannels() {
  const guild = process.env.NORTHLINE_DISCORD_GUILD_ID;
  if (!guild) return [];
  const channels = await discord(`/guilds/${guild}/channels`) as Array<{id:string;name:string;type:number;position:number}>;
  return channels.filter(channel => channel.type === 0 || channel.type === 5)
    .sort((a,b) => a.position-b.position).map(({id,name}) => ({id,name}));
}

export async function discordMemberProfile(userId: string) {
  const guild = process.env.NORTHLINE_DISCORD_GUILD_ID;
  type DiscordUser={id?:string;username?:string;global_name?:string|null;avatar?:string|null};
  let user:DiscordUser|undefined;
  if(guild){
    try{
      const member=await discord(`/guilds/${guild}/members/${encodeURIComponent(userId)}`) as {user?:DiscordUser};
      user=member.user;
    }catch{
      // A linked Discord account can be valid even when Task Buddy cannot
      // resolve it as a member of the configured guild.
    }
  }
  if(!user)user=await discord(`/users/${encodeURIComponent(userId)}`) as DiscordUser;
  const id=user.id||userId,avatar=user.avatar;
  const identity={id,username:user.username||null,globalName:user.global_name||null};
  if(!avatar)return {...identity,avatarUrl:null};
  const extension=avatar.startsWith("a_")?"gif":"png";
  return {...identity,avatarUrl:`https://cdn.discordapp.com/avatars/${id}/${avatar}.${extension}?size=128`};
}

export async function sendDiscordDirectMessage(userId: string, content: string) {
  const channel=await discord("/users/@me/channels",{method:"POST",body:JSON.stringify({recipient_id:userId})}) as {id:string};
  await discord(`/channels/${channel.id}/messages`,{method:"POST",body:JSON.stringify({content,flags:4,allowed_mentions:{parse:[]}})});
}
