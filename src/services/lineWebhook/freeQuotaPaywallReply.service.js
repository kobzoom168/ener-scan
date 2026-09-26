/**
 * Free daily quota exhausted → deterministic paywall via {@link sendNonScanReply}.
 * Must not be gated on Phase-1 Gemini `handled` before send (silent drop regression).
 *
 * @module freeQuotaPaywallReply.service
 */

import { loadActiveScanOffer } from "../scanOffer.loader.js";
import { getDefaultPackage } from "../scanOffer.packages.js";
import { sendNonScanReply } from "../nonScanReply.gateway.js";
import { lineStickerPaymentSupportMessage } from "../../utils/lineStickerMessage.util.js";
import { buildFreeQuotaPaywallFlex } from "../flex/paywallOffer.flex.js";
import { resolveEntitlementState, buildPaywallCopy, packageButton, HISTORY_COMMAND_TEXT } from "../entitlementCopy.service.js";
import { referralEnabled } from "../referral/referral.service.js";
import {
  buildDeterministicFreeQuotaExhaustedPaywallText,
  getDeterministicFreeQuotaExhaustedPaywallAlternateTexts,
} from "../../utils/webhookText.util.js";

/**
 * @param {object} opts
 * @param {*} opts.client
 * @param {string} opts.userId
 * @param {string} [opts.replyToken]
 * @param {number|null} [opts.flowVersion]
 * @param {string|null} [opts.messageId]
 * @param {object} opts.accessDecision — {@link checkScanAccess} result
 * @param {"access_gate"|"pre_object_check"|"post_object_check"} [opts.pathSegment]
 * @param {{ log: (event: string, extra?: object) => void }} [opts.turnPerf]
 * @returns {Promise<{ sent: boolean, suppressed: boolean, exactDuplicate?: boolean, semanticDuplicate?: boolean }>}
 */
export async function sendFreeQuotaExhaustedPaywallViaGateway({
  client,
  userId,
  replyToken = "",
  flowVersion = null,
  messageId = null,
  accessDecision,
  pathSegment = "access_gate",
  turnPerf = undefined,
}) {
  const uid = String(userId || "").trim();
  const offer = loadActiveScanOffer();
  const pkg = getDefaultPackage(offer);
  // สถานะสิทธิ์เดียวกับ LIFF (entitlementCopy) — โหมด daily คงข้อความเดิม · โหมดอื่นห้ามพูดฟรีรายวัน/พรุ่งนี้
  const es = resolveEntitlementState(accessDecision);
  const copy = buildPaywallCopy(es, { offer });
  const isDaily = es.state === "daily_exhausted";
  const primary = isDaily
    ? buildDeterministicFreeQuotaExhaustedPaywallText(offer, { lineUserId: uid })
    : copy.textLines.join("\n");
  const primaryFirstLine = primary.split("\n")[0] || "";
  const alternates = isDaily ? getDeterministicFreeQuotaExhaustedPaywallAlternateTexts(offer, {
    lineUserId: uid,
    primaryFirstLine,
  }) : [];

  const replyType = "free_quota_exhausted_deterministic";
  const semanticKey = `scan_offer:${replyType}:v${offer.configVersion}`;

  const scanOfferMeta = {
    replyType,
    semanticKey,
    alternateCount: alternates.length,
    offerConfigVersion: offer.configVersion,
    paidPriceThb: pkg?.priceThb ?? offer.paidPriceThb,
    paidScanCount: pkg?.scanCount ?? offer.paidScanCount,
    paidWindowHours: pkg?.windowHours ?? offer.paidWindowHours,
  };

  console.log(
    JSON.stringify({
      event: "FREE_QUOTA_EXHAUSTED_REPLY_ROUTED",
      userId: uid,
      flowVersion,
      messageId,
      pathSegment,
      accessReason: accessDecision?.reason ?? null,
      freeUsedToday: accessDecision?.usedScans ?? null,
      replyType,
      semanticKey,
    }),
  );

  // ปุ่ม: เลือกแพ็ก (ข้อความที่ส่งยังเป็น "จ่าย N" ตาม routing เดิม) · ดูคลังของฉัน (ไม่ต้องซื้อ)
  // · ชวนเพื่อน เฉพาะเมื่อแคมเปญเปิดจริง · ไว้ก่อน
  const activePayPkgs = copy.packages;
  const pkgItems =
    activePayPkgs.length > 1
      ? activePayPkgs.slice(0, 3).map((p) => ({ type: "action", action: { type: "message", ...packageButton(p) } }))
      : [{ type: "action", action: { type: "message", label: copy.ctaPrimaryLabel, text: "จ่าย" } }];
  const payQuickReply = {
    items: [
      ...pkgItems,
      { type: "action", action: { type: "message", label: copy.ctaSecondary.label, text: HISTORY_COMMAND_TEXT } },
      ...(referralEnabled()
        ? [{ type: "action", action: { type: "message", label: "ชวนเพื่อน รับโบนัส", text: "ชวนเพื่อน" } }]
        : []),
      { type: "action", action: { type: "message", label: "ไว้ก่อน", text: "ไว้ก่อน" } },
    ],
  };

  // การ์ด Flex โปรทั้งร้าน — หัว/บรรทัดรองมาจากสถานะสิทธิ์ (ไม่ใช่ข้อความ daily ตายตัว)
  const paywallFlex = es.state === "unavailable" ? null : buildFreeQuotaPaywallFlex(offer, {
    title: copy.title,
    subtitle: copy.subtitle,
    altText: (isDaily ? primary : copy.altText).slice(0, 400),
    secondaryAction: { label: copy.ctaSecondary.label, text: HISTORY_COMMAND_TEXT },
  });

  const res = await sendNonScanReply({
    client,
    userId: uid,
    replyToken,
    replyType,
    semanticKey,
    text: primary,
    alternateTexts: alternates,
    scanOfferMeta,
    turnPerf,
    trailingStickerMessage: paywallFlex ? null : lineStickerPaymentSupportMessage(),
    quickReply: payQuickReply,
    flexMessage: paywallFlex,
  });

  if (res.suppressed) {
    console.log(
      JSON.stringify({
        event: "FREE_QUOTA_EXHAUSTED_REPLY_SUPPRESSED",
        userId: uid,
        flowVersion,
        messageId,
        pathSegment,
        exactDuplicate: Boolean(res.exactDuplicate),
        semanticDuplicate: Boolean(res.semanticDuplicate),
        replyType,
      }),
    );
  } else if (res.sent) {
    console.log(
      JSON.stringify({
        event: "FREE_QUOTA_EXHAUSTED_REPLY_SENT",
        userId: uid,
        flowVersion,
        messageId,
        pathSegment,
        replyType,
      }),
    );
  }

  return res;
}
