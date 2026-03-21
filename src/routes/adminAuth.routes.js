/**
 * Admin login / logout (session-based).
 */
import bcrypt from "bcrypt";
import crypto from "crypto";
import { Router } from "express";

import { env } from "../config/env.js";
import {
  clearLoginFailures,
  isLoginRateLimited,
  recordLoginFailure,
} from "../middleware/adminLoginRateLimit.js";

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function timingSafeEqualString(a, b) {
  const ba = Buffer.from(String(a ?? ""), "utf8");
  const bb = Buffer.from(String(b ?? ""), "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function isLoginConfigured() {
  const user = String(env.ADMIN_USERNAME || "").trim();
  if (!user) return false;
  const hasHash = String(env.ADMIN_PASSWORD_HASH || "").trim().length > 0;
  const hasPlain =
    env.ADMIN_PASSWORD != null && String(env.ADMIN_PASSWORD).length > 0;
  return hasHash || hasPlain;
}

/**
 * @param {string} plain
 * @returns {Promise<boolean>}
 */
async function verifyPassword(plain) {
  const hash = String(env.ADMIN_PASSWORD_HASH || "").trim();
  if (hash) {
    try {
      return await bcrypt.compare(plain, hash);
    } catch (e) {
      console.error("[ADMIN_LOGIN] bcrypt.compare failed:", e?.message);
      return false;
    }
  }
  return timingSafeEqualString(plain, String(env.ADMIN_PASSWORD ?? ""));
}

const LOGIN_STYLES = `
:root {
  color-scheme: light dark;
  --bg: #fafafa;
  --surface: #ffffff;
  --text: #18181b;
  --muted: #71717a;
  --border: #e4e4e7;
  --accent: #ca8a04;
  --accent-text: #0a0a0a;
  --bad: #dc2626;
  --warn-fg: #a16207;
  --warn-bg: rgba(234, 179, 8, 0.12);
  --warn-border: rgba(234, 179, 8, 0.35);
  --input-bg: #ffffff;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f0f12;
    --surface: #18181c;
    --text: #fafafa;
    --muted: #a1a1aa;
    --border: #27272a;
    --accent: #eab308;
    --accent-text: #0a0a0a;
    --bad: #f87171;
    --warn-fg: #fbbf24;
    --warn-bg: rgba(234, 179, 8, 0.12);
    --warn-border: rgba(234, 179, 8, 0.35);
    --input-bg: #0c0c0e;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Thai", sans-serif;
  background: var(--bg);
  color: var(--text);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px 16px;
  -webkit-text-size-adjust: 100%;
}
.card {
  width: 100%;
  max-width: 380px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 24px 20px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.08);
}
@media (prefers-color-scheme: dark) {
  .card { box-shadow: 0 8px 32px rgba(0,0,0,0.35); }
}
h1 { font-size: 1.2rem; margin: 0 0 8px; }
p.muted { color: var(--muted); font-size: 0.85rem; margin: 0 0 20px; }
label { display: block; font-size: 0.8rem; color: var(--muted); margin-bottom: 6px; }
input {
  width: 100%;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--input-bg);
  color: var(--text);
  font-size: 1rem;
  margin-bottom: 14px;
}
button[type="submit"] {
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: 10px;
  background: var(--accent);
  color: var(--accent-text);
  font-weight: 700;
  font-size: 1rem;
  cursor: pointer;
  margin-top: 6px;
}
.err {
  background: rgba(248,113,113,0.12);
  border: 1px solid rgba(248,113,113,0.35);
  color: var(--bad);
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 0.88rem;
  margin-bottom: 16px;
}
.warn {
  background: var(--warn-bg);
  border: 1px solid var(--warn-border);
  color: var(--warn-fg);
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 0.82rem;
  margin-bottom: 16px;
}
code { font-size: 0.85em; }
`;

export default function createAdminAuthRouter() {
  const router = Router();

  router.get("/admin/login", (req, res) => {
    if (req.session?.admin?.authenticated === true) {
      const next = String(req.query?.next || "/admin/payments");
      const safe = next.startsWith("/admin") ? next : "/admin/payments";
      res.redirect(302, safe);
      return;
    }

    const err = String(req.query?.error || "").trim();
    const errMsg =
      err === "bad"
        ? "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"
        : err === "noconf"
          ? "ยังไม่ได้ตั้งค่า ADMIN_USERNAME และรหัสผ่าน (หรือ ADMIN_PASSWORD_HASH)"
          : err === "server"
            ? "เซิร์ฟเวอร์ไม่พร้อม (ตรวจสอบ SESSION_SECRET)"
            : err === "ratelimit"
              ? "ลองเข้าสู่ระบบมากเกินไป กรุณารอประมาณ 15 นาที แล้วลองใหม่"
              : "";

    const configured = isLoginConfigured();
    const warnHtml = !configured
      ? `<div class="warn">ยังไม่ได้ตั้งค่า login — ตั้งค่า ADMIN_USERNAME + ADMIN_PASSWORD_HASH (แนะนำ) หรือ ADMIN_PASSWORD และ SESSION_SECRET หรือใช้ <code>?token=</code> (legacy)</div>`
      : "";

    const errHtml = errMsg ? `<div class="err">${escapeHtml(errMsg)}</div>` : "";

    const nextDefault = escapeHtml(req.query?.next || "/admin/payments");

    const html = `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="color-scheme" content="light dark" />
  <title>Admin — Ener Scan</title>
  <style>${LOGIN_STYLES}</style>
</head>
<body>
  <div class="card">
    <h1>Ener Scan Admin</h1>
    <p class="muted">เข้าสู่ระบบเพื่อจัดการการชำระเงิน</p>
    ${warnHtml}
    ${errHtml}
    ${
      configured
        ? `<form method="POST" action="/admin/login">
      <input type="hidden" name="next" value="${nextDefault}" />
      <label for="username">Username</label>
      <input id="username" name="username" type="text" autocomplete="username" required inputmode="text" />
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required />
      <button type="submit">เข้าสู่ระบบ</button>
    </form>`
        : `<p class="muted">เพิ่มตัวแปรสภาพแวดล้อมแล้วรีสตาร์ทเซิร์ฟเวอร์</p>`
    }
  </div>
</body>
</html>`;

    res.status(200).type("html").send(html);
  });

  router.post("/admin/login", async (req, res) => {
    if (!isLoginConfigured()) {
      res.redirect(302, "/admin/login?error=noconf");
      return;
    }

    const nextRaw = String(req.body?.next || req.query?.next || "/admin/payments");
    const next = nextRaw.startsWith("/admin") ? nextRaw : "/admin/payments";

    if (isLoginRateLimited(req)) {
      res.redirect(
        302,
        "/admin/login?error=ratelimit&next=" + encodeURIComponent(next)
      );
      return;
    }

    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password ?? "");

    const okUser = timingSafeEqualString(
      username,
      String(env.ADMIN_USERNAME || "").trim()
    );

    let okPass = false;
    if (okUser) {
      okPass = await verifyPassword(password);
    }

    if (!okUser || !okPass) {
      const blocked = recordLoginFailure(req);
      const err = blocked ? "ratelimit" : "bad";
      res.redirect(
        302,
        `/admin/login?error=${err}&next=` + encodeURIComponent(next)
      );
      return;
    }

    clearLoginFailures(req);
    if (!req.session) {
      res.redirect(302, "/admin/login?error=server");
      return;
    }
    req.session.admin = { authenticated: true };
    req.session.save((err) => {
      if (err) {
        console.error("[ADMIN_LOGIN] session save failed:", err);
        res.redirect(302, "/admin/login?error=server");
        return;
      }
      res.redirect(302, next);
    });
  });

  router.post("/admin/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) console.error("[ADMIN_LOGOUT]", err);
      res.redirect(302, "/admin/login");
    });
  });

  return router;
}
