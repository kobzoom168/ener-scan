/**
 * Free daily quota exhausted → deterministic paywall via {@link sendNonScanReply}.
 * Must not be gated on Phase-1 Gemini `handled` before send (silent drop regression).
 *
 * @module freeQuotaPaywallReply.service
 */

import { env } from "../../config/env.js";
import { loadActiveScanOffer } from "../scanOffer.loader.js";
import { getDefaultPackage } from "../scanOffer.packages.js";
import { sendNonScanReply } from "../nonScanReply.gateway.js";
import { lineStickerPaymentSupportMessage } from "../../utils/lineStickerMessage.util.js";
import { ensureReferralForLineUser } from "../referral.service.js";
import { buildReferralPaywallPromoBlock } from "./referralCommand.service.js";
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
  let primary = buildDeterministicFreeQuotaExhaustedPaywallText(offer, {
    lineUserId: uid,
  });
  const primaryFirstLine = primary.split("\n")[0] || "";
  let alternates = getDeterministicFreeQuotaExhaustedPaywallAlternateTexts(offer, {
    lineUserId: uid,
    primaryFirstLine,
  });

  // Share-to-earn: at the limit moment, offer free scans via invites instead of
  // (or before) paying. Best-effort + behind ENABLE_REFERRAL → never blocks the paywall.
  let referralPromoAppended = false;
  if (env.ENABLE_REFERRAL && uid) {
    try {
      const { code } = await ensureReferralForLineUser(uid);
      if (code) {
        const promo = `\n\n${buildReferralPaywallPromoBlock(code)}`;
        primary += promo;
        alternates = alternates.map((t) => `${t}${promo}`);
        referralPromoAppended = true;
      }
    } catch (referralErr) {
      console.warn(
        JSON.stringify({
          event: "PAYWALL_REFERRAL_PROMO_SKIP",
          userId: uid,
          message: referralErr?.message,
        }),
      );
    }
  }

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
      referralPromoAppended,
    }),
  );

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
    trailingStickerMessage: lineStickerPaymentSupportMessage(),
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
