/**
 * Paid-quota decrement ledger (Codex B2 รอบสอง, 20 ส.ค. 2026) — คู่กับ migration 055
 *
 * Invariant: หัก quota ต่อ job "ครั้งเดียว" และห้ามหายเงียบ
 * - authority: JS ส่งได้แค่ jobId — เจ้าของ/ประเภทงาน derive จาก scan_jobs ใน DB
 * - จอง pending "ก่อน" mark delivered · หักผ่าน RPC transaction เดียว (atomic,
 *   already_completed = ไม่หักซ้ำ, app_users ไม่โดนแถว = rollback ห้ามสำเร็จปลอม)
 * - durable owner จริง = DB: sweeper ทั้ง (1) reconcile สร้าง ledger คืนจาก
 *   actual-delivery evidence (เฉพาะ job ยุค epoch — ห้ามหักย้อนหลัง write-off)
 *   และ (2) ไล่หัก pending ที่ค้าง · Telegram เป็น alert เสริมเท่านั้น
 */
import { supabase } from "../../config/supabase.js";

/** จอง ledger pending — เรียกก่อน mark delivered เสมอ (RPC derive เจ้าของเอง)
 * @returns {Promise<{ok:boolean, status?:string, reason?:string}>} */
export async function ensureQuotaPending(jobId, deps = {}) {
  const client = deps.dbClient || supabase;
  try {
    const { data, error } = await client.rpc("ensure_quota_decrement_pending", {
      p_job_id: String(jobId),
    });
    if (error) return { ok: false, reason: String(error.message || "rpc_error").slice(0, 120) };
    const status = String(data || "");
    if (status === "pending" || status === "completed") return { ok: true, status };
    // job_not_found / not_paid / user_mismatch — ปฏิเสธชัด ๆ ไม่ใช่ ok
    return { ok: false, reason: status || "unexpected" };
  } catch (e) {
    return { ok: false, reason: String(e?.message || e).slice(0, 120) };
  }
}

/** หักจริง (idempotent ต่อ job) @returns {Promise<{ok:boolean, outcome?:string, reason?:string}>} */
export async function runQuotaDecrement(jobId, deps = {}) {
  const client = deps.dbClient || supabase;
  try {
    const { data, error } = await client.rpc("claim_paid_scan_decrement", {
      p_job_id: String(jobId),
    });
    if (error) return { ok: false, reason: String(error.message || "rpc_error").slice(0, 120) };
    const outcome = String(data || "");
    if (outcome === "completed" || outcome === "already_completed") return { ok: true, outcome };
    return { ok: false, outcome: outcome || "unexpected", reason: outcome || "unexpected" };
  } catch (e) {
    return { ok: false, reason: String(e?.message || e).slice(0, 120) };
  }
}

/** บันทึกรอบ retry ที่ล้ม — typed (Codex P1: ต้องตรวจ {error} จริง ไม่ใช่ await ทิ้ง)
 * @returns {Promise<{ok:boolean, affected?:number, reason?:string}>} */
export async function markQuotaDecrementError(jobId, message, deps = {}) {
  const client = deps.dbClient || supabase;
  try {
    const { data, error } = await client.rpc("mark_quota_decrement_error", {
      p_job_id: String(jobId),
      p_error: String(message || "unknown").slice(0, 300),
    });
    if (error) return { ok: false, reason: String(error.message || "rpc_error").slice(0, 120) };
    return { ok: true, affected: Number(data) || 0 };
  } catch (e) {
    return { ok: false, reason: String(e?.message || e).slice(0, 120) };
  }
}

/** สร้าง ledger คืนจาก actual-delivery evidence (durable owner ของเคส ensure ล้ม) */
export async function reconcileMissingQuotaLedgers(deps = {}) {
  const client = deps.dbClient || supabase;
  try {
    const { data, error } = await client.rpc("reconcile_missing_quota_ledgers", { p_limit: 20 });
    if (error) return { ok: false, reason: String(error.message || "rpc_error").slice(0, 120) };
    return { ok: true, created: Number(data) || 0 };
  } catch (e) {
    return { ok: false, reason: String(e?.message || e).slice(0, 120) };
  }
}

const SWEEP_MIN_AGE_MS = 120_000;
const SWEEP_LIMIT = 20;
const ALERT_AFTER_ATTEMPTS = 5;

/**
 * กวาด ledger — maintenanceWorker เรียกเป็นรอบ ๆ (เจ้าของจริงของ recovery):
 * ① reconcile: paid job delivered ที่ไม่มีแถว ledger (ensure ล้มตอนส่ง) → สร้าง pending
 * ② ไล่หัก pending ที่ค้าง · attempts สูง = CRITICAL alert (awaited + ตรวจ {ok})
 */
export async function sweepPendingQuotaDecrements(deps = {}) {
  const client = deps.dbClient || supabase;
  const now = deps.now ? deps.now() : Date.now();
  const stats = { reconciledLedgers: 0, scanned: 0, completed: 0, failed: 0, alerted: 0 };

  // ① durable reconstruction (Codex P0-1 รอบสอง): ห้ามพึ่ง Telegram เป็น owner
  const reconcile = deps.reconcileMissing || (() => reconcileMissingQuotaLedgers(deps));
  const rec = await reconcile();
  if (rec?.ok === true && rec.created > 0) {
    stats.reconciledLedgers = rec.created;
    console.log(JSON.stringify({ event: "QUOTA_LEDGER_RECONCILED_MISSING", created: rec.created }));
  } else if (rec?.ok === false) {
    console.log(JSON.stringify({ event: "QUOTA_LEDGER_RECONCILE_FAILED", reason: rec.reason || "unknown" }));
  }

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
  if (stats.scanned > 0 || stats.reconciledLedgers > 0) console.log(JSON.stringify({ event: "QUOTA_LEDGER_SWEEP", ...stats }));
  return stats;
}
