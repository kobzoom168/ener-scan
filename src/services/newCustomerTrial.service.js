import { supabase } from "../config/supabase.js";

export const TRIAL_LIMIT = 2;
/** โหมดสิทธิ์ฟรี (sql/067): daily = ฟรีรายวัน · new_customer = ลูกค้าใหม่ 2 ครั้ง · none = ปิดฟรี (แพ็ก/โบนัสยังใช้ได้) */
export const FREE_POLICY_MODES = ["daily", "new_customer", "none"];
/** โหมดจาก status RPC — DB ก่อน 067 ไม่มี mode → อนุมานจาก enabled (ไม่มี none) */
export function freePolicyModeOf(status) {
  if (status && FREE_POLICY_MODES.includes(status.mode)) return status.mode;
  return status?.enabled === true ? "new_customer" : "daily";
}

// Read through the RPC, not the offer loader's background cache: a cold worker
// must not restore daily free access while the new policy is enabled.
export async function getNewCustomerTrialStatus(lineUserId = null, db = supabase) {
  const { data, error } = await db.rpc("new_customer_trial_status", {
    p_line_user_id: lineUserId,
  });
  if (error) throw error;
  if (!data || typeof data.enabled !== "boolean" || typeof data.eligible !== "boolean" ||
      !Number.isInteger(data.used) || data.used < 0 || data.limit !== TRIAL_LIMIT ||
      (data.mode != null && !FREE_POLICY_MODES.includes(data.mode)) ||
      (data.mode != null && (data.mode === "new_customer") !== data.enabled)) {
    throw new Error("trial_policy_unavailable");
  }
  return { ...data, mode: freePolicyModeOf(data) };
}

export async function saveNewCustomerTrialPolicy(enabled, db = supabase) {
  if (typeof enabled !== "boolean") throw new Error("trial_enabled_must_be_boolean");
  const { data, error } = await db.rpc("set_new_customer_trial_policy", { p_enabled: enabled });
  if (error) throw error;
  return data;
}

export function applyTrialToGate(gate, trial) {
  const mode = freePolicyModeOf(trial);
  if (mode === "none") {
    // ปิดฟรี: ไม่มีสิทธิ์ฟรีทุกบัญชี — แพ็ก (reason paid) คงเดิม · โบนัสพิจารณาต่อที่ checkScanAccess
    return {
      ...gate,
      ...(gate.reason === "paid" ? {} : { allowed: false, reason: "payment_required", remaining: 0 }),
      freePolicy: "none", trialEligible: false, usedScans: 0, freeScansLimit: 0, freeScansRemaining: 0,
    };
  }
  if (mode !== "new_customer") return gate;
  const freeLeft = trial.eligible ? Math.max(0, TRIAL_LIMIT - trial.used) : 0;
  return {
    ...gate,
    ...(gate.reason === "paid" ? {} : {
      allowed: freeLeft > 0,
      reason: freeLeft > 0 ? "free" : "payment_required",
      remaining: freeLeft,
    }),
    freePolicy: "new_customer",
    trialEligible: trial.eligible === true,
    usedScans: Number(trial.used) || 0,
    freeScansLimit: trial.eligible ? TRIAL_LIMIT : 0,
    freeScansRemaining: freeLeft,
  };
}

export function buildTrialPaywallText(offer) {
  const packs = (offer.packages || []).filter(p => p.active !== false);
  return [
    "ตอนนี้ไม่มีสิทธิ์สแกนที่ใช้ได้ครับ",
    ...packs.map(p => `${p.priceThb} บาท ${p.scanCount} ครั้ง ใช้ได้ ${p.windowHours} ชั่วโมง`),
    "เลือกแพ็กแล้วพิมพ์ จ่าย ตามด้วยราคาครับ",
  ].join("\n");
}
