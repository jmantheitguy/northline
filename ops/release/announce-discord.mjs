const [version,commit,...summaryParts]=process.argv.slice(2);
const token=process.env.NORTHLINE_DISCORD_BOT_TOKEN,channel=process.env.NORTHLINE_RELEASE_CHANNEL_ID;
if(!version||!commit||!summaryParts.length)throw new Error("Usage: announce-discord.mjs <version> <commit> <summary>");
if(!token||!channel)throw new Error("Discord release announcements are not configured");
const summary=summaryParts.join(" "),repository=process.env.NORTHLINE_GITHUB_REPOSITORY||"jmantheitguy/northline",branch=process.env.NORTHLINE_GITHUB_BRANCH||"main",pusher=repository.split("/")[0],shortCommit=commit.slice(0,7),commitUrl=`https://github.com/${repository}/commit/${commit}`;
const embed={color:0x6557d9,author:{name:pusher,icon_url:`https://github.com/${encodeURIComponent(pusher)}.png`,url:`https://github.com/${encodeURIComponent(pusher)}`},title:`🚀 New Push to ${branch}`,url:commitUrl,description:`[\`${shortCommit}\`](${commitUrl}) **${version}:** ${summary}`,fields:[{name:"Repository",value:`[${repository}](https://github.com/${repository})`},{name:"Branch",value:`\`${branch}\``},{name:"Pusher",value:pusher}],footer:{text:"GitHub Push Event"},timestamp:new Date().toISOString()};
const response=await fetch(`https://discord.com/api/v10/channels/${encodeURIComponent(channel)}/messages`,{method:"POST",headers:{Authorization:`Bot ${token}`,"Content-Type":"application/json"},body:JSON.stringify({embeds:[embed],allowed_mentions:{parse:[]}})});
if(!response.ok)throw new Error(`Discord release announcement failed (${response.status}): ${await response.text()}`);
console.log(`Release announcement sent for ${version}`);
