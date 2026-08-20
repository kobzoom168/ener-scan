/**
 * P0-2 backfill predicate (Codex รอบสอง 20 ส.ค. 2026) — mirror ของ WHERE ใน
 * sql/backfill_delivered_status_20260820.sql เป็นโค้ด pure เพื่อให้ fixture tests
 * พิสูจน์ behavior ได้จริง (เทสต์ contract แบบอ่าน source เคยให้ false green)
 *
 * หลักฐานการส่งจริง (actual delivery) ≠ outbound ตัวแรกที่ถูก mark sent ตอนเกต
 * "พักรายงานแล้วส่งคำถาม" — ตัวนั้นมี related_job_id แต่รายงานเต็มยังไม่ถึงลูกค้า
 */

/**
 * outbound แถวนี้เป็นหลักฐานว่า "ผลเต็มของ job นี้ส่งถึงลูกค้าแล้วจริง" ไหม
 * @param {{ kind?: string, status?: string, related_job_id?: string|null,
 *   line_user_id?: string, payload_json?: { error?: unknown, scanResultId?: unknown, scanId?: unknown } }} outbound
 * @param {{ id?: string, line_user_id?: string, result_id?: string|null }} job
 */
export function isActualDeliveryEvidence(outbound, job) {
  if (!outbound || !job) return false;
  if (String(outbound.kind || "") !== "scan_result") return false;
  if (String(outbound.status || "") !== "sent") return false;
  // ตัว re-enqueue ยุคก่อนแก้ไม่มี related_job_id — ตัวที่ "มี" คือ held outbound
  // ที่ถูก mark sent ตอนส่งคำถามขอข้อมูล ห้ามนับเป็นหลักฐานส่งผลเต็ม
  if (outbound.related_job_id != null && String(outbound.related_job_id) !== "") return false;
  if (String(outbound.line_user_id || "") !== String(job.line_user_id || "")) return false;
  const p = outbound.payload_json || {};
  if (p.error === true || String(p.error || "") === "true") return false;
  const rid = String(job.result_id || "");
  if (!rid) return false;
  return String(p.scanResultId || "") === rid || String(p.scanId || "") === rid;
}

/**
 * ตัดสินใจ backfill ต่อ job หนึ่งตัวจาก outbound rows ของ user นั้น
 * @returns {{ markDelivered: boolean, reason: string }}
 */
export function resolveBackfillDecision(job, outbounds) {
  const st = String(job?.status || "");
  if (st !== "delivery_queued") return { markDelivered: false, reason: `status_${st || "unknown"}_untouched` };
  if (!job?.result_id) return { markDelivered: false, reason: "no_result_id" };
  const hit = (Array.isArray(outbounds) ? outbounds : []).some((o) => isActualDeliveryEvidence(o, job));
  return hit
    ? { markDelivered: true, reason: "actual_delivery_evidence" }
    : { markDelivered: false, reason: "no_actual_delivery_evidence" };
}
