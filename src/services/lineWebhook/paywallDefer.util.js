/**
 * เลื่อน paywall เมื่อผลชิ้นก่อนหน้ายังไม่ยืนยันว่าถึงมือลูกค้า — pure resolver
 * (กบ 18 ส.ค. + Codex รอบ 3): invariant คือ "ลูกค้าต้องได้รับคุณค่าก่อนขาย"
 *
 * outcome 3 ทาง:
 *  - defer    = ผลกำลังมา รอส่งผลก่อนค่อยว่าเรื่องเงิน
 *  - recovery = ลูกค้ายังไม่เคยได้ผลเลย และรอบล่าสุดล้ม/ค้างผิดปกติ → แจ้งตรง ๆ
 *               เปิดทางส่งใหม่ ห้ามยัดราคา (ขายหลังรอ 30 นาทีแต่ไม่ได้ผล = พังเท่าเดิม)
 *  - paywall  = ขายได้ตามปกติ (ผลถึงมือแล้ว หรือลูกค้าเคยได้รับคุณค่าแล้ว)
 */

export const PAYWALL_DEFER_SAFETY_BOUND_MS = 30 * 60 * 1000;

const PENDING_STATUSES = new Set([
  "queued",
  "processing",
  "claimed",
  "completed",
  "delivery_queued",
]);

/**
 * @param {{
 *   inFlightActive: boolean,
 *   job: { status: string, ageMs: number } | null,
 *   dbError?: boolean,
 *   hasAnyDeliveredReport?: boolean,
 * }} p
 * @returns {{ decision: "defer" | "paywall" | "recovery", reason: string }}
 */
export function resolvePaywallDeferDecision({
  inFlightActive,
  job,
  dbError = false,
  hasAnyDeliveredReport = false,
}) {
  // in-flight gate = หลักฐานสดที่สุดว่างานกำลังทำ
  if (inFlightActive) return { decision: "defer", reason: "in_flight" };
  if (dbError || !job) {
    // ไม่มีหลักฐานอะไรเลย = fail-open ตามพฤติกรรมเดิม (ขายตามปกติ)
    return { decision: "paywall", reason: dbError ? "db_error_no_evidence" : "no_recent_job" };
  }
  const st = String(job.status || "");
  if (st === "delivered") return { decision: "paywall", reason: "delivered" };

  const ageMs = Number(job.ageMs);
  const ageValid = Number.isFinite(ageMs) && ageMs >= 0;

  if (PENDING_STATUSES.has(st)) {
    if (!ageValid) {
      // created_at เพี้ยน/parse ไม่ได้ — ห้าม defer ค้างไม่สิ้นสุด (Codex: NaN > bound = false)
      return hasAnyDeliveredReport
        ? { decision: "paywall", reason: "invalid_job_age" }
        : { decision: "recovery", reason: "invalid_job_age" };
    }
    if (ageMs > PAYWALL_DEFER_SAFETY_BOUND_MS) {
      // ค้างเกิน bound: ลูกค้าที่เคยได้คุณค่าแล้ว → ขายต่อได้ (failure-notify เป็น
      // เจ้าของการแจ้งงานติด) · ลูกค้าใหม่ที่ยังไม่เคยได้ผลเลย → ห้ามขาย ให้ recovery
      return hasAnyDeliveredReport
        ? { decision: "paywall", reason: "stale_pending_over_bound" }
        : { decision: "recovery", reason: "stale_pending_no_value" };
    }
    return { decision: "defer", reason: `pending_${st}` };
  }

  // failed/cancelled/สถานะอื่น: ไม่มีผลกำลังมา — ตัดสินจากว่าลูกค้าเคยได้คุณค่าหรือยัง
  return hasAnyDeliveredReport
    ? { decision: "paywall", reason: `not_pending_${st || "unknown"}` }
    : { decision: "recovery", reason: `no_value_${st || "unknown"}` };
}

/** copy defer: ไม่อ้างสถานะที่ไม่รู้จริง ไม่มีคำสัญญาเวลา ไม่มีเรื่องเงิน */
export const PAYWALL_DEFER_TEXT =
  "รับรูปชิ้นนี้ไว้แล้วครับ ขอส่งผลชิ้นก่อนหน้าให้เรียบร้อยก่อนนะครับ";

/** copy recovery: แจ้งตรง เปิดทาง retry — ไม่มีเงิน/ราคา และไม่สัญญาว่าผลจะมาเอง */
export const PAYWALL_RECOVERY_TEXT =
  "รับรูปชิ้นนี้ไว้แล้วครับ ชิ้นก่อนหน้าระบบอ่านไม่สำเร็จ ยังไม่ได้ส่งผลให้ครับ\n\nส่งรูปชิ้นเดิมมาอีกครั้งได้เลย ผมจะส่งให้อาจารย์อ่านให้ครับ";
