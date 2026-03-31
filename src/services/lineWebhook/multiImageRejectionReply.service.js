/**
 * Deterministic multi-image rejection: always notify via non-scan gateway (reply or push).
 * Phase-1 Gemini must not short-circuit this path — users were getting silent drops.
 *
 * @module multiImageRejectionReply.service
 */

import { sendNonScanReply } from "../nonScanReply.gateway.js";
import { getMultiImageInRequestReplyCandidates } from "../../utils/webhookText.util.js";

/**
 * @typedef {"candidate_window"|"same_webhook_batch"|"burst_window"} MultiImageRejectReason
 */

/**
 * @param {object} ctx
 * @param {string} ctx.userId
 * @param {number} [ctx.flowVersion]
 * @param {string|null} [ctx.firstMessageId]
 * @param {string|null} [ctx.latestMessageId]
 * @param {number} [ctx.count]
 * @param {MultiImageRejectReason} ctx.reason
 */
export function logMultiImageGroupRejected(ctx) {
  console.log(
    JSON.stringify({
      event: "MULTI_IMAGE_GROUP_REJECTED",
      userId: ctx.userId,
      flowVersion: ctx.flowVersion ?? null,
      firstMessageId: ctx.firstMessageId ?? null,
      latestMessageId: ctx.latestMessageId ?? null,
      count: ctx.count ?? null,
      reason: ctx.reason,
    }),
  );
}

/**
 * @param {object} opts
 * @param {*} opts.client
 * @param {string} opts.userId
 * @param {string} [opts.replyToken]
 * @param {MultiImageRejectReason} opts.reason
 * @param {number} [opts.flowVersion]
 * @param {string|null} [opts.firstMessageId]
 * @param {string|null} [opts.latestMessageId]
 * @param {number} [opts.count]
 * @returns {Promise<{ sent: boolean, suppressed: boolean }>}
 */
export async function sendMultiImageRejectionViaGateway({
  client,
  userId,
  replyToken = "",
  reason,
  flowVersion,
  firstMessageId,
  latestMessageId,
  count,
}) {
  const uid = String(userId || "").trim();
  const candidates = getMultiImageInRequestReplyCandidates();

  console.log(
    JSON.stringify({
      event: "MULTI_IMAGE_REPLY_ROUTED",
      userId: uid,
      flowVersion: flowVersion ?? null,
      firstMessageId: firstMessageId ?? null,
      latestMessageId: latestMessageId ?? null,
      count: count ?? null,
      reason,
      replyTokenPresent: Boolean(String(replyToken || "").trim()),
    }),
  );

  const res = await sendNonScanReply({
    client,
    userId: uid,
    replyToken,
    replyType: "multi_image_rejected",
    semanticKey: "multi_image_rejected",
    text: candidates[0],
    alternateTexts: candidates.slice(1),
  });

  if (res.suppressed) {
    console.log(
      JSON.stringify({
        event: "MULTI_IMAGE_REPLY_SUPPRESSED",
        userId: uid,
        flowVersion: flowVersion ?? null,
        firstMessageId: firstMessageId ?? null,
        latestMessageId: latestMessageId ?? null,
        count: count ?? null,
        reason,
        gatewayRetryCount: res.retryCount ?? 0,
        exactDuplicate: Boolean(res.exactDuplicate),
        semanticDuplicate: Boolean(res.semanticDuplicate),
      }),
    );
  } else if (res.sent) {
    console.log(
      JSON.stringify({
        event: "MULTI_IMAGE_REPLY_SENT",
        userId: uid,
        flowVersion: flowVersion ?? null,
        firstMessageId: firstMessageId ?? null,
        latestMessageId: latestMessageId ?? null,
        count: count ?? null,
        reason,
      }),
    );
  }

  return { sent: Boolean(res.sent), suppressed: Boolean(res.suppressed) };
}
