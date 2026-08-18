import { insertOutboundMessage } from "../../stores/scanV2/outboundMessages.db.js";
import { OUTBOUND_PRIORITY } from "../../stores/scanV2/outboundPriority.js";

const SCAN_FAILURE_TEXT =
  "รูปนี้อ่านไม่สำเร็จครับ รบกวนส่งใหม่อีกครั้ง " +
  "ถ้ายังไม่ผ่านลองถ่ายมุมที่เห็นตัววัตถุชัดขึ้นครับ";

/**
 * Owner map ของทุก failJob code (Codex 17 ส.ค. รอบ 3: ห้ามมี code ที่ไม่มีเจ้าของ
 * notification) — เทสต์ scan source ของ processScanJob ยืนยันว่า code ใหม่ทุกตัว
 * ต้องถูกจัดเข้ากลุ่มใดกลุ่มหนึ่ง ไม่งั้นเทสต์แดง
 */

/** infra ล้มแบบไม่มีข้อความอื่น → generic notify 1 ข้อความ */
export const GENERIC_NOTIFY_REASONS = new Set([
  "upload_missing",
  "storage_read_failed",
  "deep_scan_failed",
  "scan_request_failed",
  "result_insert_failed",
  "scan_results_v2_insert_failed",
  "scan_result_legacy_failed",
  "publication_id_missing_after_upsert",
  "outbound_enqueue_failed",
]);

/** flow ส่งข้อความเฉพาะทางของมันเองแล้ว → ห้ามส่ง generic ซ้อน */
export const TAILORED_BY_FLOW_REASONS = new Set([
  "suppressed_banned", // แบนอยู่ — ตั้งใจเงียบ (ban gate เป็นเจ้าของ) ห้าม generic
  "object_validation_failed",
  "supported_lane_unresolved",
  "unsupported_lane",
  "ritual_object_not_readable",
  "auth_challenge_no_thumb",
  "auth_challenge_failed",
  "auth_challenge_issued",
  "image_authenticity_suspect",
  "forensic_flagged",
  "forensic_suspect",
]);

/** ไม่มีข้อความจาก flow แต่ generic ก็ไม่แก้สาเหตุ → recovery เฉพาะทางที่นี่ */
export const RECOVERY_TEXTS = Object.freeze({
  // CTA ต้องพาไป route ที่รับข้อมูลได้จริงเท่านั้น (Codex รอบ 4): พิมพ์วันเกิดเปล่า ๆ
  // ระบบไม่รับนอก waiting_birthdate — ของจริงคือ "เปลี่ยนวันเกิด" (birthdateChangeFlow
  // รับจากทุก state) กับหน้า LIFF ผ่านเมนู เปิดแอป Ener
  birthdate_missing:
    "รอบนี้อาจารย์ยังเริ่มอ่านไม่ได้ครับ เพราะยังไม่มีวันเกิดผูกกับบัญชี\n\n" +
    "พิมพ์คำว่า เปลี่ยนวันเกิด ในแชทนี้แล้วทำตามขั้นตอน หรือกดเมนู เปิดแอป Ener เพื่อกรอกข้อมูลก็ได้ครับ\n\n" +
    "เสร็จแล้วส่งรูปเดิมมาอีกครั้ง เดี๋ยวผมส่งให้อาจารย์ทันทีครับ",
});

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

  const r = String(reason || "").trim();
  let text = null;
  if (GENERIC_NOTIFY_REASONS.has(r)) {
    text = SCAN_FAILURE_TEXT;
  } else if (RECOVERY_TEXTS[r]) {
    text = RECOVERY_TEXTS[r];
  } else if (TAILORED_BY_FLOW_REASONS.has(r)) {
    return; // flow เป็นเจ้าของข้อความอยู่แล้ว
  } else {
    // code ใหม่ที่ยังไม่มีเจ้าของ — ห้ามส่ง generic มั่ว แต่ต้องดังพอให้คนมาเก็บ
    console.error(
      JSON.stringify({
        event: "SCAN_FAILURE_NOTIFY_NO_OWNER",
        reason: r,
        jobIdPrefix: String(jobId || "").slice(0, 8),
      }),
    );
    return;
  }

  try {
    await insert({
      line_user_id: uid,
      kind: "scan_failure_notify",
      priority: OUTBOUND_PRIORITY.scan_failure_notify,
      related_job_id: jobId,
      payload_json: { text },
      status: "queued",
    });
    console.log(
      JSON.stringify({
        event: "SCAN_FAILURE_NOTIFY_ENQUEUED",
        jobIdPrefix: String(jobId || "").slice(0, 8),
        lineUserIdPrefix: uid.slice(0, 8),
        reason: r,
      }),
    );
  } catch (e) {
    console.error("[SCAN_FAILURE_NOTIFY] enqueue failed:", e?.message);
  }
}
