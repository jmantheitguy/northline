const [version,commit,...summaryParts]=process.argv.slice(2);
const token=process.env.NORTHLINE_DISCORD_BOT_TOKEN;
const channelSpec=process.env.NORTHLINE_RELEASE_CHANNEL_IDS||process.env.NORTHLINE_RELEASE_CHANNEL_ID;
const channels=[...new Set(String(channelSpec||"").split(/[\s,]+/).map((value)=>value.trim()).filter(Boolean))];
if(!version||!commit||!summaryParts.length)throw new Error("Usage: announce-discord.mjs <version> <commit> <summary>");
if(!token||!channels.length)throw new Error("Discord release announcements are not configured");
const summary=summaryParts.join(" "),repository=process.env.NORTHLINE_GITHUB_REPOSITORY||"jmantheitguy/northline",branch=process.env.NORTHLINE_GITHUB_BRANCH||"main",pusher=repository.split("/")[0],shortCommit=commit.slice(0,7);
const embed={color:0x6557d9,author:{name:pusher},title:`🚀 New Push to ${branch}`,description:`${shortCommit} ${version}: ${summary}`,fields:[{name:"Repository",value:repository},{name:"Branch",value:branch},{name:"Pusher",value:pusher}],footer:{text:"GitHub Push Event"},timestamp:new Date().toISOString()};
const payload=JSON.stringify({embeds:[embed],allowed_mentions:{parse:[]}});
const results=await Promise.all(channels.map(async(channel)=>{
  const response=await fetch(`https://discord.com/api/v10/channels/${encodeURIComponent(channel)}/messages`,{method:"POST",headers:{Authorization:`Bot ${token}`,"Content-Type":"application/json"},body:payload});
  if(!response.ok)throw new Error(`channel announcement failed (${response.status}): ${await response.text()}`);
  return channel;
}));
console.log(`Release announcement sent for ${version} to ${results.length} Discord channels`);
