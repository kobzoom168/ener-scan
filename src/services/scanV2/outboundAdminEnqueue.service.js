import {
  insertOutboundMessage,
  findActiveOutboundByPaymentAndKind,
  findOutboundByPaymentAndKindAnyStatus,
} from "../../stores/scanV2/outboundMessages.db.js";
import {
  OUTBOUND_PRIORITY,
} from "../../stores/scanV2/outboundPriority.js";
import {
  LINE_STICKER_ID_PAYMENT_APPROVED_BLESSING,
  LINE_STICKER_PACKAGE_BROWN_CONY_SALLY_ANIMATED,
} from "../../utils/lineStickerMessage.util.js";
import { insertLineConversationMessage } from "../../stores/conversationMessages.db.js";
import { adminAlertStateFromResult } from "../../utils/rejectNotifyOutcome.util.js";

/**
 * @param {object} opts
 * @param {string} opts.lineUserId
 * @param {string} opts.paymentId
 * @param {string} opts.text
 * @param {string | null | undefined} opts.replyToken
 * @returns {Promise<{ id: string | null, deduped: boolean }>}
 */
export async function enqueueApproveNotify({
  lineUserId,
  paymentId,
  text,
  replyToken = null,
}) {
  const existing = await findActiveOutboundByPaymentAndKind(
    paymentId,
    "approve_notify",
  );
  if (existing?.id) {
    console.log(
      JSON.stringify({
        event: "OUTBOUND_ENQUEUE_DEDUPE",
        kind: "approve_notify",
        paymentIdPrefix: String(paymentId).slice(0, 8),
        existingOutboundPrefix: String(existing.id).slice(0, 8),
      }),
    );
    return { id: existing.id, deduped: true };
  }

  const row = await insertOutboundMessage({
    line_user_id: lineUserId,
    kind: "approve_notify",
    priority: OUTBOUND_PRIORITY.approve_notify,
    related_payment_id: paymentId,
    payload_json: {
      text: String(text || "").slice(0, 4900),
      replyToken: replyToken ? String(replyToken).trim() : null,
      paymentId: String(paymentId),
      source: "admin_approve",
      stickerAfterText: {
        packageId: LINE_STICKER_PACKAGE_BROWN_CONY_SALLY_ANIMATED,
        stickerId: LINE_STICKER_ID_PAYMENT_APPROVED_BLESSING,
      },
    },
    status: "queued",
  });

  console.log(
    JSON.stringify({
      event: "OUTBOUND_ADMIN_ENQUEUED",
      kind: "approve_notify",
      paymentIdPrefix: String(paymentId).slice(0, 8),
      outboundIdPrefix: row?.id ? String(row.id).slice(0, 8) : null,
    }),
  );

  // ลงประวัติแชทให้ AI เห็นว่าเรื่องจ่ายจบแล้ว (เคส 29 ก.ค.: ข้อความเปิดสิทธิ์
  // ไม่อยู่ใน history → บอททวงสลิปทั้งที่จ่ายแล้ว)
  void insertLineConversationMessage(lineUserId, "bot", String(text || "").slice(0, 1500));

  // Spend-to-upgrade (กบ 30 ก.ค.): จ่ายรอบ 2+ ของวัน → เสนอหักยอดขึ้นแพ็กใหญ่
  import("../upgradeCredit.service.js")
    .then((m) => void m.maybeOfferSpendUpgrade(lineUserId))
    .catch(() => {});

  return { id: row?.id ?? null, deduped: false };
}

/**
 * @param {object} opts
 * @param {string} opts.lineUserId
 * @param {string} opts.paymentId
 * @param {string} opts.text
 */
/** สถานะที่ "ยังอยู่ในคิว/ส่งแล้ว" = dedupe เงียบได้ · failed/dead/suppressed = มีแถวแล้วแต่ไม่ถึงลูกค้า → ไม่สร้างซ้ำเงียบ ๆ แต่รายงาน (log + admin alert) */
export const REJECT_NOTIFY_LIVE_STATUSES = Object.freeze(["queued", "sending", "retry_wait", "sent"]);

/**
 * เข้าคิวข้อความ "ไม่อนุมัติ" ให้ลูกค้า (kind reject_notify) — 1 แถวต่อ payment ตลอดอายุ (unique index sql/069 รอบ 3)
 *  - ตรวจแถวเดิมทุกสถานะก่อน · insert แล้วชน 23505 (แข่งกันเข้าคิว) = dedupe ไม่ใช่ error
 *  - แถวเดิม failed/dead/suppressed: ไม่สร้างใหม่เงียบ ๆ → คืน stuck=true + onStuck (default: sendAdminAlert) ให้คนตัดสินใจ (ไม่ requeue เอง)
 *    และบอกผลการส่งต่อ adminAlert = "sent" | "queued" (outbox ถาวร) | "lost" (throw/ไม่สำเร็จ) — ผู้เรียกใช้ rejectNotifyOutcome(): lost = คง pending ไว้ retry การแจ้งแอดมิน
 *  - คืน { id, status, deduped, stuck, adminAlert } · id มีค่าเมื่อยืนยันแล้วว่ามีแถว outbound จริง
 * @param {{ lineUserId: string, paymentId: string, text: string }} p
 * @param {{ findExisting?: Function, insert?: Function, onStuck?: Function }} [deps]
 */
export async function enqueueRejectNotify({ lineUserId, paymentId, text }, deps = {}) {
  const findExisting = deps.findExisting ?? findOutboundByPaymentAndKindAnyStatus;
  const insert = deps.insert ?? insertOutboundMessage;
  const pidPrefix = String(paymentId).slice(0, 8);
  const describe = async (row, via) => {
    const status = String(row?.status || "");
    if (REJECT_NOTIFY_LIVE_STATUSES.includes(status)) {
      console.log(JSON.stringify({ event: "OUTBOUND_ENQUEUE_DEDUPE", kind: "reject_notify", via, status, paymentIdPrefix: pidPrefix }));
      return { id: row.id, status, deduped: true, stuck: false };
    }
    console.error(JSON.stringify({ event: "OUTBOUND_REJECT_NOTIFY_EXISTING_NOT_DELIVERED", via, status, paymentIdPrefix: pidPrefix, outboundIdPrefix: String(row.id).slice(0, 8), note: "ไม่สร้างข้อความซ้ำ — ต้องมีคนดู (ห้าม requeue อัตโนมัติ)" }));
    const onStuck = deps.onStuck ?? defaultRejectNotifyStuckAlert;
    let adminAlert = "lost";
    try { adminAlert = adminAlertStateFromResult(await onStuck({ paymentId, outboundId: row.id, status })); }
    catch (e) { console.error(JSON.stringify({ event: "OUTBOUND_REJECT_NOTIFY_STUCK_ALERT_FAILED", paymentIdPrefix: pidPrefix, reason: String(e?.message || e).slice(0, 120) })); }
    if (adminAlert === "lost") console.error(JSON.stringify({ event: "OUTBOUND_REJECT_NOTIFY_STUCK_ALERT_LOST", paymentIdPrefix: pidPrefix, note: "คง reject_notify_pending ไว้ → sweep ลองแจ้งแอดมินใหม่ (ไม่สร้างข้อความลูกค้าใหม่)" }));
    return { id: row.id, status, deduped: true, stuck: true, adminAlert };
  };

  const existing = await findExisting(paymentId, "reject_notify");
  if (existing?.id) return describe(existing, "lookup");

  let row;
  try {
    row = await insert({
      line_user_id: lineUserId,
      kind: "reject_notify",
      priority: OUTBOUND_PRIORITY.reject_notify,
      related_payment_id: paymentId,
      payload_json: { text: String(text || "").slice(0, 4900), paymentId: String(paymentId) },
      status: "queued",
    });
  } catch (e) {
    if (String(e?.code || "") === "23505") {
      // แข่งกันเข้าคิว (เช่น Telegram กดซ้ำ + sweep) → unique index กันไว้ → อ่านแถวที่ชนะมาใช้
      const winner = await findExisting(paymentId, "reject_notify");
      if (winner?.id) return describe(winner, "unique_violation");
    }
    throw e;
  }

  console.log(JSON.stringify({ event: "OUTBOUND_ADMIN_ENQUEUED", kind: "reject_notify", paymentIdPrefix: pidPrefix, outboundIdPrefix: row?.id ? String(row.id).slice(0, 8) : null }));
  return { id: row?.id ?? null, status: "queued", deduped: false, stuck: false, adminAlert: null };
}

async function defaultRejectNotifyStuckAlert({ paymentId, outboundId, status }) {
  const { sendAdminAlert } = await import("../adminAlerts/adminAlert.service.js");
  return sendAdminAlert({
    category: "payments", severity: "med", dedupeKey: `reject_notify_stuck:${paymentId}`, dedupeSec: 6 * 3600,
    text: `ข้อความแจ้ง "ไม่อนุมัติ" ของบิล ${String(paymentId).slice(0, 8)}… มีอยู่แล้วแต่สถานะ ${status} (outbound ${String(outboundId).slice(0, 8)}…) — ระบบไม่สร้างซ้ำ ให้คนตรวจที่หน้า Admin > รายการนี้ / DLQ`,
  });
}

/**
 * Payment / QR instructions (text and/or image URL). Used when admin or system enqueues QR handoff.
 * @param {object} opts
 * @param {string} opts.lineUserId
 * @param {string} [opts.relatedPaymentId]
 * @param {{ text?: string, imageUrl?: string }} opts.payload
 */
export async function enqueuePaymentQrMessage({
  lineUserId,
  relatedPaymentId = null,
  payload,
}) {
  const row = await insertOutboundMessage({
    line_user_id: lineUserId,
    kind: "payment_qr",
    priority: OUTBOUND_PRIORITY.payment_qr,
    related_payment_id: relatedPaymentId,
    payload_json: {
      text: payload.text ? String(payload.text).slice(0, 4900) : "",
      imageUrl: payload.imageUrl ? String(payload.imageUrl).trim() : null,
    },
    status: "queued",
  });

  return { id: row?.id ?? null };
}

/**
 * Pending intro / compensation text (e.g. after approve notify could not complete inline — now always queued).
 * @param {object} opts
 * @param {string} opts.lineUserId
 * @param {string} [opts.paymentId]
 * @param {string} opts.text
 * @param {string} [opts.createdAt]
 */
export async function enqueuePendingIntroMessage({
  lineUserId,
  paymentId = null,
  text,
  createdAt = null,
}) {
  const row = await insertOutboundMessage({
    line_user_id: lineUserId,
    kind: "pending_intro",
    priority: OUTBOUND_PRIORITY.pending_intro,
    related_payment_id: paymentId,
    payload_json: {
      text: String(text || "").slice(0, 4900),
      paymentId: paymentId ? String(paymentId) : null,
      createdAt: createdAt || new Date().toISOString(),
    },
    status: "queued",
  });

  console.log(
    JSON.stringify({
      event: "OUTBOUND_ADMIN_ENQUEUED",
      kind: "pending_intro",
      outboundIdPrefix: row?.id ? String(row.id).slice(0, 8) : null,
      lineUserIdPrefix: String(lineUserId).slice(0, 8),
    }),
  );

  return { id: row?.id ?? null };
}

/**
 * Generic admin text (e.g. free-trial reset confirmation) — uses approve_notify priority with payload source.
 * @param {object} opts
 * @param {string} opts.lineUserId
 * @param {string} opts.text
 * @param {string | null | undefined} opts.replyToken
 * @param {string} opts.source
 */
export async function enqueueAdminSystemText({
  lineUserId,
  text,
  replyToken = null,
  source,
}) {
  const row = await insertOutboundMessage({
    line_user_id: lineUserId,
    kind: "approve_notify",
    priority: OUTBOUND_PRIORITY.approve_notify,
    related_payment_id: null,
    payload_json: {
      text: String(text || "").slice(0, 4900),
      replyToken: replyToken ? String(replyToken).trim() : null,
      source: String(source || "admin_system"),
      noSticker: true,
    },
    status: "queued",
  });

  console.log(
    JSON.stringify({
      event: "OUTBOUND_ADMIN_ENQUEUED",
      kind: "approve_notify",
      source,
      outboundIdPrefix: row?.id ? String(row.id).slice(0, 8) : null,
    }),
  );

  return { id: row?.id ?? null };
}
