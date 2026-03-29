import { tryLinePushMessageWith429RetryOnce } from "./linePush429Retry.util.js";
import {
  setPendingApprovedIntroCompensation,
  takePendingApprovedIntroCompensation,
} from "../stores/session.store.js";

/**
 * If admin approve notify failed, we queue intro text; push it on the next inbound webhook (does not consume replyToken).
 * @param {object} opts
 * @param {*} opts.client
 * @param {string} opts.userId
 * @returns {Promise<{ attempted: boolean, sent: boolean, requeued: boolean }>}
 */
export async function maybeFlushPendingApprovedIntroCompensation({
  client,
  userId,
}) {
  const pending = takePendingApprovedIntroCompensation(userId);
  if (!pending?.text) {
    return { attempted: false, sent: false, requeued: false };
  }

  const uid = String(userId || "").trim();
  const payload = { type: "text", text: pending.text };
  const result = await tryLinePushMessageWith429RetryOnce(client, uid, payload);

  if (result.ok) {
    console.log(
      JSON.stringify({
        event: "APPROVE_PENDING_INTRO_PUSH_OK",
        paymentId: pending.paymentId || null,
        lineUserIdPrefix: uid.slice(0, 8),
        attempts: result.attempts,
      }),
    );
    return { attempted: true, sent: true, requeued: false };
  }

  setPendingApprovedIntroCompensation(uid, {
    text: pending.text,
    paymentId: pending.paymentId,
  });
  console.log(
    JSON.stringify({
      event: "APPROVE_PENDING_INTRO_REQUEUED",
      paymentId: pending.paymentId || null,
      lineUserIdPrefix: uid.slice(0, 8),
      attempts: result.attempts,
      lastIs429: Boolean(result.lastIs429),
    }),
  );
  return { attempted: true, sent: false, requeued: true };
}
