/**
 * แจ้งเตือนแอดมิน (alarm/ops) ช่องทางเดียว = Telegram (กบ/Codex 19 ต.ค. 2026)
 *  - ปลายทาง: ADMIN_ALERT_TELEGRAM_CHAT_ID (จำเป็น — ไม่อนุมานห้อง) + ADMIN_ALERT_TELEGRAM_BOT_TOKEN (ไม่ตั้ง = TELEGRAM_BOT_TOKEN)
 *  - แหล่ง config เดียว = process.env (Codex รอบ 2 ข้อ 1): deps.env ใช้ "ทับ" เฉพาะ key ที่ให้มา ไม่แทนทั้งก้อน
 *    (ผู้เรียกที่ส่ง env จาก config module ซึ่งไม่มีตัวแปร Telegram จะยังอ่านค่าจริงได้)
 *  - ข้อความขึ้นต้น [env][category][severity] เสมอ (env = APP_ENV หรือ host ของ APP_BASE_URL)
 *  - ส่งไม่ได้ (HTTP ล้ม/429/timeout) → outbox (sql/068) ผ่าน RPC role จำกัด admin_alert_writer (ADMIN_ALERT_DB_KEY) — **ห้าม fallback LINE**
 *    ส่งสำเร็จบางก้อน → outbox เก็บเฉพาะก้อนที่ยังไม่ส่ง (retry ไม่ส่งก้อนสำเร็จซ้ำ)
 *  - ยังไม่ตั้งค่าปลายทาง (chat id/token รูปแบบไม่ถูก) = log ADMIN_ALERT_NOT_CONFIGURED พร้อมข้อความเต็ม ไม่แตะ DB (ไม่ fallback LINE)
 *  - dedupe: marker redis ตั้งเมื่อส่งสำเร็จ หรือเข้า outbox แล้ว · outbox กันแถวซ้ำด้วย dedupe_key
 *  - sweeper: Telegram รับแล้วแต่บันทึกผล (finish) ไม่ได้ = แยกเป็น sentUnrecorded (ไม่ใช่สำเร็จครบ) + จำ id ไว้ในโปรเซส
 *    รอบถัดไปถ้า claim ได้ id เดิม → finish(ok) โดยไม่ส่งซ้ำ · โปรเซส restart = แถวค้าง sending → 10 นาที claim ใหม่ → ส่งซ้ำได้ 1 ครั้ง (ยอมรับ ดีกว่าเงียบ) · log ADMIN_ALERT_OUTBOX_FINISH_FAILED ระบุ id
 *  - ไม่ใส่ token/secret/key ใน log · uid ลูกค้าในข้อความให้ mask (maskUid)
 */
import { PostgrestClient } from "@supabase/postgrest-js";

export const CHUNK = 3900;
export const ADMIN_ALERT_CATEGORIES = ["dlq", "customer_stuck", "customer", "critical", "worker", "ops", "report"];

/** env ที่ใช้จริง = process.env ทับด้วย overrides เฉพาะ key ที่มีค่า (ไม่ให้ object ที่ไม่มีตัวแปร Telegram มาบังค่าจริง) */
export function resolveAdminAlertEnv(overrides = null, base = process.env) {
  if (!overrides || typeof overrides !== "object") return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(overrides)) if (v !== undefined && v !== null) out[k] = v;
  return out;
}
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
  // token: ใช้ ADMIN_ALERT_TELEGRAM_BOT_TOKEN ก่อน "ถ้ารูปแบบถูก" (ค่าว่าง/placeholder = ข้ามไปใช้ TELEGRAM_BOT_TOKEN)
  const cand = [["ADMIN_ALERT_TELEGRAM_BOT_TOKEN", e.ADMIN_ALERT_TELEGRAM_BOT_TOKEN], ["TELEGRAM_BOT_TOKEN", e.TELEGRAM_BOT_TOKEN]]
    .map(([k, v]) => [k, String(v || "").trim()]).find(([, v]) => BOT_TOKEN_RE.test(v));
  if (!CHAT_ID_RE.test(chatId) || !cand) return null;
  return { chatId, token: cand[1], tokenSource: cand[0] };
}
export function isAdminAlertConfigured(e = process.env) { return readAdminAlertConfig(e) != null; }
export function maskUid(uid) { const s = String(uid || ""); return s.length > 10 ? `${s.slice(0, 8)}…` : s; }
export function formatAdminAlert({ envLabel, category, severity, text }) {
  return `[${envLabel}][${category}][${severity}]\n${String(text || "").trim()}`;
}
/** แบ่งข้อความเป็นก้อน ≤ limit ทุกก้อน (บรรทัดยาวเกินถูกตัดเป็นก้อนย่อยด้วย ไม่ว่าจะอยู่หลัง buffer หรือไม่) */
export function chunkText(text, limit = CHUNK) {
  const s = String(text || "").trim(); if (!s) return [];
  if (s.length <= limit) return [s];
  const out = []; let buf = "";
  const flush = () => { if (buf) { out.push(buf); buf = ""; } };
  for (const line of s.split("\n")) {
    if (line.length > limit) { flush(); for (let i = 0; i < line.length; i += limit) out.push(line.slice(i, i + limit)); continue; }
    const cand = buf ? `${buf}\n${line}` : line;
    if (cand.length > limit) { flush(); buf = line; } else buf = cand;
  }
  flush();
  return out;
}

/** client role จำกัด admin_alert_writer (ADMIN_ALERT_DB_KEY) — ไม่ใช้ client anon ของแอป (web_anon ไม่มีสิทธิ์ outbox) */
export function adminAlertDbReadiness(e = process.env) {
  const url = String(e.LOCAL_POSTGREST_URL || "").trim();
  const key = String(e.ADMIN_ALERT_DB_KEY || "").trim();
  const missing = [];
  if (!url) missing.push("LOCAL_POSTGREST_URL");
  if (!key || key.split(".").length !== 3) missing.push("ADMIN_ALERT_DB_KEY");
  return { ready: missing.length === 0, missing };
}
let clientCache = null;
export function adminAlertDbClient(e = process.env) {
  const url = String(e.LOCAL_POSTGREST_URL || "").trim();
  const key = String(e.ADMIN_ALERT_DB_KEY || "").trim();
  if (!url || !key || key.split(".").length !== 3) { const err = new Error("admin_alert_db_key_missing"); err.code = "db_key_missing"; throw err; }
  if (clientCache && clientCache.url === url && clientCache.key === key) return clientCache.client;
  const client = new PostgrestClient(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  clientCache = { url, key, client };
  return client;
}

/** ส่งตรง Telegram — ไม่ throw · {ok, parts} หรือ {ok:false, status?, retryAfterSec?, reason, part, partsTotal, sentParts, remainingText} */
export async function sendTelegramDirect(cfg, text, deps = {}) {
  const fetchImpl = deps.fetch || globalThis.fetch;
  const timeoutMs = Number(deps.timeoutMs) || 10_000;
  const parts = chunkText(text);
  if (!parts.length) return { ok: false, reason: "empty" };
  const fail = (i, extra) => ({ ok: false, part: i + 1, partsTotal: parts.length, sentParts: i, remainingText: parts.slice(i).join("\n"), ...extra });
  for (let i = 0; i < parts.length; i++) {
    let res;
    try {
      res = await fetchImpl(`https://api.telegram.org/bot${cfg.token}/sendMessage`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: cfg.chatId, text: parts[i], disable_web_page_preview: true }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      return fail(i, { reason: `network:${String(e?.name || e?.message || e).slice(0, 40)}` });
    }
    if (!res.ok) {
      let retryAfterSec = null;
      try { const j = await res.json(); retryAfterSec = Number(j?.parameters?.retry_after) || null; } catch { /* ignore */ }
      return fail(i, { status: res.status, retryAfterSec, reason: `http_${res.status}` });
    }
  }
  return { ok: true, parts: parts.length };
}

async function defaultRedis() {
  const m = await import("../../redis/scanV2Redis.js");
  return { getValue: m.getValue, setValueWithTtl: m.setValueWithTtl };
}
const log = (event, extra = {}) => console.log(JSON.stringify({ event, ...extra }));
/** ข้อความที่จะเข้า outbox เมื่อส่งสำเร็จบางก้อน = เฉพาะส่วนที่เหลือ + หัวบอกว่าเป็นส่วนต่อ */
export function outboxTextFromSendResult(fullText, sendResult) {
  if (sendResult && Number(sendResult.sentParts) > 0 && sendResult.remainingText) {
    return `(ต่อ — ส่วน ${sendResult.sentParts + 1}-${sendResult.partsTotal} ของข้อความที่ส่งไปแล้ว ${sendResult.sentParts} ส่วน)\n${sendResult.remainingText}`;
  }
  return fullText;
}

/**
 * @param {{ category: string, severity?: "info"|"med"|"high", text: string, dedupeKey?: string|null, dedupeSec?: number }} p
 * @param {{ env?: object, db?: object, redis?: object, fetch?: Function }} [deps] — deps.db = client role admin_alert_writer (ทดสอบ)
 * @returns {Promise<{ ok: boolean, queued?: boolean, skipped?: string, reason?: string, outboxId?: number|null }>}
 */
export async function sendAdminAlert(p, deps = {}) {
  if (typeof p === "string") p = { category: "critical", severity: "high", text: p }; // ผู้เรียกเดิมแบบ sendTelegramText(text)
  const e = resolveAdminAlertEnv(deps.env);
  const envLabel = adminAlertEnvLabel(e);
  const category = String(p.category || "ops"); const severity = String(p.severity || "info");
  const text = formatAdminAlert({ envLabel, category, severity, text: p.text });
  const dedupeKey = p.dedupeKey ? `${envLabel}:${p.dedupeKey}` : null;
  const dedupeSec = Number(p.dedupeSec) || 0;
  const redis = deps.redis ?? (await defaultRedis().catch(() => null));
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
  // ส่งไม่ได้ → outbox ผ่าน RPC role จำกัด (ไม่ fallback LINE ไม่เงียบ) · ส่งได้บางก้อน = เก็บเฉพาะที่เหลือ
  const reason = sendResult?.reason || "send_failed";
  try {
    const db = deps.db || adminAlertDbClient(e);
    const nextAt = new Date(Date.now() + (sendResult?.retryAfterSec ? sendResult.retryAfterSec * 1000 : 60_000)).toISOString();
    const { data, error } = await db.rpc("admin_alert_outbox_enqueue", { p_env_label: envLabel, p_category: category, p_severity: severity, p_text: outboxTextFromSendResult(text, sendResult), p_dedupe_key: dedupeKey, p_last_error: reason.slice(0, 200), p_next_attempt_at: nextAt });
    if (error) throw new Error(String(error.message || error.code || "enqueue_failed").slice(0, 120));
    await markSent();
    log("ADMIN_ALERT_QUEUED", { env: envLabel, category, severity, reason, outboxId: data?.id ?? null, duplicate: data?.duplicate === true, partialSent: Number(sendResult?.sentParts) || 0 });
    return { ok: false, queued: true, reason, outboxId: data?.id ?? null };
  } catch (err) {
    console.error(JSON.stringify({ event: "ADMIN_ALERT_LOST", env: envLabel, category, severity, reason, outboxError: String(err?.code === "db_key_missing" ? "db_key_missing (ตั้ง ADMIN_ALERT_DB_KEY role admin_alert_writer)" : err?.message || err).slice(0, 140), text: text.slice(0, 1500) }));
    return { ok: false, queued: false, reason };
  }
}

/** id ที่ Telegram รับแล้วแต่ finish ไม่สำเร็จ (ในโปรเซสนี้) → รอบหน้า finish(ok) โดยไม่ส่งซ้ำ */
const sentUnrecorded = new Map();
export function _resetAdminAlertSweepState() { sentUnrecorded.clear(); }
export function _sentUnrecordedIds() { return [...sentUnrecorded.keys()]; }
async function finishWithRetry(db, args, tries = 3) {
  let last = null;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await db.rpc("admin_alert_outbox_finish", args);
      if (!r?.error) return { data: r?.data ?? null };
      last = r.error;
    } catch (e) { last = e; }
  }
  return { error: last || new Error("finish_failed") };
}

/** maintenance ทุก 60 วิ: ส่ง outbox ที่ถึงเวลา · ไม่ตั้งค่า Telegram = ข้าม (แถวคง queued) · ไม่มี ADMIN_ALERT_DB_KEY = ข้าม + log */
export async function sweepAdminAlertOutbox(deps = {}) {
  const e = resolveAdminAlertEnv(deps.env); const envLabel = adminAlertEnvLabel(e);
  const cfg = readAdminAlertConfig(e);
  const summary = { claimed: 0, sent: 0, retry: 0, failed: 0, sentUnrecorded: 0, finishFailed: 0, recovered: 0 };
  if (!cfg) return { ...summary, skipped: "not_configured" }; // ไม่แตะ DB เมื่อยังไม่ตั้งค่า (log ตอนเกิด alert แล้ว)
  let db;
  try { db = deps.db || adminAlertDbClient(e); } catch { console.error(JSON.stringify({ event: "ADMIN_ALERT_OUTBOX_DB_KEY_MISSING", env: envLabel, note: "ตั้ง ADMIN_ALERT_DB_KEY (JWT role admin_alert_writer) แล้ว recreate workers" })); return { ...summary, skipped: "db_key_missing" }; }
  const { data: rows, error } = await db.rpc("admin_alert_outbox_claim", { p_limit: Number(deps.limit) || 20 });
  if (error) { console.error(JSON.stringify({ event: "ADMIN_ALERT_OUTBOX_CLAIM_FAILED", env: envLabel, reason: String(error.message || error).slice(0, 120) })); return { ...summary, error: "claim_failed" }; }
  for (const r of rows || []) {
    summary.claimed += 1;
    let res;
    if (sentUnrecorded.has(r.id)) res = { ok: true, parts: 0, recovered: true }; // Telegram รับไปแล้วรอบก่อน — ไม่ส่งซ้ำ แค่บันทึกผล
    else res = await sendTelegramDirect(cfg, r.text, deps);
    const fin = await finishWithRetry(db, { p_id: r.id, p_ok: res.ok === true, p_error: res.ok ? null : String(res.reason || "send_failed"), p_retry_after_sec: res.retryAfterSec || null, p_text: !res.ok && Number(res.sentParts) > 0 ? outboxTextFromSendResult(r.text, res) : null });
    if (fin.error) {
      const reason = String(fin.error?.message || fin.error).slice(0, 120);
      if (res.ok) { sentUnrecorded.set(r.id, Date.now()); summary.sentUnrecorded += 1; console.error(JSON.stringify({ event: "ADMIN_ALERT_OUTBOX_FINISH_FAILED", env: envLabel, id: r.id, category: r.category, telegramDelivered: true, reason, recovery: "แถวคง sending · โปรเซสนี้จำ id ไว้ รอบหน้า claim ได้จะ finish(ok) ไม่ส่งซ้ำ · ถ้าโปรเซส restart แถวจะถูก claim ใหม่หลัง 10 นาทีและส่งซ้ำ 1 ครั้ง" })); }
      else { summary.finishFailed += 1; console.error(JSON.stringify({ event: "ADMIN_ALERT_OUTBOX_FINISH_FAILED", env: envLabel, id: r.id, category: r.category, telegramDelivered: false, sendReason: res.reason, reason, recovery: "แถวคง sending → claim ใหม่หลัง 10 นาที (ไม่หาย)" })); }
      continue;
    }
    const st = fin.data?.status || (res.ok ? "sent" : "queued");
    if (st === "sent") { summary.sent += 1; if (res.recovered) { summary.recovered += 1; sentUnrecorded.delete(r.id); } log("ADMIN_ALERT_OUTBOX_SENT", { env: envLabel, id: r.id, category: r.category, attempts: fin.data?.attempts ?? null, recovered: res.recovered === true }); }
    else if (st === "failed") { summary.failed += 1; console.error(JSON.stringify({ event: "ADMIN_ALERT_OUTBOX_FAILED", env: envLabel, id: r.id, category: r.category, attempts: fin.data?.attempts ?? null, reason: res.reason })); }
    else { summary.retry += 1; log("ADMIN_ALERT_OUTBOX_RETRY", { env: envLabel, id: r.id, attempts: fin.data?.attempts ?? null, nextAttemptAt: fin.data?.next_attempt_at ?? null, reason: res.reason, partialSent: Number(res.sentParts) || 0 }); }
  }
  if (summary.claimed) log("ADMIN_ALERT_OUTBOX_SWEEP", { env: envLabel, ...summary });
  return summary;
}
