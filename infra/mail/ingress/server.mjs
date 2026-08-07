import { createServer } from "node:http";
import { connect } from "node:net";
import { timingSafeEqual } from "node:crypto";

const token = process.env.INGRESS_TOKEN || "";
const smtpHost = process.env.SMTP_HOST || "stalwart";
const smtpPort = Number(process.env.SMTP_PORT || 25);
const mailDomain = (process.env.MAIL_DOMAIN || "").toLowerCase();
const maxBytes = 25 * 1024 * 1024;

function authorized(value = "") {
  const supplied = Buffer.from(value.replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(token);
  return expected.length > 31 && supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function smtpDeliver(from, to, raw) {
  return new Promise((resolve, reject) => {
    const socket = connect(smtpPort, smtpHost);
    let buffer = "", stage = 0;
    const commands = [
      `EHLO cloudflare-email-worker\r\n`,
      `MAIL FROM:<${from}>\r\n`,
      `RCPT TO:<${to}>\r\n`,
      "DATA\r\n",
    ];
    const timeout = setTimeout(() => socket.destroy(new Error("SMTP delivery timed out")), 30000);
    socket.setEncoding("utf8");
    socket.on("error", reject);
    socket.on("close", () => clearTimeout(timeout));
    socket.on("data", chunk => {
      buffer += chunk;
      const lines = buffer.split("\r\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!/^\d{3}[ -]/.test(line) || line[3] === "-") continue;
        const code = Number(line.slice(0, 3));
        if (code >= 400) return socket.destroy(new Error(`SMTP rejected delivery (${code})`));
        if (stage < commands.length) socket.write(commands[stage++]);
        else if (stage === commands.length) {
          const escaped = raw.replace(/\r?\n/g, "\r\n").replace(/(^|\r\n)\./g, "$1..");
          stage++;
          socket.write(`${escaped}\r\n.\r\n`);
        } else if (code === 250) {
          socket.end("QUIT\r\n");
          resolve();
        }
      }
    });
  });
}

createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200).end("ok");
    return;
  }
  if (request.method !== "POST" || request.url !== "/v1/deliver" || !authorized(request.headers.authorization)) {
    response.writeHead(404).end();
    return;
  }
  const from = String(request.headers["x-envelope-from"] || "");
  const to = String(request.headers["x-envelope-to"] || "");
  if (!from || !to || !to.toLowerCase().endsWith(`@${mailDomain}`) || /[\r\n<>]/.test(from + to)) {
    response.writeHead(400).end("Invalid envelope");
    return;
  }
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of request) {
      size += chunk.length;
      if (size > maxBytes) throw new Error("Message exceeds 25 MiB");
      chunks.push(chunk);
    }
    await smtpDeliver(from, to, Buffer.concat(chunks).toString("utf8"));
    response.writeHead(202).end("accepted");
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    response.writeHead(502).end("Delivery failed");
  }
}).listen(8788, "0.0.0.0", () => console.log("Mail ingress listening on :8788"));

