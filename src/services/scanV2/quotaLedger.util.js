/**
 * Paid-quota decrement ledger (Codex B2, 20 ส.ค. 2026) — คู่กับ migration 055
 *
 * Invariant: การหัก quota ของ job หนึ่งเกิด "ครั้งเดียวเท่านั้น" และห้ามหายเงียบ
 * - จอง pending "ก่อน" mark delivered (crash หลัง delivered ก่อนหัก → sweeper เห็น
 *   pending แล้วหักต่อให้)
 * - หักจริงผ่าน RPC transaction เดียว (decrement + mark completed atomic —
 *   crash ระหว่างกลางเป็นไปไม่ได้ · retry ได้ already_completed ไม่หักซ้ำ)
 * - RPC ล้ม → pending คงอยู่ + attempts/last_error → sweeper ใน maintenanceWorker
 *   ตามจนจบ · attempts สูง = CRITICAL alert (awaited + ตรวจ {ok} จริง)
 */
import { supabase } from "../../config/supabase.js";

/** จอง ledger pending — เรียกก่อน mark delivered เสมอ @returns {Promise<{ok:boolean, status?:string, reason?:string}>} */
export async function ensureQuotaPending(jobId, appUserId, deps = {}) {
  const client = deps.dbClient || supabase;
  try {
    const { data, error } = await client.rpc("ensure_quota_decrement_pending", {
      p_job_id: String(jobId),
      p_app_user_id: String(appUserId),
    });
    if (error) return { ok: false, reason: String(error.message || "rpc_error").slice(0, 120) };
    return { ok: true, status: String(data || "pending") };
  } catch (e) {
    return { ok: false, reason: String(e?.message || e).slice(0, 120) };
  }
}

/** หักจริง (idempotent ต่อ job) @returns {Promise<{ok:boolean, outcome?:"completed"|"already_completed"|"no_ledger", reason?:string}>} */
export async function runQuotaDecrement(jobId, deps = {}) {
  const client = deps.dbClient || supabase;
  try {
    const { data, error } = await client.rpc("claim_paid_scan_decrement", {
      p_job_id: String(jobId),
    });
    if (error) return { ok: false, reason: String(error.message || "rpc_error").slice(0, 120) };
    const outcome = String(data || "");
    if (outcome === "completed" || outcome === "already_completed") return { ok: true, outcome };
    return { ok: false, outcome: "no_ledger", reason: outcome || "unexpected" };
  } catch (e) {
    return { ok: false, reason: String(e?.message || e).slice(0, 120) };
  }
}

/** บันทึกรอบ retry ที่ล้ม (best-effort — pending คงอยู่ให้ sweeper) */
export async function markQuotaDecrementError(jobId, message, deps = {}) {
  const client = deps.dbClient || supabase;
  try {
    await client.rpc("mark_quota_decrement_error", {
      p_job_id: String(jobId),
      p_error: String(message || "unknown").slice(0, 300),
    });
  } catch { /* best-effort */ }
}

const SWEEP_MIN_AGE_MS = 120_000;
const SWEEP_LIMIT = 20;
const ALERT_AFTER_ATTEMPTS = 5;

/**
 * กวาด ledger pending — maintenanceWorker เรียกเป็นรอบ ๆ (owner จริงของ recovery,
 * Telegram เป็น alert เสริมเท่านั้น)
 * @param {{ dbClient?: any, now?: () => number, alert?: (text: string) => Promise<{ok:boolean}>,
 *   alertDedupe?: (key: string, ttlSec: number) => Promise<boolean>, runDecrement?: Function, markError?: Function }} [deps]
 */
export async function sweepPendingQuotaDecrements(deps = {}) {
  const client = deps.dbClient || supabase;
  const now = deps.now ? deps.now() : Date.now();
  const stats = { scanned: 0, completed: 0, failed: 0, alerted: 0 };
  let rows = [];
  try {
    const cutoffIso = new Date(now - SWEEP_MIN_AGE_MS).toISOString();
    const { data, error } = await client
      .from("scan_quota_decrements")
      .select("job_id,app_user_id,attempts,created_at")
      .eq("status", "pending")
      .lt("created_at", cutoffIso)
      .order("created_at", { ascending: true })
      .limit(SWEEP_LIMIT);
    if (error) throw error;
    rows = data || [];
  } catch (e) {
    console.log(JSON.stringify({ event: "QUOTA_LEDGER_SWEEP_READ_FAILED", message: String(e?.message || e).slice(0, 140) }));
    return { ...stats, readFailed: true };
  }
  for (const row of rows) {
    stats.scanned += 1;
    const doDecrement = deps.runDecrement || ((id) => runQuotaDecrement(id, deps));
    const r = await doDecrement(row.job_id);
    if (r.ok === true) {
      stats.completed += 1;
      console.log(JSON.stringify({ event: "QUOTA_LEDGER_SWEEP_COMPLETED", jobIdPrefix: String(row.job_id).slice(0, 8), outcome: r.outcome }));
      continue;
    }
    stats.failed += 1;
    await (deps.markError || ((id, m) => markQuotaDecrementError(id, m, deps)))(row.job_id, r.reason || "sweep_failed");
    if (Number(row.attempts) + 1 >= ALERT_AFTER_ATTEMPTS) {
      // alert แบบซื่อสัตย์: awaited + ตรวจ ok — ส่งล้ม = ปล่อย dedupe ให้รอบหน้าลองใหม่
      try {
        const dedupe = deps.alertDedupe || (await import("../../redis/scanV2Redis.js")).tryDedupeOnce;
        const key = `quota_ledger_stuck_alert:${row.job_id}`;
        if (await dedupe(key, 6 * 3600)) {
          const alert = deps.alert || (await import("../telegramNotify.service.js")).sendTelegramText;
          const res = await alert(
            `[CRITICAL] หัก paid quota ค้างเกิน ${ALERT_AFTER_ATTEMPTS} รอบ (job ${String(row.job_id).slice(0, 8)}… attempts ${Number(row.attempts) + 1}) — ตรวจตาราง scan_quota_decrements`,
          );
          if (res?.ok === true) stats.alerted += 1;
          else {
            try {
              const { clearDedupeKey } = await import("../../redis/scanV2Redis.js");
              await (deps.clearDedupe || clearDedupeKey)(key);
            } catch { /* ignore */ }
          }
        }
      } catch { /* alert ห้ามล้มทับ sweep */ }
    }
  }
  if (stats.scanned > 0) console.log(JSON.stringify({ event: "QUOTA_LEDGER_SWEEP", ...stats }));
  return stats;
}
