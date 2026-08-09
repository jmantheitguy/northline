import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
const files=execFileSync("git",["ls-files"],{encoding:"utf8"}).trim().split(/\r?\n/).filter(Boolean);
const forbidden=[/Password1!/i,/\b0404\b/,/\b(?:192\.168|10\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/,/\b(?:1535449037946355712|1535450335147982910)\b/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/];
const findings=[];
for(const file of files){if(file==="scripts/secret-scan.mjs"||file.startsWith("tests/")||/\.(?:png|jpg|jpeg|gif|ico|woff2?|db|gz|enc|lock)$/i.test(file))continue;let content;try{content=readFileSync(file,"utf8")}catch{continue}for(const pattern of forbidden)if(pattern.test(content))findings.push(`${file}: ${pattern}`)}
if(findings.length){console.error("Potential public secret or private infrastructure value found:\n"+findings.join("\n"));process.exit(1)}
console.log(`Secret scan passed across ${files.length} tracked files`);
