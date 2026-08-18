/**
 * เลื่อน paywall เมื่อผลชิ้นก่อนหน้ายังไม่ยืนยันว่าถึงมือลูกค้า — pure resolver
 * (กบ 18 ส.ค. เคสลูกค้าใหม่ + Codex รอบ 2: แยก pure + behavior tests, ตั้ง policy
 * เกิน safety bound ให้ชัด, ชื่อสื่อความจริง — ใช้กับทุกคนไม่ใช่แค่รายงานแรก)
 *
 * หลัก: delivery evidence นำ (สถานะ delivered เท่านั้นที่ยืนยันถึงมือ) · เวลาเป็นแค่
 * safety bound — งานค้างนานผิดปกติ (> SAFETY_BOUND) ถือว่ามีระบบ failure-notify
 * ดูแลแล้ว ไม่บล็อกการขายตลอดไป
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
 * }} p
 * @returns {{ decision: "defer" | "paywall", reason: string }}
 */
export function resolvePaywallDeferDecision({ inFlightActive, job, dbError = false }) {
  // in-flight gate (redis TTL 180s) = หลักฐานสดที่สุดว่างานกำลังทำ
  if (inFlightActive) return { decision: "defer", reason: "in_flight" };
  if (dbError || !job) {
    // ไม่มีหลักฐานอะไรเลย = fail-open ตามพฤติกรรมเดิม (ขายตามปกติ)
    return { decision: "paywall", reason: dbError ? "db_error_no_evidence" : "no_recent_job" };
  }
  const st = String(job.status || "");
  if (st === "delivered") return { decision: "paywall", reason: "delivered" };
  if (PENDING_STATUSES.has(st)) {
    if (Number(job.ageMs) > PAYWALL_DEFER_SAFETY_BOUND_MS) {
      // ค้างเกิน bound = งานติดผิดปกติ (failure-notify เป็นเจ้าของการแจ้ง) — ไม่บล็อกขายต่อ
      return { decision: "paywall", reason: "stale_pending_over_bound" };
    }
    return { decision: "defer", reason: `pending_${st}` };
  }
  // failed/cancelled/สถานะอื่น = ไม่มีผลจะไปถึงมืออยู่แล้ว — ขายตามปกติ
  return { decision: "paywall", reason: `not_pending_${st || "unknown"}` };
}

/** copy ที่ไม่อ้างสถานะที่ไม่รู้จริง (completed อาจอ่านเสร็จแล้ว) และไม่มีคำสัญญาเวลา */
export const PAYWALL_DEFER_TEXT =
  "รับรูปชิ้นนี้ไว้แล้วครับ ขอส่งผลชิ้นก่อนหน้าให้เรียบร้อยก่อนนะครับ";
