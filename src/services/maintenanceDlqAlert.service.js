import crypto from "node:crypto";
import { env } from "../config/env.js";
import { sendAdminAlert as defaultSendAdminAlert } from "./adminAlerts/adminAlert.service.js";

/**
 * DLQ Alert (maintenance): แจ้งแอดมินเมื่อมี outbound dead/failed — แก้ 14 ต.ค. 2026 (Codex):
 *  - แจ้ง "เมื่อสถานะเปลี่ยน": signature จาก (dead, failed, ชุด id + max(updated_at)) → รายการเสียใหม่ถูกจับได้แม้จำนวนเท่าเดิม
 *  - สถานะเดิมที่ **ส่งสำเร็จแล้ว** แจ้งซ้ำไม่เกิน 1 ครั้ง/RESEND_SEC (6 ชม.) — marker ตั้ง **หลังส่งสำเร็จเท่านั้น** (ส่งล้ม = รอบถัดไปลองใหม่)
 *  - กันส่งพร้อมกันระยะสั้นด้วย lock แยก (LOCK_SEC < รอบ maintenance 60 วิ) ไม่ใช่ marker 6 ชม.
 *  - key แยก environment + ปลายทางแอดมิน · Redis ใช้ไม่ได้ = fail-open แจ้งทุกรอบเหมือนเดิม
 *  - 19 ต.ค. 2026 (กบ/Codex): ส่ง Telegram ผ่าน adminAlert แทน LINE แอดมิน (ไม่มี fallback LINE) · marker ตั้งเมื่อส่งสำเร็จหรือเข้า outbox แล้ว
 *  - ไม่แตะ status/threshold ไม่ปิด alert · ข้อความระบุ environment และ "ฐานข้อมูลของระบบ" (ไม่ใช่ Supabase)
 */
export const DLQ_ALERT_RESEND_SEC = 6 * 3600;
export const DLQ_ALERT_LOCK_SEC = 50;

export function dlqEnvLabel(e = env) {
  const appEnv = String(e.APP_ENV || "").trim().toLowerCase();
  if (appEnv) return appEnv;
  try { const h = new URL(String(e.APP_BASE_URL || "")).hostname; if (h) return h; } catch { /* ไม่มี/ผิดรูปแบบ */ }
  return "unknown";
}

/** @param {{ outDead?: number|null, outFailed?: number|null, items?: Array<{id:string, updated_at?:string|null}> }} counts */
export function dlqSignature(counts) {
  const items = Array.isArray(counts.items) ? counts.items : [];
  const ids = items.map((i) => String(i.id)).sort();
  const maxUpdated = items.reduce((m, i) => (i.updated_at && String(i.updated_at) > m ? String(i.updated_at) : m), "");
  return crypto.createHash("sha256").update(`${counts.outDead ?? 0}:${counts.outFailed ?? 0}:${ids.join(",")}:${maxUpdated}`).digest("hex").slice(0, 16);
}

export function buildDlqAlertText({ envLabel, dead, failed, items = [], itemsError = null }) {
  const latest = items[0];
  return [
    `[DLQ Alert][${envLabel}] outbound_messages.dead = ${dead}, failed = ${failed}`,
    itemsError ? "⚠ อ่านรายการ DLQ ไม่สำเร็จ (แจ้งตามจำนวนที่อ่านได้) — จะแจ้งซ้ำรอบถัดไปจนอ่านได้" : null,
    "ตรวจสอบที่ฐานข้อมูลของระบบ (PostgREST/Postgres บน VPS): outbound_messages.status = 'dead' หรือ 'failed'",
    "Hint: sql/outbound_dead_letter_inspect.template.sql",
    latest ? `ล่าสุด: ${String(latest.id).slice(0, 8)}… (${latest.updated_at || "-"})` : null,
    "สถานะเดิมจะแจ้งซ้ำไม่เกินทุก 6 ชม. · รายการเสียใหม่แจ้งทันที",
  ].filter(Boolean).join("\n");
}

async function defaultRedis() {
  const m = await import("../redis/scanV2Redis.js");
  return {
    isAvailable: async () => Boolean(await m.getScanV2Redis()),
    getValue: m.getValue,
    setValueWithTtl: m.setValueWithTtl,
    tryDedupeOnce: m.tryDedupeOnce,
  };
}

/**
 * @param {{ outDead?: number|null, outFailed?: number|null, items?: Array<{id:string, updated_at?:string|null}>, itemsError?: string|null }} counts
 * @param {{ env?: object, sendAdminAlert?: Function, redis?: { isAvailable: Function, getValue: Function, setValueWithTtl: Function, tryDedupeOnce: Function } }} [deps]
 * @returns {Promise<{ sent: boolean, skipped?: string, signature?: string, error?: string }>}
 */
export async function maybeSendDlqAlert(counts, deps = {}) {
  const e = deps.env ? { ...env, ...deps.env } : env;
  const threshold = Number(e.CANARY_DLQ_DEAD_ALERT_THRESHOLD) || 1;
  const dead = counts.outDead ?? 0;
  const failed = counts.outFailed ?? 0;
  if (dead < threshold) return { sent: false, skipped: "below_threshold" };

  const envLabel = dlqEnvLabel(e);
  // รายการ DLQ อ่านไม่สำเร็จ (itemsError) = signature ไม่ครบ → แจ้งตาม count ที่อ่านได้ แต่ **ไม่ใช้/ไม่ตั้ง marker ระยะยาว** (กันสถานะใหม่ถูกมองเป็นสถานะเดิม)
  const itemsError = counts.itemsError ? String(counts.itemsError).slice(0, 120) : null;
  const signature = itemsError ? null : dlqSignature(counts);
  // key ปลายทางแอดมิน = hash ของ ID เต็ม (คนละคนที่ prefix เหมือนกันต้องไม่ชน) · log ย่อ 8 ตัวตามเดิม
  // 19 ต.ค. 2026: ปลายทาง = Telegram (adminAlert) · key = hash ของ chat id ที่ตั้ง (ไม่มี id เต็ม)
  const adminHash = crypto.createHash("sha256").update(String(e.ADMIN_ALERT_TELEGRAM_CHAT_ID || "unconfigured")).digest("hex").slice(0, 16);
  const scope = `${envLabel}:${adminHash}`;
  const sentKey = `dlq_alert:sent:${scope}`;
  const lockKey = `dlq_alert:lock:${scope}:${signature ?? "partial"}`;
  const redis = deps.redis ?? (await defaultRedis());

  let redisOk = false;
  try { redisOk = await redis.isAvailable(); } catch { redisOk = false; }
  if (redisOk && signature) {
    let lastSent = null;
    try { lastSent = await redis.getValue(sentKey); } catch { lastSent = null; }
    if (lastSent === signature) {
      console.log(JSON.stringify({ event: "DLQ_ALERT_SKIPPED", reason: "same_state_already_alerted", env: envLabel, signature }));
      return { sent: false, skipped: "same_state_already_alerted", signature };
    }
  }
  if (redisOk) {
    let locked = true;
    try { locked = await redis.tryDedupeOnce(lockKey, DLQ_ALERT_LOCK_SEC); } catch { locked = true; }
    if (!locked) {
      console.log(JSON.stringify({ event: "DLQ_ALERT_SKIPPED", reason: "send_in_progress", env: envLabel, signature }));
      return { sent: false, skipped: "send_in_progress", signature };
    }
  }
  if (itemsError) console.error(JSON.stringify({ event: "DLQ_ALERT_ITEMS_UNAVAILABLE", env: envLabel, reason: itemsError, note: "แจ้งตาม count ที่อ่านได้ ไม่ตั้ง marker ระยะยาว" }));

  const text = buildDlqAlertText({ envLabel, dead, failed, items: Array.isArray(counts.items) ? counts.items : [], itemsError });
  const sendAlert = deps.sendAdminAlert ?? defaultSendAdminAlert;
  let r;
  try {
    r = await sendAlert({ category: "dlq", severity: "high", text, dedupeKey: signature ? `dlq:${signature}` : null, dedupeSec: 0 }, { env: e });
  } catch (err) { r = { ok: false, queued: false, reason: String(err?.message || err).slice(0, 120) }; }
  if (!r?.ok && !r?.queued) {
    // ส่งไม่ได้และเข้า outbox ไม่ได้: ไม่ตั้ง marker → รอบถัดไปลองใหม่ (lock หมดอายุใน LOCK_SEC)
    console.error("[DLQ_ALERT] alert failed (not queued):", r?.reason);
    return { sent: false, error: String(r?.reason || "alert_failed").slice(0, 120), signature };
  }
  if (redisOk && signature) { try { await redis.setValueWithTtl(sentKey, signature, DLQ_ALERT_RESEND_SEC); } catch { /* marker ตั้งไม่ได้ = รอบหน้าแจ้งซ้ำ (ปลอดภัยด้านไม่เงียบ) */ } }
  console.log(JSON.stringify({ event: "DLQ_ALERT_SENT", env: envLabel, channel: "telegram", queued: r.queued === true, outDead: dead, outFailed: failed, signature, itemsComplete: !itemsError, dedupe: !redisOk ? "fail-open" : signature ? "redis" : "none(items_unavailable)" }));
  return { sent: true, signature, itemsComplete: !itemsError };
}
