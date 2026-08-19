/**
 * Routing decision ของ result-status (Codex รอบ 6): แยกออกมาจาก webhook เพื่อ
 * ทดสอบพฤติกรรมจริงได้ — ไม่ใช่ตรวจแค่ลำดับบรรทัดในซอร์ส
 *
 * กติกา:
 * - payment_status / entitlement_status → ไม่รับ (ต้องไหลไป payment/entitlement flow)
 * - scan_status → รับเสมอ (ถามผลสแกนตรงตัว)
 * - generic_wait → รับเฉพาะเมื่อ "ยืนยันได้ว่าไม่มีเรื่องจ่ายเงินค้าง"
 *   อ่าน payments ไม่ได้ = fail-closed (ห้ามเดาว่าเป็นเรื่องสแกน)
 */
import { classifyStatusQuery, shouldResultStatusRouterHandle } from "./statusQuery.util.js";

/**
 * @param {{ text: string, getPaymentEvidence?: () => Promise<{ ok: boolean, active: boolean }> }} p
 * @returns {Promise<{ handle: boolean, kind: string, reason: string }>}
 */
export async function resolveResultStatusRouting({ text, getPaymentEvidence }) {
  const kind = classifyStatusQuery(text);
  if (kind === "other") return { handle: false, kind, reason: "not_status_query" };
  if (kind === "payment_status" || kind === "entitlement_status") {
    return { handle: false, kind, reason: "belongs_to_payment_flow" };
  }
  if (kind === "scan_status") {
    return { handle: true, kind, reason: "explicit_scan_status" };
  }
  // generic_wait
  if (!getPaymentEvidence) return { handle: false, kind, reason: "no_payment_evidence_source" };
  let ev;
  try {
    ev = await getPaymentEvidence();
  } catch {
    ev = { ok: false, active: false };
  }
  if (!ev || ev.ok !== true) {
    return { handle: false, kind, reason: "payment_evidence_unavailable" };
  }
  if (ev.active) return { handle: false, kind, reason: "pending_payment" };
  return {
    handle: shouldResultStatusRouterHandle({ kind, hasPendingPayment: false }),
    kind,
    reason: "generic_wait_no_payment",
  };
}
