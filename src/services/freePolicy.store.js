/**
 * สิทธิ์ฟรี 3 โหมด + ตั้งเวลา (sql/067) — ชั้นเรียก RPC
 *
 *  - อ่าน (free_policy_status) ใช้ client anon ของแอป (web_anon มีสิทธิ์อ่าน)
 *  - เขียน (set / schedule / cancel / apply_due / audit) ต้องใช้ role จำกัด `free_policy_admin`
 *    env: FREE_POLICY_DB_KEY (JWT role free_policy_admin) — ไม่มีก็ใช้ TELEGRAM_CONFIG_DB_KEY เดิมได้
 *    (067 GRANT free_policy_admin ให้ telegram_config_admin) · web_anon/service_role เรียก RPC เขียนไม่ได้
 *  - กติกา 72 ชม./โหมดเดียว/cutoff บังคับใน DB — โมดูลนี้ไม่ตัดสินเอง แค่ส่งค่าและแปลรหัส error
 *  - ไม่ log ค่า key
 */
import { PostgrestClient } from "@supabase/postgrest-js";
import { supabase } from "../config/supabase.js";

export const FREE_POLICY_MODES = ["daily", "new_customer", "none"];
export const NOTICE_HOURS = 72;
export const MODE_LABEL_TH = {
  daily: "ฟรีรายวัน",
  new_customer: "ลูกค้าใหม่ทดลองฟรี 2 ครั้ง",
  none: "ปิดสิทธิ์ฟรี (แพ็ก/โบนัสยังใช้ได้)",
};
/** รหัส error จาก DB → ข้อความไทย (หน้า Admin) */
export const RPC_ERROR_TH = {
  notice_required: `การถอนฟรีรายวันต้องระบุเวลาที่ประกาศลูกค้าแล้ว (ต้องล่วงหน้าอย่างน้อย ${NOTICE_HOURS} ชั่วโมง)`,
  notice_period_72h: `เวลามีผลต้องห่างจากเวลาประกาศอย่างน้อย ${NOTICE_HOURS} ชั่วโมง — ยังไม่ครบ ไม่เปลี่ยน`,
  announced_at_in_future: "เวลาประกาศต้องเป็นเวลาที่ผ่านมาแล้ว (ประกาศจริงก่อน แล้วค่อยบันทึก)",
  announced_at_after_effective: "เวลาประกาศต้องมาก่อนเวลามีผล",
  effective_at_must_be_future: "เวลามีผลต้องอยู่ในอนาคต",
  schedule_pending: "มีกำหนดการรออยู่ — ยกเลิกกำหนดการก่อน หรือติ๊ก \"ยกเลิกกำหนดการที่รออยู่\"",
  schedule_not_pending: "กำหนดการนี้ไม่ได้อยู่ในสถานะรอแล้ว (ถูกใช้/ยกเลิก/แทนที่ไปแล้ว)",
  invalid_mode: "โหมดไม่ถูกต้อง",
  trial_policy_unavailable: "ยังอ่านนโยบายจาก DB ไม่ได้ (ตรวจ migration 057/067)",
  permission_denied: "key เซิร์ฟเวอร์ไม่มีสิทธิ์เรียก RPC นี้ (ต้องเป็น role free_policy_admin) — ops ตรวจ FREE_POLICY_DB_KEY/TELEGRAM_CONFIG_DB_KEY",
  db_key_missing: "ops ยังไม่ตั้ง FREE_POLICY_DB_KEY (หรือ TELEGRAM_CONFIG_DB_KEY) บนเซิร์ฟเวอร์ — เปลี่ยนนโยบายจากหน้านี้ไม่ได้",
};

export function freePolicyStoreReadiness(envSrc = process.env) {
  const url = String(envSrc.LOCAL_POSTGREST_URL || "").trim();
  const key = String(envSrc.FREE_POLICY_DB_KEY || envSrc.TELEGRAM_CONFIG_DB_KEY || "").trim();
  const missing = [];
  if (!url) missing.push("LOCAL_POSTGREST_URL");
  if (!key || key.split(".").length !== 3) missing.push("FREE_POLICY_DB_KEY|TELEGRAM_CONFIG_DB_KEY");
  return { ready: missing.length === 0, missing, keySource: envSrc.FREE_POLICY_DB_KEY ? "FREE_POLICY_DB_KEY" : envSrc.TELEGRAM_CONFIG_DB_KEY ? "TELEGRAM_CONFIG_DB_KEY" : null };
}

let clientCache = null;
/** client role จำกัด — ไม่ใช้ client anon ของแอป */
export function freePolicyDbClient(envSrc = process.env) {
  const url = String(envSrc.LOCAL_POSTGREST_URL || "").trim();
  const key = String(envSrc.FREE_POLICY_DB_KEY || envSrc.TELEGRAM_CONFIG_DB_KEY || "").trim();
  if (!url || !key) { const e = new Error("free_policy_db_key_missing"); e.code = "db_key_missing"; throw e; }
  if (clientCache && clientCache.url === url && clientCache.key === key) return clientCache.client;
  const client = new PostgrestClient(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  clientCache = { url, key, client };
  return client;
}

/** รหัสสั้นจาก error PostgREST: ข้อความ RAISE (เช่น notice_period_72h) หรือ permission_denied */
export function rpcErrorCode(error) {
  const msg = String(error?.message || "").trim();
  if (/^[a-z_0-9]{3,60}$/.test(msg)) return msg;
  if (String(error?.code || "") === "42501" || /permission denied/i.test(msg)) return "permission_denied";
  return String(error?.code || "rpc_failed").slice(0, 40);
}

async function rpc(name, args, deps, { restricted = true } = {}) {
  const client = deps.client ?? (restricted ? freePolicyDbClient(deps.env) : supabase);
  const { data, error } = await client.rpc(name, args);
  if (error) {
    const code = rpcErrorCode(error);
    const e = new Error(`free_policy_rpc_failed:${name}:${code}`);
    e.code = code; e.rpc = name;
    throw e;
  }
  return data;
}

/** โหมดจาก status (DB ก่อน 067 ไม่มี mode → จาก enabled) */
export function freePolicyModeOf(status) {
  if (status && FREE_POLICY_MODES.includes(status.mode)) return status.mode;
  return status?.enabled === true ? "new_customer" : "daily";
}

/** สถานะเต็มสำหรับหน้า Admin (อ่านด้วย anon ได้): mode ที่มีผล, stored_mode, schedule pending, last_applied, eligible_since */
export async function getFreePolicyStatus(deps = {}) {
  const data = await rpc("free_policy_status", { p_line_user_id: null }, deps, { restricted: false });
  if (!data || typeof data.enabled !== "boolean") { const e = new Error("trial_policy_unavailable"); e.code = "trial_policy_unavailable"; throw e; }
  return { ...data, mode: freePolicyModeOf(data) };
}

function assertMode(mode) { if (!FREE_POLICY_MODES.includes(mode)) { const e = new Error("invalid_mode"); e.code = "invalid_mode"; throw e; } }
function iso(v) { if (v == null || v === "") return null; const ms = Date.parse(String(v)); if (!Number.isFinite(ms)) { const e = new Error("invalid_datetime"); e.code = "invalid_datetime"; throw e; } return new Date(ms).toISOString(); }

/** เปลี่ยนทันที — DB ตรวจ 72h จาก announced_at เอง · pending ค้างต้อง cancelPending=true (ไม่ใช่ทางลัด 72h) */
export async function setFreePolicyMode({ mode, actor, announcedAt = null, cancelPending = false }, deps = {}) {
  assertMode(mode);
  return rpc("set_free_policy_mode", { p_mode: mode, p_actor: String(actor || "admin").slice(0, 80), p_announced_at: iso(announcedAt), p_cancel_pending: cancelPending === true }, deps);
}
/** ตั้งเวลา — DB ตรวจอนาคต/72h · pending เดิมถูกแทนที่ (superseded) */
export async function scheduleFreePolicy({ mode, effectiveAt, announcedAt = null, actor }, deps = {}) {
  assertMode(mode);
  const eff = iso(effectiveAt); if (!eff) { const e = new Error("effective_at_required"); e.code = "effective_at_must_be_future"; throw e; }
  return rpc("free_policy_schedule_set", { p_target_mode: mode, p_effective_at: eff, p_announced_at: iso(announcedAt), p_actor: String(actor || "admin").slice(0, 80) }, deps);
}
export async function cancelFreePolicySchedule({ id, actor }, deps = {}) {
  const n = Number(id); if (!Number.isInteger(n) || n <= 0) { const e = new Error("schedule_not_pending"); e.code = "schedule_not_pending"; throw e; }
  return rpc("free_policy_schedule_cancel", { p_id: n, p_actor: String(actor || "admin").slice(0, 80) }, deps);
}
/** บันทึก schedule ที่ถึงเวลา (ครั้งเดียว, restart-safe) — worker ทุก 60 วิ และหน้า Admin ตอนเปิด */
export async function applyDueFreePolicySchedule(deps = {}) {
  return rpc("free_policy_schedule_apply_due", {}, deps);
}
export async function listFreePolicyAudit(limit = 20, deps = {}) {
  const data = await rpc("free_policy_audit_recent", { p_limit: Number(limit) || 20 }, deps);
  return Array.isArray(data) ? data : [];
}
