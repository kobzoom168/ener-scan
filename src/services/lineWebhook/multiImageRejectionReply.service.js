/**
 * Deterministic multi-image rejection: always notify via non-scan gateway (reply or push).
 * Phase-1 Gemini must not short-circuit this path — users were getting silent drops.
 *
 * @module multiImageRejectionReply.service
 */

import { sendNonScanReply } from "../nonScanReply.gateway.js";
import { getMultiImageInRequestReplyCandidates } from "../../utils/webhookText.util.js";
import { incrementCounterWithTtl, tryDedupeOnce } from "../../redis/scanV2Redis.js";
import { getStaticVoiceNote } from "../voiceNote/scanVoiceNote.service.js";

/** ครั้งที่ 2+ ภายใน 6 ชม. → เตือนดุแบบอาจารย์ (ไม่มีไหว้ ไม่มีรบกวน). */
const STERN_MULTI_IMAGE_TEXT = [
  "อาจารย์บอกแล้วนะ ให้ส่งทีละ 1 รูป",
  "ส่งพร้อมกันหลายรูปแบบนี้อาจารย์ไม่ดูให้ รอผลชิ้นแรกเสร็จก่อน แล้วค่อยส่งชิ้นถัดไปทีละรูป",
].join("\n");

export const MULTI_IMAGE_STRIKE_KEY_PREFIX = "scan_v2:multi_img_strikes:";

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
  let strikes = 1;
  try {
    strikes = await incrementCounterWithTtl(`${MULTI_IMAGE_STRIKE_KEY_PREFIX}${uid}`, 21600);
  } catch {
    strikes = 1;
  }
  // เตือนเป็นเสียงอาจารย์แทนข้อความ (static cached — เจนครั้งเดียวใช้ซ้ำทุกคน)
  // dedupe 120 วิกันสแปมเสียง; เสียงพัง/ปิดใช้ → ถอยไปข้อความตาม gateway เดิม
  try {
    const v = await getStaticVoiceNote(strikes >= 2 ? "multi_image_stern" : "multi_image");
    if (v?.url && v.durationMs >= 500) {
      const firstVoice = await tryDedupeOnce(`scan_v2:multi_img_voice:${uid}`, 120);
      if (!firstVoice) {
        console.log(
          JSON.stringify({ event: "MULTI_IMAGE_VOICE_SUPPRESSED", userId: uid, reason }),
        );
        return { sent: false, suppressed: true };
      }
      const audio = {
        type: "audio",
        originalContentUrl: v.url,
        duration: Math.min(v.durationMs, 60000),
      };
      const rt = String(replyToken || "").trim();
      if (rt) {
        await client.replyMessage(rt, audio);
      } else {
        await client.pushMessage(uid, audio);
      }
      console.log(
        JSON.stringify({
          event: "MULTI_IMAGE_VOICE_SENT",
          userId: uid,
          stern: strikes >= 2,
          reason,
        }),
      );
      return { sent: true, suppressed: false };
    }
  } catch (voiceErr) {
    console.warn(
      JSON.stringify({
        event: "MULTI_IMAGE_VOICE_FALLBACK_TEXT",
        userId: uid,
        message: String(voiceErr?.message || voiceErr).slice(0, 160),
      }),
    );
  }

  const candidates =
    strikes >= 2
      ? [STERN_MULTI_IMAGE_TEXT, "ทีละ 1 รูปนะ บอกครั้งสุดท้าย รอผลชิ้นแรกก่อนแล้วค่อยส่งต่อ"]
      : getMultiImageInRequestReplyCandidates();

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
