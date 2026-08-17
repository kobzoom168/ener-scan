import { insertOutboundMessage } from "../../stores/scanV2/outboundMessages.db.js";
import { OUTBOUND_PRIORITY } from "../../stores/scanV2/outboundPriority.js";

const SCAN_FAILURE_TEXT =
  "รูปนี้อ่านไม่สำเร็จครับ รบกวนส่งใหม่อีกครั้ง " +
  "ถ้ายังไม่ผ่านลองถ่ายมุมที่เห็นตัววัตถุชัดขึ้นครับ";

/**
 * Allowlist (Codex 17 ส.ค. รอบ 2): ส่ง generic notify เฉพาะ failure เชิงระบบ
 * ที่ไม่มีข้อความเฉพาะทางของมันเอง — เหตุผลใหม่ที่เพิ่มภายหลัง default = ไม่ส่ง
 * (เดิมเป็น skip-list ทำให้เหตุผลที่มีข้อความเฉพาะทางอยู่แล้ว เช่น auth challenge / ritual_object_not_readable โดนส่งซ้ำ 2 ข้อความ)
 */
const GENERIC_NOTIFY_REASONS = new Set([
  "upload_missing",
  "storage_read_failed",
  "deep_scan_failed",
  "scan_request_failed",
  "result_insert_failed",
  "scan_result_legacy_failed",
  "publication_id_missing_after_upsert",
  "outbound_enqueue_failed",
]);

/**
 * Push LINE text แจ้ง user เมื่อ scan job ล้มเหลว
 * ไม่ throw — caller ไม่ควรพัง
 * @param {{ lineUserId: string, jobId: string, reason: string }} p
 * @param {{ insertOutboundMessage?: typeof insertOutboundMessage }} [deps]
 */
export async function notifyUserScanJobFailed(
  { lineUserId, jobId, reason },
  deps = {},
) {
  const insert = deps.insertOutboundMessage ?? insertOutboundMessage;
  const uid = String(lineUserId || "").trim();
  if (!uid) return;

  if (!GENERIC_NOTIFY_REASONS.has(String(reason || "").trim())) return;

  try {
    await insert({
      line_user_id: uid,
      kind: "scan_failure_notify",
      priority: OUTBOUND_PRIORITY.scan_failure_notify,
      related_job_id: jobId,
      payload_json: { text: SCAN_FAILURE_TEXT },
      status: "queued",
    });
    console.log(
      JSON.stringify({
        event: "SCAN_FAILURE_NOTIFY_ENQUEUED",
        jobIdPrefix: String(jobId || "").slice(0, 8),
        lineUserIdPrefix: uid.slice(0, 8),
        reason,
      }),
    );
  } catch (e) {
    console.error("[SCAN_FAILURE_NOTIFY] enqueue failed:", e?.message);
  }
}
