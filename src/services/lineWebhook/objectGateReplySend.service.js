/**
 * Routes deterministic object-gate outcomes to LINE non-scan replies.
 * Reply types and copy come from code — optional conv-AI only rephrases within contract.
 *
 * @module objectGateReplySend.service
 */

import { env } from "../../config/env.js";
import {
  sendNonScanReply,
  sendNonScanReplyWithOptionalConvSurface,
} from "../nonScanReply.gateway.js";
import { sendUnsupportedObjectRejectionViaGateway } from "./unsupportedObjectReply.service.js";
import {
  bumpRejectionCount,
  generateSmartRejectionText,
  ESCALATION_TEXT,
  notifyAdminRejectionStreak,
} from "../scanV2/smartRejection.service.js";
import { setValueWithTtl } from "../../redis/scanV2Redis.js";
import {
  getImageRetakeRequiredReplyCandidates,
  getMultipleObjectsReplyCandidates,
  getObjectInconclusiveReplyCandidates,
  buildObjectInconclusiveAllowedFacts,
  buildImageRetakeRequiredAllowedFacts,
} from "../../utils/webhookText.util.js";

/**
 * @param {object} opts
 * @param {*} opts.client
 * @param {string} opts.userId
 * @param {string} [opts.replyToken]
 * @param {number|null} [opts.flowVersion]
 * @param {string|null} [opts.messageId]
 * @param {string} [opts.lastUserText]
 * @param {object} opts.routing — from {@link resolveObjectGateReplyRouting}
 * @param {object} opts.gated — from {@link checkSingleObjectGated}
 */
export async function sendObjectGateRoutedNonScanReply({
  client,
  userId,
  replyToken = "",
  flowVersion = null,
  messageId = null,
  lastUserText = "",
  routing,
  gated,
}) {
  const uid = String(userId || "").trim();
  console.log(
    JSON.stringify({
      event: "OBJECT_REPLY_TYPE_SELECTED",
      kind: routing.kind,
      replyType: routing.replyType,
      semanticKey: routing.semanticKey,
      reason: routing.reason,
      firstPass: gated?.firstPass ?? null,
      secondPass: gated?.secondPass ?? null,
      result: gated?.result ?? null,
      messageId: messageId ?? null,
      path: gated?.gateMeta?.path ?? null,
    }),
  );

  if (routing.kind === "allow_scan") {
    throw new Error("sendObjectGateRoutedNonScanReply: allow_scan must not send");
  }

  // สตรีคโดนปัด: นับทุกเหตุผล เก็บสาเหตุล่าสุดให้สมองแชทเห็น + บันได escalation
  const reasonKind =
    routing.kind === "multiple_objects"
      ? "multiple"
      : routing.kind === "image_retake_required"
        ? "unclear"
        : routing.kind === "object_inconclusive"
          ? "inconclusive"
          : "unsupported";
  const attempt = await bumpRejectionCount(uid);
  setValueWithTtl(`scan_v2:reject_last:${uid}`, reasonKind, 7200);
  if (attempt >= 5) {
    // หยุดวนประโยคเดิม: อาจารย์รับไปดูเอง + เตือนกบเข้า LINE ให้มาช่วย
    await notifyAdminRejectionStreak(client, uid, attempt, reasonKind);
    return sendNonScanReply({
      client,
      userId: uid,
      replyToken,
      replyType: "reject_escalation",
      semanticKey: "reject_escalation",
      text: ESCALATION_TEXT,
    });
  }
  const smart =
    routing.kind === "unsupported_object"
      ? null
      : await generateSmartRejectionText({
          reasonKind,
          attempt,
          gateMeta: gated?.gateMeta || null,
        });

  if (routing.kind === "multiple_objects") {
    const c = getMultipleObjectsReplyCandidates();
    return sendNonScanReply({
      client,
      userId: uid,
      replyToken,
      replyType: "multiple_objects",
      semanticKey: "multiple_objects",
      text: smart || c[0],
      alternateTexts: smart ? c : c.slice(1),
    });
  }

  if (routing.kind === "image_retake_required") {
    const c = getImageRetakeRequiredReplyCandidates();
    const convSurface =
      env.CONV_AI_ENABLED
        ? {
            userId: uid,
            legacyReplyType: "image_retake_required",
            deterministicPrimary: c[0],
            deterministicAlternates: c.slice(1),
            tierString: "short",
            lastUserText,
            objectGateAllowedFacts: buildImageRetakeRequiredAllowedFacts(),
          }
        : undefined;
    return sendNonScanReplyWithOptionalConvSurface({
      client,
      userId: uid,
      replyToken,
      replyType: "image_retake_required",
      semanticKey: "image_retake_required",
      text: smart || c[0],
      alternateTexts: smart ? c : c.slice(1),
      convSurface: smart ? undefined : convSurface,
    });
  }

  if (routing.kind === "object_inconclusive") {
    const c = getObjectInconclusiveReplyCandidates();
    const convSurface =
      env.CONV_AI_ENABLED
        ? {
            userId: uid,
            legacyReplyType: "object_inconclusive",
            deterministicPrimary: c[0],
            deterministicAlternates: c.slice(1),
            tierString: "short",
            lastUserText,
            objectGateAllowedFacts: buildObjectInconclusiveAllowedFacts(),
          }
        : undefined;
    return sendNonScanReplyWithOptionalConvSurface({
      client,
      userId: uid,
      replyToken,
      replyType: "object_inconclusive",
      semanticKey: "object_inconclusive",
      text: smart || c[0],
      alternateTexts: smart ? c : c.slice(1),
      convSurface: smart ? undefined : convSurface,
    });
  }

  if (routing.kind === "unsupported_object") {
    return sendUnsupportedObjectRejectionViaGateway({
      client,
      userId,
      replyToken,
      flowVersion,
      messageId,
      objectCheckResult: "unsupported",
      replyType: "unsupported_object",
    });
  }

  const c = getObjectInconclusiveReplyCandidates();
  return sendNonScanReply({
    client,
    userId: uid,
    replyToken,
    replyType: "object_inconclusive",
    semanticKey: "object_inconclusive",
    text: c[0],
    alternateTexts: c.slice(1),
  });
}
