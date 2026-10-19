/**
 * แจ้งเตือนแอดมิน (alarm/ops) ช่องทางเดียว = Telegram (กบ/Codex 19 ต.ค. 2026)
 *  - ปลายทาง: ADMIN_ALERT_TELEGRAM_CHAT_ID (จำเป็น — ไม่อนุมานห้อง) + ADMIN_ALERT_TELEGRAM_BOT_TOKEN (ไม่ตั้ง = TELEGRAM_BOT_TOKEN)
 *  - ข้อความขึ้นต้น [env][category][severity] เสมอ (env = APP_ENV หรือ host ของ APP_BASE_URL)
 *  - ส่งไม่ได้ (HTTP ล้ม/429/timeout) → เขียน outbox (sql/068) ให้ maintenance retry แบบ backoff — **ห้าม fallback LINE**
 *  - ยังไม่ตั้งค่าปลายทาง (chat id/token รูปแบบไม่ถูก) = log ADMIN_ALERT_NOT_CONFIGURED พร้อมข้อความเต็ม ไม่แตะ DB (ไม่ fallback LINE)
 *  - dedupe: marker redis ตั้งเมื่อส่งสำเร็จ หรือเข้า outbox แล้ว (outbox รับประกันส่ง) · outbox กันแถวซ้ำด้วย dedupe_key
 *  - ไม่ใส่ token/secret ใน log · uid ลูกค้าในข้อความให้ mask (maskUid)
 */
import { supabase } from "../../config/supabase.js";

const CHUNK = 3900;
export const ADMIN_ALERT_CATEGORIES = ["dlq", "customer_stuck", "customer", "critical", "worker", "ops", "report"];

export function adminAlertEnvLabel(e = process.env) {
  const appEnv = String(e.APP_ENV || "").trim().toLowerCase();
  if (appEnv) return appEnv;
  try { const h = new URL(String(e.APP_BASE_URL || "")).hostname; if (h) return h; } catch { /* ignore */ }
  return "unknown";
}
export const CHAT_ID_RE = /^-?\d{3,20}$/;
export const BOT_TOKEN_RE = /^\d{5,}:[A-Za-z0-9_-]{30,}$/;
/** ตั้งค่าแล้ว = chat id และ token มีรูปแบบถูกต้อง (placeholder/ค่าขยะ = ไม่ตั้งค่า) */
export function readAdminAlertConfig(e = process.env) {
  const chatId = String(e.ADMIN_ALERT_TELEGRAM_CHAT_ID || "").trim();
  const token = String(e.ADMIN_ALERT_TELEGRAM_BOT_TOKEN || e.TELEGRAM_BOT_TOKEN || "").trim();
  if (!CHAT_ID_RE.test(chatId) || !BOT_TOKEN_RE.test(token)) return null;
  return { chatId, token, tokenSource: e.ADMIN_ALERT_TELEGRAM_BOT_TOKEN ? "ADMIN_ALERT_TELEGRAM_BOT_TOKEN" : "TELEGRAM_BOT_TOKEN" };
}
export function isAdminAlertConfigured(e = process.env) { return readAdminAlertConfig(e) != null; }
export function maskUid(uid) { const s = String(uid || ""); return s.length > 10 ? `${s.slice(0, 8)}…` : s; }
export function formatAdminAlert({ envLabel, category, severity, text }) {
  return `[${envLabel}][${category}][${severity}]\n${String(text || "").trim()}`;
}
export function chunkText(text) {
  const s = String(text || "").trim(); if (!s) return [];
  if (s.length <= CHUNK) return [s];
  const out = []; let buf = "";
  for (const line of s.split("\n")) {
    const cand = buf ? `${buf}\n${line}` : line;
    if (cand.length > CHUNK && buf) { out.push(buf); buf = line; }
    else if (cand.length > CHUNK) { for (let i = 0; i < line.length; i += CHUNK) out.push(line.slice(i, i + CHUNK)); buf = ""; }
    else buf = cand;
  }
  if (buf) out.push(buf);
  return out;
}

/** ส่งตรง Telegram — ไม่ throw · {ok, status?, retryAfterSec?, reason?} */
export async function sendTelegramDirect(cfg, text, deps = {}) {
  const fetchImpl = deps.fetch || globalThis.fetch;
  const timeoutMs = Number(deps.timeoutMs) || 10_000;
  const parts = chunkText(text);
  if (!parts.length) return { ok: false, reason: "empty" };
  for (let i = 0; i < parts.length; i++) {
    let res;
    try {
      res = await fetchImpl(`https://api.telegram.org/bot${cfg.token}/sendMessage`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: cfg.chatId, text: parts[i], disable_web_page_preview: true }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      return { ok: false, reason: `network:${String(e?.name || e?.message || e).slice(0, 40)}`, part: i + 1 };
    }
    if (!res.ok) {
      let retryAfterSec = null;
      try { const j = await res.json(); retryAfterSec = Number(j?.parameters?.retry_after) || null; } catch { /* ignore */ }
      return { ok: false, status: res.status, retryAfterSec, reason: `http_${res.status}`, part: i + 1 };
    }
  }
  return { ok: true, parts: parts.length };
}

async function defaultRedis() {
  const m = await import("../../redis/scanV2Redis.js");
  return { getValue: m.getValue, setValueWithTtl: m.setValueWithTtl };
}
const log = (event, extra = {}) => console.log(JSON.stringify({ event, ...extra }));

async function enqueueOutbox(db, row) {
  const { data, error } = await db.from("admin_alert_outbox").insert(row).select("id").maybeSingle();
  if (error) {
    // แถวซ้ำ (dedupe_key ค้างใน outbox) = ถือว่า queued แล้ว
    if (String(error.code) === "23505") return { queued: true, duplicate: true };
    throw error;
  }
  return { queued: true, id: data?.id ?? null };
}

/**
 * @param {{ category: string, severity?: "info"|"med"|"high", text: string, dedupeKey?: string|null, dedupeSec?: number }} p
 * @param {{ env?: object, db?: object, redis?: object, fetch?: Function, now?: Date }} [deps]
 * @returns {Promise<{ ok: boolean, queued?: boolean, skipped?: string, reason?: string, outboxId?: number|null }>}
 */
export async function sendAdminAlert(p, deps = {}) {
  if (typeof p === "string") p = { category: "critical", severity: "high", text: p }; // ผู้เรียกเดิมแบบ sendTelegramText(text)
  const e = deps.env || process.env;
  const envLabel = adminAlertEnvLabel(e);
  const category = String(p.category || "ops"); const severity = String(p.severity || "info");
  const text = formatAdminAlert({ envLabel, category, severity, text: p.text });
  const dedupeKey = p.dedupeKey ? `${envLabel}:${p.dedupeKey}` : null;
  const dedupeSec = Number(p.dedupeSec) || 0;
  const redis = deps.redis ?? (await defaultRedis().catch(() => null));
  const db = deps.db || supabase;
  if (dedupeKey && dedupeSec > 0 && redis) {
    try { if ((await redis.getValue(`admin_alert:sent:${dedupeKey}`)) === "1") return { ok: false, skipped: "deduped" }; } catch { /* fail-open */ }
  }
  const markSent = async () => { if (dedupeKey && dedupeSec > 0 && redis) { try { await redis.setValueWithTtl(`admin_alert:sent:${dedupeKey}`, "1", dedupeSec); } catch { /* ignore */ } } };
  const cfg = readAdminAlertConfig(e);
  let sendResult = null;
  if (cfg) sendResult = await sendTelegramDirect(cfg, text, deps);
  if (sendResult?.ok) {
    await markSent();
    log("ADMIN_ALERT_SENT", { env: envLabel, category, severity, parts: sendResult.parts });
    return { ok: true };
  }
  if (!cfg) {
    // ยังไม่ตั้งค่าปลายทาง (ops): ไม่แตะ DB — log ข้อความเต็มให้ตรวจสอบได้ · ไม่ fallback LINE · outbox ใช้เมื่อ "ส่งล้ม" เท่านั้น
    console.error(JSON.stringify({ event: "ADMIN_ALERT_NOT_CONFIGURED", env: envLabel, category, severity, text: text.slice(0, 1500), note: "ตั้ง ADMIN_ALERT_TELEGRAM_CHAT_ID (+token) แล้ว recreate app/workers" }));
    return { ok: false, queued: false, reason: "not_configured" };
  }
  // ส่งไม่ได้ → outbox (ไม่ fallback LINE ไม่เงียบ)
  const reason = sendResult?.reason || "send_failed";
  try {
    const row = { env_label: envLabel, category, severity, text, dedupe_key: dedupeKey, status: "queued", attempts: 1,
      last_error: reason.slice(0, 200), next_attempt_at: new Date(Date.now() + (sendResult?.retryAfterSec ? sendResult.retryAfterSec * 1000 : 60_000)).toISOString() };
    const q = await enqueueOutbox(db, row);
    await markSent();
    log("ADMIN_ALERT_QUEUED", { env: envLabel, category, severity, reason, outboxId: q.id ?? null, duplicate: q.duplicate === true });
    return { ok: false, queued: true, reason, outboxId: q.id ?? null };
  } catch (err) {
    console.error(JSON.stringify({ event: "ADMIN_ALERT_LOST", env: envLabel, category, severity, reason, outboxError: String(err?.message || err).slice(0, 120) }));
    return { ok: false, queued: false, reason };
  }
}

/** maintenance ทุก 60 วิ: ส่ง outbox ที่ถึงเวลา · ไม่ตั้งค่า = log อย่างเดียว (แถวคง queued) */
export async function sweepAdminAlertOutbox(deps = {}) {
  const e = deps.env || process.env; const db = deps.db || supabase; const envLabel = adminAlertEnvLabel(e);
  const cfg = readAdminAlertConfig(e);
  const summary = { claimed: 0, sent: 0, retry: 0, failed: 0 };
  if (!cfg) return { ...summary, skipped: "not_configured" }; // ไม่แตะ DB เมื่อยังไม่ตั้งค่า (log ตอนเกิด alert แล้ว)
  const { data: rows, error } = await db.rpc("admin_alert_outbox_claim", { p_limit: Number(deps.limit) || 20 });
  if (error) { console.error(JSON.stringify({ event: "ADMIN_ALERT_OUTBOX_CLAIM_FAILED", env: envLabel, reason: String(error.message || error).slice(0, 120) })); return { ...summary, error: "claim_failed" }; }
  for (const r of rows || []) {
    summary.claimed += 1;
    const res = await sendTelegramDirect(cfg, r.text, deps);
    const { data: fin } = await db.rpc("admin_alert_outbox_finish", { p_id: r.id, p_ok: res.ok === true, p_error: res.ok ? null : String(res.reason || "send_failed"), p_retry_after_sec: res.retryAfterSec || null });
    const st = fin?.status || (res.ok ? "sent" : "queued");
    if (st === "sent") { summary.sent += 1; log("ADMIN_ALERT_OUTBOX_SENT", { env: envLabel, id: r.id, category: r.category, attempts: fin?.attempts ?? null }); }
    else if (st === "failed") { summary.failed += 1; console.error(JSON.stringify({ event: "ADMIN_ALERT_OUTBOX_FAILED", env: envLabel, id: r.id, category: r.category, attempts: fin?.attempts ?? null, reason: res.reason })); }
    else { summary.retry += 1; log("ADMIN_ALERT_OUTBOX_RETRY", { env: envLabel, id: r.id, attempts: fin?.attempts ?? null, nextAttemptAt: fin?.next_attempt_at ?? null, reason: res.reason }); }
  }
  if (summary.claimed) log("ADMIN_ALERT_OUTBOX_SWEEP", { env: envLabel, ...summary });
  return summary;
}
