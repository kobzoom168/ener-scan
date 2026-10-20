/**
 * งานเขียนบิลฝ่าย ops (sql/069): ปฏิเสธแบบ atomic · ปิดเรื่องเงิน · งานแจ้งลูกค้าหลังปฏิเสธ
 *  - ใช้ role จำกัดฝั่งเซิร์ฟเวอร์ `payment_ops_writer` ผ่าน JWT `PAYMENT_OPS_DB_KEY` (เซ็นด้วย PGRST_JWT_SECRET) — **ไม่ใช้ client anon** (Codex 20 ต.ค. 2026)
 *  - ไม่มี key = โยน error `payment_ops_db_key_missing` (ปฏิเสธ/ปิดเรื่องเงินทำไม่ได้ ไม่ fallback ไป anon)
 *  - ไม่ log ค่า key
 */
import { PostgrestClient } from "@supabase/postgrest-js";

export function paymentOpsReadiness(envSrc = process.env) {
  const url = String(envSrc.LOCAL_POSTGREST_URL || "").trim();
  const key = String(envSrc.PAYMENT_OPS_DB_KEY || "").trim();
  const missing = [];
  if (!url) missing.push("LOCAL_POSTGREST_URL");
  if (!key || key.split(".").length !== 3) missing.push("PAYMENT_OPS_DB_KEY");
  return { ready: missing.length === 0, missing };
}
let cache = null;
export function paymentOpsDbClient(envSrc = process.env) {
  const url = String(envSrc.LOCAL_POSTGREST_URL || "").trim();
  const key = String(envSrc.PAYMENT_OPS_DB_KEY || "").trim();
  if (!url || !key || key.split(".").length !== 3) { const e = new Error("payment_ops_db_key_missing"); e.code = "db_key_missing"; throw e; }
  if (cache && cache.url === url && cache.key === key) return cache.client;
  const client = new PostgrestClient(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  cache = { url, key, client };
  return client;
}
async function rpc(name, args, deps = {}) {
  const client = deps.client ?? paymentOpsDbClient(deps.env);
  const { data, error } = await client.rpc(name, args);
  if (error) { const e = new Error(`payment_ops_rpc_failed:${name}:${String(error.code || error.message || "").slice(0, 60)}`); e.cause = error; throw e; }
  return data;
}
/** ปฏิเสธบิล (DB ตัดสิน money_pending จากแถวที่ล็อก) → {ok, already, lineUserId, settlementStatus, notifyPending, slipAmount, expectedAmount, reason?, status?} */
export async function rejectPaymentAtomic({ paymentId, actor, channel, reasonCode = null, reasonText = null, moneyPending = false }, deps = {}) {
  return rpc("reject_payment_atomic", { p_payment_id: paymentId, p_actor: actor || "admin", p_channel: channel || "web", p_reason_code: reasonCode, p_reason_text: reasonText, p_money_pending: Boolean(moneyPending) }, deps);
}
export async function resolveSettlement({ paymentId, status, note, actor }, deps = {}) {
  return rpc("payment_settlement_resolve", { p_payment_id: paymentId, p_status: status, p_note: note, p_actor: actor || "admin" }, deps);
}
export async function markRejectNotifyQueued(paymentId, deps = {}) {
  return rpc("mark_reject_notify_queued", { p_payment_id: paymentId }, deps);
}
export async function listRejectNotifyPending(limit = 20, deps = {}) {
  const rows = await rpc("list_reject_notify_pending", { p_limit: limit }, deps);
  return Array.isArray(rows) ? rows : [];
}
