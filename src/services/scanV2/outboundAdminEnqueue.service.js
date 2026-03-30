import {
  insertOutboundMessage,
  findActiveOutboundByPaymentAndKind,
} from "../../stores/scanV2/outboundMessages.db.js";
import {
  OUTBOUND_PRIORITY,
} from "../../stores/scanV2/outboundPriority.js";

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

  return { id: row?.id ?? null, deduped: false };
}

/**
 * @param {object} opts
 * @param {string} opts.lineUserId
 * @param {string} opts.paymentId
 * @param {string} opts.text
 */
export async function enqueueRejectNotify({ lineUserId, paymentId, text }) {
  const existing = await findActiveOutboundByPaymentAndKind(
    paymentId,
    "reject_notify",
  );
  if (existing?.id) {
    console.log(
      JSON.stringify({
        event: "OUTBOUND_ENQUEUE_DEDUPE",
        kind: "reject_notify",
        paymentIdPrefix: String(paymentId).slice(0, 8),
      }),
    );
    return { id: existing.id, deduped: true };
  }

  const row = await insertOutboundMessage({
    line_user_id: lineUserId,
    kind: "reject_notify",
    priority: OUTBOUND_PRIORITY.reject_notify,
    related_payment_id: paymentId,
    payload_json: {
      text: String(text || "").slice(0, 4900),
      paymentId: String(paymentId),
    },
    status: "queued",
  });

  console.log(
    JSON.stringify({
      event: "OUTBOUND_ADMIN_ENQUEUED",
      kind: "reject_notify",
      paymentIdPrefix: String(paymentId).slice(0, 8),
      outboundIdPrefix: row?.id ? String(row.id).slice(0, 8) : null,
    }),
  );

  return { id: row?.id ?? null, deduped: false };
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
