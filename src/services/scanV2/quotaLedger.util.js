/**
 * Durable paid-quota decrement (Codex 29 ส.ค. 2026 — sql/055):
 * "delivered" ไม่ใช่หลักฐานว่าหักสิทธิ์แล้ว — ledger ต่อ job (scan_quota_decrements) คือเจ้าของถาวร
 *  - ensure_quota_decrement_pending: สร้าง/อ่าน ledger (idempotent, SECURITY DEFINER)
 *  - claim_paid_scan_decrement: หักจริงครั้งเดียว (FOR UPDATE + completed ใน transaction เดียว)
 *  - claim ล้ม → mark_quota_decrement_error (ledger คง pending) → sweeper ใน maintenance ตามหักต่อ
 *  - reconcile_missing_quota_ledgers: เก็บ job delivered(version 2) ที่ crash ก่อนสร้าง ledger
 */
import { supabase } from "../../config/supabase.js";

const log = (event, extra) => console.log(JSON.stringify({ event, ...extra }));
const logErr = (event, extra) => console.error(JSON.stringify({ event, ...extra }));

/**
 * เรียกหลังรายงานถึงลูกค้าแล้ว (post-delivery) — typed, ห้าม throw
 * @returns {Promise<{ outcome: "completed" | "already_completed" | "not_paid" | "skipped_no_job" | "pending_retry", message?: string }>}
 */
export async function settlePaidQuotaAfterDelivery(jobId, deps = {}) {
  const jid = String(jobId || "").trim();
  if (!jid) return { outcome: "skipped_no_job" };
  const rpc = deps.rpc || ((fn, args) => supabase.rpc(fn, args));
  let ensured;
  try {
    const { data, error } = await rpc("ensure_quota_decrement_pending", { p_job_id: jid });
    if (error) throw new Error(error.message || "ensure_failed");
    ensured = String(data || "");
  } catch (e) {
    // ledger ยังไม่เกิด — reconcile sweeper จะเก็บจาก job delivered(version 2) + outbound sent
    logErr("QUOTA_LEDGER_ENSURE_FAILED", { jobIdPrefix: jid.slice(0, 8), message: String(e?.message || e).slice(0, 160) });
    return { outcome: "pending_retry", message: "ensure_failed" };
  }
  if (ensured === "not_paid" || ensured === "job_not_found") return { outcome: "not_paid" };
  if (ensured === "user_mismatch") {
    logErr("QUOTA_LEDGER_USER_MISMATCH", { jobIdPrefix: jid.slice(0, 8) });
    return { outcome: "pending_retry", message: "user_mismatch" };
  }
  if (ensured === "completed") {
    log("QUOTA_LEDGER_ALREADY_COMPLETED", { jobIdPrefix: jid.slice(0, 8), via: "ensure" });
    return { outcome: "already_completed" };
  }
  // pending → claim (atomic ใน RPC)
  try {
    const { data, error } = await rpc("claim_paid_scan_decrement", { p_job_id: jid });
    if (error) throw new Error(error.message || "claim_failed");
    const res = String(data || "");
    if (res === "completed") {
      log("QUOTA_LEDGER_DECREMENT_COMPLETED", { jobIdPrefix: jid.slice(0, 8) });
      return { outcome: "completed" };
    }
    if (res === "already_completed") {
      log("QUOTA_LEDGER_ALREADY_COMPLETED", { jobIdPrefix: jid.slice(0, 8), via: "claim" });
      return { outcome: "already_completed" };
    }
    throw new Error(`claim_unexpected:${res}`);
  } catch (e) {
    const msg = String(e?.message || e).slice(0, 160);
    logErr("QUOTA_LEDGER_CLAIM_FAILED", { jobIdPrefix: jid.slice(0, 8), message: msg });
    try {
      await rpc("mark_quota_decrement_error", { p_job_id: jid, p_error: msg });
    } catch { /* best-effort — ledger ยัง pending อยู่แล้ว */ }
    return { outcome: "pending_retry", message: msg };
  }
}

/**
 * maintenance sweeper: reconcile ledger ที่หาย + ตามหัก pending ค้าง
 * @returns {Promise<{ reconciled: number, claimed: number, stillPending: number, errors: number }>}
 */
export async function sweepQuotaLedger(deps = {}) {
  const rpc = deps.rpc || ((fn, args) => supabase.rpc(fn, args));
  const db = deps.supabase || supabase;
  const out = { reconciled: 0, claimed: 0, stillPending: 0, errors: 0 };
  try {
    const { data, error } = await rpc("reconcile_missing_quota_ledgers", { p_limit: 50 });
    if (!error) out.reconciled = Number(data) || 0;
    else out.errors += 1;
  } catch { out.errors += 1; }
  let rows = [];
  try {
    const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data, error } = await db
      .from("scan_quota_decrements")
      .select("job_id,attempts")
      .eq("status", "pending")
      .lte("created_at", cutoff)
      .order("created_at", { ascending: true })
      .limit(20);
    if (error) throw new Error(error.message);
    rows = Array.isArray(data) ? data : [];
  } catch (e) {
    logErr("QUOTA_LEDGER_SWEEP_LIST_FAILED", { message: String(e?.message || e).slice(0, 160) });
    out.errors += 1;
    return out;
  }
  for (const r of rows) {
    const res = await settlePaidQuotaAfterDelivery(r.job_id, deps);
    if (res.outcome === "completed" || res.outcome === "already_completed") out.claimed += 1;
    else { out.stillPending += 1; }
  }
  if (out.reconciled || out.claimed || out.stillPending) {
    log("QUOTA_LEDGER_SWEEP", out);
  }
  return out;
}
