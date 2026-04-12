import { insertOutboundMessage } from "../../stores/scanV2/outboundMessages.db.js";
import { OUTBOUND_PRIORITY } from "../../stores/scanV2/outboundPriority.js";

const SCAN_FAILURE_TEXT =
  "ขออภัยครับ ระบบประมวลผลรูปนี้ไม่สำเร็จ กรุณาส่งรูปใหม่อีกครั้ง " +
  "หากยังไม่ได้ผลลองถ่ายรูปในมุมที่ชัดขึ้นครับ";

/** Reasons where user already gets a tailored outbound (or failJob runs before that enqueue). */
const SKIP_REASONS = [
  "object_validation_failed",
  "supported_lane_unresolved",
  "unsupported_lane",
];

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

  if (SKIP_REASONS.includes(String(reason || "").trim())) return;

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
