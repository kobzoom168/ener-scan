import crypto from "node:crypto";
import line from "@line/bot-sdk";
import { env } from "../config/env.js";

/**
 * DLQ Alert (maintenance): แจ้งแอดมินเมื่อมี outbound dead/failed — แก้ 14 ต.ค. 2026 (Codex):
 *  - แจ้ง "เมื่อสถานะเปลี่ยน": signature จาก (dead, failed, ชุด id + max(updated_at)) → รายการเสียใหม่ถูกจับได้แม้จำนวนเท่าเดิม
 *  - สถานะเดิมที่ **ส่งสำเร็จแล้ว** แจ้งซ้ำไม่เกิน 1 ครั้ง/RESEND_SEC (6 ชม.) — marker ตั้ง **หลังส่งสำเร็จเท่านั้น** (ส่งล้ม = รอบถัดไปลองใหม่)
 *  - กันส่งพร้อมกันระยะสั้นด้วย lock แยก (LOCK_SEC < รอบ maintenance 60 วิ) ไม่ใช่ marker 6 ชม.
 *  - key แยก environment + ปลายทางแอดมิน · Redis ใช้ไม่ได้ = fail-open แจ้งทุกรอบเหมือนเดิม
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

export function buildDlqAlertText({ envLabel, dead, failed, items = [] }) {
  const latest = items[0];
  return [
    `[DLQ Alert][${envLabel}] outbound_messages.dead = ${dead}, failed = ${failed}`,
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
 * @param {{ outDead?: number|null, outFailed?: number|null, items?: Array<{id:string, updated_at?:string|null}> }} counts
 * @param {{ env?: object, lineClient?: { pushMessage: Function }, redis?: { isAvailable: Function, getValue: Function, setValueWithTtl: Function, tryDedupeOnce: Function } }} [deps]
 * @returns {Promise<{ sent: boolean, skipped?: string, signature?: string, error?: string }>}
 */
export async function maybeSendDlqAlert(counts, deps = {}) {
  const e = deps.env ? { ...env, ...deps.env } : env;
  const adminId = String(e.ADMIN_LINE_USER_ID || "").trim();
  const threshold = Number(e.CANARY_DLQ_DEAD_ALERT_THRESHOLD) || 1;
  const dead = counts.outDead ?? 0;
  const failed = counts.outFailed ?? 0;
  if (!adminId) return { sent: false, skipped: "no_admin" };
  if (dead < threshold) return { sent: false, skipped: "below_threshold" };

  const envLabel = dlqEnvLabel(e);
  const signature = dlqSignature(counts);
  const scope = `${envLabel}:${adminId.slice(0, 8)}`;
  const sentKey = `dlq_alert:sent:${scope}`;
  const lockKey = `dlq_alert:lock:${scope}:${signature}`;
  const redis = deps.redis ?? (await defaultRedis());

  let redisOk = false;
  try { redisOk = await redis.isAvailable(); } catch { redisOk = false; }
  if (redisOk) {
    let lastSent = null;
    try { lastSent = await redis.getValue(sentKey); } catch { lastSent = null; }
    if (lastSent === signature) {
      console.log(JSON.stringify({ event: "DLQ_ALERT_SKIPPED", reason: "same_state_already_alerted", env: envLabel, signature }));
      return { sent: false, skipped: "same_state_already_alerted", signature };
    }
    let locked = true;
    try { locked = await redis.tryDedupeOnce(lockKey, DLQ_ALERT_LOCK_SEC); } catch { locked = true; }
    if (!locked) {
      console.log(JSON.stringify({ event: "DLQ_ALERT_SKIPPED", reason: "send_in_progress", env: envLabel, signature }));
      return { sent: false, skipped: "send_in_progress", signature };
    }
  }

  const text = buildDlqAlertText({ envLabel, dead, failed, items: Array.isArray(counts.items) ? counts.items : [] });
  const client = deps.lineClient ?? new line.Client({ channelAccessToken: e.CHANNEL_ACCESS_TOKEN, channelSecret: e.CHANNEL_SECRET });
  try {
    await client.pushMessage(adminId, { type: "text", text });
  } catch (err) {
    // ส่งล้ม: ไม่ตั้ง marker → รอบถัดไปลองใหม่ (lock หมดอายุใน LOCK_SEC)
    console.error("[DLQ_ALERT] push failed:", err?.message);
    return { sent: false, error: String(err?.message || err).slice(0, 120), signature };
  }
  if (redisOk) { try { await redis.setValueWithTtl(sentKey, signature, DLQ_ALERT_RESEND_SEC); } catch { /* marker ตั้งไม่ได้ = รอบหน้าแจ้งซ้ำ (ปลอดภัยด้านไม่เงียบ) */ } }
  console.log(JSON.stringify({ event: "DLQ_ALERT_SENT", env: envLabel, adminIdPrefix: adminId.slice(0, 8), outDead: dead, outFailed: failed, signature, dedupe: redisOk ? "redis" : "fail-open" }));
  return { sent: true, signature };
}
