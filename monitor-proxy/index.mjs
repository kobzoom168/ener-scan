import http from "node:http";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Redis = require("ioredis");

const PORT = 8081;
const DOZZLE_HOST = process.env.DOZZLE_HOST || "dozzle";
const DOZZLE_PORT = 8080;
const REDIS_URL = process.env.REDIS_URL || "redis://redis:6379";
const CHANNEL_ACCESS_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;
const ADMIN_LINE_USER_ID = process.env.MONITOR_ADMIN_LINE_USER_ID;
const OTP_TTL = 300; // 5 minutes
const SESSION_TTL = 28800; // 8 hours

const redis = new Redis(REDIS_URL);

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function generateSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

function parseCookies(header = "") {
  const out = {};
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    out[k] = decodeURIComponent(v);
  }
  return out;
}

async function sendOtpLine(otp) {
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: ADMIN_LINE_USER_ID,
      messages: [
        {
          type: "text",
          text: `🔐 Monitor OTP\n\nรหัส: ${otp}\n\nหมดอายุใน 5 นาที`,
        },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`LINE ${res.status}: ${t.slice(0, 100)}`);
  }
}

async function isSessionValid(token) {
  if (!token) return false;
  const v = await redis.get(`monitor:session:${token}`);
  return v === "1";
}

const LOGIN_HTML = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Monitor Login</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f0f0f;color:#e0e0e0;display:flex;align-items:center;justify-content:center;min-height:100vh}
.card{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:16px;padding:40px;width:100%;max-width:360px}
h1{font-size:18px;font-weight:600;color:#fff;margin-bottom:4px}
.sub{font-size:13px;color:#666;margin-bottom:32px}
.step{display:none}.step.on{display:block}
label{font-size:13px;color:#888;display:block;margin-bottom:8px}
input{width:100%;padding:12px 14px;background:#111;border:1px solid #333;border-radius:8px;color:#fff;font-size:20px;letter-spacing:6px;text-align:center;outline:none}
input:focus{border-color:#22c55e}
.btn{width:100%;padding:12px;background:#22c55e;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;margin-top:14px;transition:.2s}
.btn:hover{background:#16a34a}
.btn:disabled{background:#222;color:#555;cursor:not-allowed}
.btn2{background:transparent;border:1px solid #333;color:#888;margin-top:8px;font-size:13px;font-weight:normal}
.btn2:hover{background:#222;color:#aaa}
.err{color:#ef4444;font-size:13px;margin-top:10px;display:none}
.ok{color:#22c55e;font-size:13px;margin-top:10px;display:none}
</style>
</head>
<body>
<div class="card">
  <h1>🔐 Monitor</h1>
  <p class="sub">ener-scan log monitor</p>
  <div class="step on" id="s1">
    <label>กดปุ่มเพื่อรับ OTP ทาง LINE</label>
    <button class="btn" id="sendBtn" onclick="reqOtp()">ส่ง OTP ไปยัง LINE</button>
    <div class="err" id="e1"></div>
  </div>
  <div class="step" id="s2">
    <label>กรอกรหัส OTP 6 หลัก</label>
    <input id="otp" type="text" inputmode="numeric" maxlength="6" placeholder="000000" oninput="this.value=this.value.replace(/\\D/g,'')">
    <button class="btn" onclick="doVerify()">ยืนยัน</button>
    <button class="btn btn2" onclick="back()">← ส่งใหม่</button>
    <div class="err" id="e2"></div>
    <div class="ok" id="ok2">ส่ง OTP แล้ว ตรวจ LINE ด้วยนะครับ</div>
  </div>
</div>
<script>
async function reqOtp(){
  const btn=document.getElementById('sendBtn');
  const err=document.getElementById('e1');
  btn.disabled=true;btn.textContent='กำลังส่ง...';err.style.display='none';
  const r=await fetch('/otp/request',{method:'POST'}).catch(()=>null);
  if(r?.ok){
    document.getElementById('s1').classList.remove('on');
    document.getElementById('s2').classList.add('on');
    document.getElementById('ok2').style.display='block';
    document.getElementById('otp').focus();
  } else {
    const d=await r?.json().catch(()=>({}));
    err.textContent=d?.error||'เกิดข้อผิดพลาด';err.style.display='block';
    btn.disabled=false;btn.textContent='ส่ง OTP ไปยัง LINE';
  }
}
function back(){
  document.getElementById('s2').classList.remove('on');
  document.getElementById('s1').classList.add('on');
  document.getElementById('sendBtn').disabled=false;
  document.getElementById('sendBtn').textContent='ส่ง OTP ไปยัง LINE';
}
async function doVerify(){
  const otp=document.getElementById('otp').value.trim();
  const err=document.getElementById('e2');
  err.style.display='none';
  if(otp.length!==6){err.textContent='กรุณากรอก 6 หลัก';err.style.display='block';return;}
  const r=await fetch('/otp/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({otp})}).catch(()=>null);
  if(r?.ok){window.location.href='/';}
  else{const d=await r?.json().catch(()=>({}));err.textContent=d?.error||'OTP ไม่ถูกต้อง';err.style.display='block';}
}
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&document.getElementById('s2').classList.contains('on'))doVerify();});
</script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  const url = req.url || "/";
  const method = req.method || "GET";
  const cookies = parseCookies(req.headers.cookie);
  const sessionToken = cookies["monitor_session"];

  if (url === "/login" && (method === "GET" || method === "HEAD")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(method === "HEAD" ? "" : LOGIN_HTML);
  }

  if (url === "/otp/request" && method === "POST") {
    const ip =
      (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
      req.socket?.remoteAddress ||
      "unknown";
    const rlKey = `monitor:otp:rl:${ip}`;
    const count = await redis.incr(rlKey);
    if (count === 1) await redis.expire(rlKey, 3600);
    if (count > 5) {
      res.writeHead(429, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "ส่ง OTP บ่อยเกินไป รอ 1 ชม." }));
    }
    if (!ADMIN_LINE_USER_ID) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "MONITOR_ADMIN_LINE_USER_ID not set" }));
    }
    if (!CHANNEL_ACCESS_TOKEN) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "CHANNEL_ACCESS_TOKEN not set" }));
    }
    const otp = generateOtp();
    await redis.setex("monitor:otp", OTP_TTL, otp);
    try {
      await sendOtpLine(otp);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      console.error("[MONITOR_AUTH] LINE send error:", e.message);
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "ส่ง LINE ล้มเหลว" }));
    }
  }

  if (url === "/otp/verify" && method === "POST") {
    let body = "";
    req.on("data", (d) => {
      body += d;
    });
    await new Promise((resolve) => req.on("end", resolve));
    try {
      const { otp } = JSON.parse(body);
      const stored = await redis.get("monitor:otp");
      if (!stored || stored !== String(otp).trim()) {
        res.writeHead(401, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "OTP ไม่ถูกต้องหรือหมดอายุแล้ว" }));
      }
      await redis.del("monitor:otp");
      const token = generateSessionToken();
      await redis.setex(`monitor:session:${token}`, SESSION_TTL, "1");
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Set-Cookie": `monitor_session=${token}; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL}; Path=/`,
      });
      return res.end(JSON.stringify({ ok: true }));
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "invalid request" }));
    }
  }

  if (url === "/logout") {
    if (sessionToken) await redis.del(`monitor:session:${sessionToken}`);
    res.writeHead(302, {
      Location: "/login",
      "Set-Cookie":
        "monitor_session=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/",
    });
    return res.end();
  }

  const valid = await isSessionValid(sessionToken);
  if (!valid) {
    if (req.headers.accept?.includes("text/html")) {
      res.writeHead(302, { Location: "/login" });
    } else {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
    }
    return;
  }

  const proxyOpts = {
    hostname: DOZZLE_HOST,
    port: DOZZLE_PORT,
    path: url,
    method,
    headers: { ...req.headers, host: `${DOZZLE_HOST}:${DOZZLE_PORT}` },
  };
  const proxyReq = http.request(proxyOpts, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });
  proxyReq.on("error", (e) => {
    console.error("[MONITOR_PROXY] error:", e.message);
    if (!res.headersSent) res.writeHead(502);
    res.end("Bad Gateway");
  });
  req.pipe(proxyReq, { end: true });
});

server.on("upgrade", async (req, socket, head) => {
  const cookies = parseCookies(req.headers.cookie);
  const valid = await isSessionValid(cookies["monitor_session"]);
  if (!valid) {
    socket.destroy();
    return;
  }

  const net = await import("node:net");
  const proxySocket = new net.Socket();
  proxySocket.connect(DOZZLE_PORT, DOZZLE_HOST, () => {
    proxySocket.write(
      `${req.method} ${req.url} HTTP/1.1\r\n` +
        Object.entries(req.headers)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\r\n") +
        "\r\n\r\n",
    );
    proxySocket.write(head);
    socket.pipe(proxySocket);
    proxySocket.pipe(socket);
  });
  proxySocket.on("error", () => socket.destroy());
  socket.on("error", () => proxySocket.destroy());
});

server.listen(PORT, () => {
  console.log(`[MONITOR_AUTH] :${PORT} → dozzle:${DOZZLE_PORT}`);
});
