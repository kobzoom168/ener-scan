/**
 * Unsupported object-type rejection: must always reach the user via {@link sendNonScanReply}.
 * Do not gate on Phase-1 Gemini `handled` — that caused silent drops (same class as multi-image).
 *
 * @module unsupportedObjectReply.service
 */

import { sendNonScanReply } from "../nonScanReply.gateway.js";
import { getUnsupportedObjectReplyCandidates } from "../../utils/webhookText.util.js";

/**
 * @param {object} ctx
 * @param {string} [ctx.userId]
 * @param {number|null} [ctx.flowVersion]
 * @param {string|null} [ctx.messageId]
 * @param {string} [ctx.objectCheckResult]
 * @param {string} [ctx.path] — e.g. webhook_finalize | worker_scan
 */
export function logUnsupportedObjectRejected(ctx) {
  console.log(
    JSON.stringify({
      event: "UNSUPPORTED_OBJECT_REJECTED",
      userId: ctx.userId ?? null,
      flowVersion: ctx.flowVersion ?? null,
      messageId: ctx.messageId ?? null,
      objectCheckResult: ctx.objectCheckResult ?? null,
      path: ctx.path ?? null,
    }),
  );
}

/**
 * @param {object} opts
 * @param {*} opts.client
 * @param {string} opts.userId
 * @param {string} [opts.replyToken]
 * @param {number|null} [opts.flowVersion]
 * @param {string|null} [opts.messageId]
 * @param {string} opts.objectCheckResult
 * @param {"unsupported_object"|"unsupported_object_fallback"} [opts.replyType]
 * @returns {Promise<{ sent: boolean, suppressed: boolean }>}
 */
export async function sendUnsupportedObjectRejectionViaGateway({
  client,
  userId,
  replyToken = "",
  flowVersion = null,
  messageId = null,
  objectCheckResult,
  replyType = "unsupported_object",
}) {
  const uid = String(userId || "").trim();
  logUnsupportedObjectRejected({
    userId: uid,
    flowVersion,
    messageId,
    objectCheckResult,
    path: "webhook_finalize",
  });

  const candidates = getUnsupportedObjectReplyCandidates();

  console.log(
    JSON.stringify({
      event: "UNSUPPORTED_OBJECT_REPLY_ROUTED",
      userId: uid,
      flowVersion,
      messageId,
      objectCheckResult,
      replyType,
    }),
  );

  const res = await sendNonScanReply({
    client,
    userId: uid,
    replyToken,
    replyType,
    semanticKey: "unsupported_object",
    text: candidates[0],
    alternateTexts: candidates.slice(1),
  });

  if (res.suppressed) {
    console.log(
      JSON.stringify({
        event: "UNSUPPORTED_OBJECT_REPLY_SUPPRESSED",
        userId: uid,
        flowVersion,
        messageId,
        objectCheckResult,
        exactDuplicate: Boolean(res.exactDuplicate),
        semanticDuplicate: Boolean(res.semanticDuplicate),
        retryCount: res.retryCount ?? 0,
      }),
    );
  } else if (res.sent) {
    console.log(
      JSON.stringify({
        event: "UNSUPPORTED_OBJECT_REPLY_SENT",
        userId: uid,
        flowVersion,
        messageId,
        objectCheckResult,
      }),
    );
  }

  return { sent: Boolean(res.sent), suppressed: Boolean(res.suppressed) };
}
