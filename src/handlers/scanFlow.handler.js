import {
  setBirthdate,
  clearSessionIfFlowVersionMatches,
} from "../stores/session.store.js";
import { saveBirthdate } from "../stores/userProfile.db.js";

import { runDeepScan } from "../services/scan.service.js";
import { replyText, replyFlex, replyPaymentInstructions } from "../services/lineReply.service.js";
import { pushText } from "../services/lineSequenceReply.service.js";
import {
  sendNonScanReply,
  sendNonScanSequenceReply,
} from "../services/nonScanReply.gateway.js";
import { buildScanFlex } from "../services/flex/flex.service.js";

import { buildBirthdateSettingsBubble } from "../services/flex/status.flex.js";

import { checkScanRateLimit } from "../stores/rateLimit.store.js";
import {
  getCooldownStatus,
  setCooldownNow,
} from "../stores/cooldown.store.js";

import { addScanHistory } from "../stores/scanHistory.store.js";
import { getUserScanCountLast24h } from "../stores/scanHistory.store.js";
import { updateUserStats } from "../stores/userStats.store.js";

import { parseScanResultForHistory } from "../services/history/history.parser.js";

import {
  checkScanAccess,
  buildPaymentGateReply,
} from "../services/paymentAccess.service.js";

import { addScanHistory as addScanHistoryDb } from "../stores/scanHistory.db.js";
import { decrementUserPaidRemainingScans } from "../stores/paymentAccess.db.js";

import {
  startScanJob,
  isLatestScanJob,
  clearLatestScanJob,
  getLatestScanJobId,
  isCurrentFlowVersion,
} from "../stores/runtime.store.js";

import {
  buildPaymentRequiredText,
  buildPaymentQrIntroText,
  buildPaymentQrSlipText,
  buildPaymentInstructionText,
} from "../utils/webhookText.util.js";
import { paywallMessageSequence } from "../utils/replyCopy.util.js";
import {
  getPromptPayQrPublicUrl,
  isPromptPayQrUrlHttpsForLine,
} from "../utils/promptpayQrPublicUrl.util.js";

import { ensureUserByLineUserId } from "../stores/users.db.js";
import {
  createScanRequest,
  updateScanRequestStatus,
} from "../stores/scanRequests.db.js";
import { createScanResult } from "../stores/scanResults.db.js";
import { createPaymentPending } from "../stores/payments.db.js";
import { getSavedBirthdate } from "../stores/userProfile.db.js";
import { randomBetween, sleep } from "../utils/timing.util.js";

import { logPaywallShown, logEvent } from "../utils/personaAnalytics.util.js";
import { getAssignedPersonaVariant } from "../utils/personaVariant.util.js";

const PRE_SCAN_ACK_VARIANTS = [
  ["ได้รูปแล้วนะ", "รอแป๊บนึง เดี๋ยวผมกำลังอ่านให้"],
  ["รับภาพแล้ว", "เดี๋ยวผมดูให้ ขอเวลาแป๊บเดียว"],
  ["โอเค ได้แล้ว", "รอสักครู่ เดี๋ยวผมอ่านให้ต่อ"],
];

async function sendPreScanAcknowledgement({ client, userId }) {
  const uid = String(userId || "").trim();
  if (!uid) return;
  const chosen =
    PRE_SCAN_ACK_VARIANTS[
      Math.floor(Math.random() * PRE_SCAN_ACK_VARIANTS.length)
    ] || PRE_SCAN_ACK_VARIANTS[0];
  const first = String(chosen?.[0] || "").trim();
  const second = String(chosen?.[1] || "").trim();
  if (!first || !second) return;

  // Keep scan execution non-blocking: send first now, queue second shortly after.
  await pushText(client, uid, first);
  void (async () => {
    try {
      await sleep(randomBetween(400, 800));
      await pushText(client, uid, second);
    } catch (err) {
      console.error("[PRE_SCAN_ACK] push second failed (ignored):", {
        userId: uid,
        message: err?.message,
      });
    }
  })();
}

async function sendPaymentGateTextReply({ client, replyToken, userId, reply }) {
  const fallbackText =
    reply?.fallbackText || (await buildPaymentRequiredText({ userId }));

  if (!userId) {
    await replyText(client, replyToken, fallbackText);
    return;
  }

  const msgs = await paywallMessageSequence(userId);
  if (msgs.length > 1) {
    await sendNonScanSequenceReply({
      client,
      userId,
      replyToken,
      replyType: "payment_gate_persona_sequence",
      semanticKey: "payment_gate_sequence",
      messages: msgs,
    });
  } else if (msgs.length === 1) {
    await sendNonScanReply({
      client,
      userId,
      replyToken,
      replyType: "payment_gate_persona_single",
      semanticKey: "payment_gate_sequence",
      text: msgs[0],
      alternateTexts: [fallbackText],
    });
  } else {
    await sendNonScanReply({
      client,
      userId,
      replyToken,
      replyType: "payment_gate_fallback",
      semanticKey: "payment_gate_fallback",
      text: fallbackText,
      alternateTexts: [],
    });
  }
}

async function replyPaymentQrTripleOrFallback({
  client,
  replyToken,
  userId = null,
  amountForFallback = 99,
  paymentRef = null,
  paymentId = null,
}) {
  const qrUrl = getPromptPayQrPublicUrl();
  if (isPromptPayQrUrlHttpsForLine(qrUrl)) {
    await replyPaymentInstructions(client, replyToken, {
      introText: buildPaymentQrIntroText({ paymentRef }),
      qrImageUrl: qrUrl,
      slipText: buildPaymentQrSlipText(),
    });
    if (userId) {
      await logPaywallShown(userId, {
        patternUsed: "qr_intro_image_slip",
        bubbleCount: 3,
        source: "scan_flow_qr",
        ...(paymentId ? { paymentId } : {}),
      });
    }
  } else {
    const payBody = buildPaymentInstructionText({
      amount: amountForFallback,
      paymentRef,
    });
    await sendNonScanReply({
      client,
      userId,
      replyToken,
      replyType: "payment_instruction_text_fallback",
      semanticKey: "payment_qr_text_fallback_scan_flow",
      text: payBody,
      alternateTexts: [
        `${payBody}\n\nส่งสลิปมาในแชทนี้ได้เลยครับ`,
      ],
    });
    if (userId) {
      await logPaywallShown(userId, {
        patternUsed: "qr_text_fallback",
        bubbleCount: 1,
        source: "scan_flow_qr_text_fallback",
        ...(paymentId ? { paymentId } : {}),
      });
    }
  }
}

export function saveScanArtifacts(userId, resultText) {
  const parsed = parseScanResultForHistory(resultText);

  const scanItem = {
    time: Date.now(),
    result: resultText,
    energyScore: parsed.energyScore,
    mainEnergy: parsed.mainEnergy,
    compatibility: parsed.compatibility,
  };

  addScanHistory(userId, scanItem);
  updateUserStats(userId, scanItem);

  console.log("[WEBHOOK] history saved");
  console.log("[WEBHOOK] stats updated");
}

export async function replyScanResult({
  client,
  replyToken,
  userId,
  resultText,
  birthdate = null,
}) {
  try {
    const flex = buildScanFlex(resultText, { birthdate });

    // Append settings bubble at the end of the scan result.
    try {
      const savedBirthdate = await getSavedBirthdate(userId);
      const settingsBubble = buildBirthdateSettingsBubble({
        birthdate: savedBirthdate,
      });

      if (flex?.contents?.type === "carousel" && Array.isArray(flex.contents.contents)) {
        flex.contents.contents.push(settingsBubble);
      } else if (flex?.contents?.type === "bubble") {
        flex.contents = {
          type: "carousel",
          contents: [flex.contents, settingsBubble],
        };
      }
    } catch (bubbleErr) {
      console.error("[BIRTHDATE_UPDATE] settings bubble build failed (ignored):", {
        userId,
        message: bubbleErr?.message,
      });
    }

    await replyFlex(client, replyToken, flex);
    console.log("[WEBHOOK] replied with flex");
  } catch (flexError) {
    console.error("[WEBHOOK] flex reply failed:", flexError);
    await replyText(client, replyToken, resultText);
    console.log("[WEBHOOK] fallback replied with text");
  }
}

export async function runScanFlow({
  client,
  replyToken,
  userId,
  imageBuffer,
  birthdate,
  flowVersion,
}) {
  console.log("[TRACE] runScanFlow entry", {
    userId,
    flowVersion,
    hasReplyToken: Boolean(replyToken),
    hasImageBuffer: Boolean(imageBuffer?.length),
    birthdate,
  });

  let paidLimitWarningText = null;

  const rate = checkScanRateLimit(userId);

  if (!rate.allowed) {
    const rl = getRateLimitReplyCandidates(rate.retryAfterSec);
    await sendNonScanReply({
      client,
      userId,
      replyToken,
      replyType: "rate_limit",
      semanticKey: "rate_limit",
      text: rl[0],
      alternateTexts: rl.slice(1),
    });
    clearSessionIfFlowVersionMatches(userId, flowVersion);
    return;
  }

  const cooldown = getCooldownStatus(userId);

  if (!cooldown.allowed) {
    const cd = getCooldownReplyCandidates(cooldown.remainingSec);
    await sendNonScanReply({
      client,
      userId,
      replyToken,
      replyType: "cooldown",
      semanticKey: "scan_cooldown",
      text: cd[0],
      alternateTexts: cd.slice(1),
    });
    clearSessionIfFlowVersionMatches(userId, flowVersion);
    return;
  }

  // payment gate (after rate limit + cooldown)
  let accessSource = null; // "paid" | "free" | null
  try {
    const access = await checkScanAccess({ userId });

    console.log("[SCAN_ACCESS]", {
      userId,
      allowed: access?.allowed,
      reason: access?.reason,
    });

    accessSource = access?.reason || null;

    if (!access.allowed) {
      const reply = await buildPaymentGateReply({ decision: access, userId });

      if (access?.reason === "payment_required") {
        try {
          const MVP_PRICE_THB = 99;
          const MVP_CURRENCY = "THB";

          const appUser = await ensureUserByLineUserId(userId);
          const { paymentRef, paymentId } = await createPaymentPending({
            appUserId: appUser.id,
            amount: MVP_PRICE_THB,
            currency: MVP_CURRENCY,
          });

          await replyPaymentQrTripleOrFallback({
            client,
            replyToken,
            userId,
            amountForFallback: MVP_PRICE_THB,
            paymentRef,
            paymentId,
          });
        } catch (err) {
          await sendPaymentGateTextReply({
            client,
            replyToken,
            userId,
            reply,
          });
        }
      } else {
        await sendPaymentGateTextReply({
          client,
          replyToken,
          userId,
          reply,
        });
      }

      clearSessionIfFlowVersionMatches(userId, flowVersion);
      return;
    }

    if (access?.allowed === true && access?.reason === "paid") {
      const scanCount = getUserScanCountLast24h(userId);

      if (scanCount >= 30) {
        console.log("[PAID_LIMIT]", { userId, scanCount });

        try {
          const MVP_PRICE_THB = 99;
          const MVP_CURRENCY = "THB";

          const appUser = await ensureUserByLineUserId(userId);
          const { paymentRef, paymentId } = await createPaymentPending({
            appUserId: appUser.id,
            amount: MVP_PRICE_THB,
            currency: MVP_CURRENCY,
          });

          await replyPaymentQrTripleOrFallback({
            client,
            replyToken,
            userId,
            amountForFallback: MVP_PRICE_THB,
            paymentRef,
            paymentId,
          });
        } catch (err) {
          const payLim = buildPaymentInstructionText({
            amount: 99,
            currency: "THB",
          });
          await sendNonScanReply({
            client,
            userId,
            replyToken,
            replyType: "payment_instruction_paid_limit",
            semanticKey: "payment_qr_text_fallback_paid_limit",
            text: payLim,
            alternateTexts: [
              `${payLim}\n\nส่งสลิปมาในแชทนี้ได้เลยครับ`,
            ],
          });
          await logPaywallShown(userId, {
            patternUsed: "qr_text_fallback",
            bubbleCount: 1,
            source: "scan_flow_paid_limit_catch",
          });
        }
        return;
      }

      const remainingPaid = Number(access.remaining);
      if (
        Number.isFinite(remainingPaid) &&
        remainingPaid >= 1 &&
        remainingPaid <= 3
      ) {
        console.log("[PAID_LIMIT_WARNING]", {
          userId,
          scanCount,
          remainingPaid,
        });

        paidLimitWarningText =
          remainingPaid === 3
            ? "หมายเหตุ: เหลือสิทธิ์สแกนตามแพ็กเกจอีก 3 ครั้ง (ในรอบ 24 ชม.)"
            : remainingPaid === 2
              ? "หมายเหตุ: เหลือสิทธิ์สแกนตามแพ็กเกจอีก 2 ครั้ง (ในรอบ 24 ชม.)"
              : "หมายเหตุ: เหลือสิทธิ์สแกนตามแพ็กเกจอีก 1 ครั้ง (ในรอบ 24 ชม.)";
      }
    }
  } catch (error) {
    console.error("[PAYMENT_DEBUG] runScanFlow payment gate catch", {
      userId,
      errorMessage: error?.message,
      errorCode: error?.code,
      details: error?.details,
      hint: error?.hint,
    });
    console.error("[WEBHOOK] payment gate failed:", {
      userId,
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
    });

    await sendNonScanReply({
      client,
      userId,
      replyToken,
      replyType: "payment_gate_error",
      semanticKey: "scan_access_error",
      text: "ขออภัยครับ ตรวจสิทธิ์ไม่สำเร็จชั่วคราว ลองใหม่อีกครั้งได้เลยครับ",
      alternateTexts: [
        "ตรวจสิทธิ์ไม่สำเร็จชั่วคราว ลองส่งรูปใหม่อีกครั้งได้เลยครับ",
      ],
    });

    clearSessionIfFlowVersionMatches(userId, flowVersion);
    return;
  }

  const scanJobId = startScanJob(userId);

  let scanRequestId = null;
  let appUserId = null;

  // scan_requests row is required before scan (billing / scan_results source of truth)
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const appUser = await ensureUserByLineUserId(userId);
      appUserId = appUser.id;

      scanRequestId = await createScanRequest({
        appUserId: appUser.id,
        flowVersion,
        scanJobId,
        birthdateUsed: birthdate,
        usedSavedBirthdate: false,
        requestSource: "line",
      });
      break;
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "SCAN_REQUEST_FAILED",
          outcome: attempt < 2 ? "retry" : "final",
          attempt,
          lineUserId: userId,
          flowVersion,
          scanJobId,
          message: error?.message,
          code: error?.code,
        })
      );
      if (attempt >= 2) {
        console.error(
          JSON.stringify({
            event: "BILLING_PATH",
            outcome: "blocked_no_scan_request",
            lineUserId: userId,
            flowVersion,
            scanJobId,
            appUserId: appUserId || null,
          })
        );
        clearLatestScanJob(userId, scanJobId);
        await sendNonScanReply({
          client,
          userId,
          replyToken,
          replyType: "scan_request_failed",
          semanticKey: "scan_prepare_failed",
          text: "ขออภัยครับ เตรียมการสแกนไม่สำเร็จ ลองส่งรูปใหม่อีกครั้งในอีกสักครู่นะครับ",
          alternateTexts: [
            "เตรียมการสแกนไม่สำเร็จชั่วคราว ลองส่งรูปใหม่ได้เลยครับ",
          ],
        });
        clearSessionIfFlowVersionMatches(userId, flowVersion);
        return;
      }
    }
  }

  if (!scanRequestId || !appUserId) {
    console.error(
      JSON.stringify({
        event: "BILLING_PATH",
        outcome: "blocked_missing_ids",
        lineUserId: userId,
        scanJobId,
      })
    );
    clearLatestScanJob(userId, scanJobId);
    await sendNonScanReply({
      client,
      userId,
      replyToken,
      replyType: "scan_request_missing_ids",
      semanticKey: "scan_prepare_failed",
      text: "ขออภัยครับ เตรียมการสแกนไม่สำเร็จ ลองส่งรูปใหม่อีกครั้งได้เลยครับ",
      alternateTexts: [
        "เตรียมการสแกนไม่สำเร็จ ลองส่งรูปใหม่ได้เลยครับ",
      ],
    });
    clearSessionIfFlowVersionMatches(userId, flowVersion);
    return;
  }

  setBirthdate(userId, birthdate, flowVersion);

  if (!imageBuffer || !imageBuffer.length) {
    console.error("[WEBHOOK] missing imageBuffer before scan", {
      userId,
      flowVersion,
      scanJobId,
    });

    await sendNonScanReply({
      client,
      userId,
      replyToken,
      replyType: "missing_image_buffer",
      semanticKey: "missing_scan_image",
      text: "ขออภัยครับ ไม่พบรูปสำหรับการสแกน กรุณาส่งรูปใหม่อีกครั้งได้เลยครับ",
      alternateTexts: [
        "ไม่พบรูปสำหรับสแกน ลองส่งรูปใหม่ได้เลยครับ",
      ],
    });

    clearLatestScanJob(userId, scanJobId);
    clearSessionIfFlowVersionMatches(userId, flowVersion);
    return;
  }

  try {
    console.log("[WEBHOOK] saveBirthdate payload:", {
      userId,
      birthdate,
      flowVersion,
      scanJobId,
    });

    await saveBirthdate(userId, birthdate);

    console.log("[WEBHOOK] saveBirthdate success:", {
      userId,
      birthdate,
      flowVersion,
      scanJobId,
    });
  } catch (error) {
    console.error("[WEBHOOK] saveBirthdate failed but continue scan:", {
      userId,
      birthdate,
      flowVersion,
      scanJobId,
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
    });
  }

  let resultText = "";
  let scanFromCache = false;
  /** @type {object | null} */
  let scanQualityAnalytics = null;
  const scanStartedAt = Date.now();

  try {
    console.log("[WEBHOOK] runScanFlow start", {
      userId,
      scanJobId,
      flowVersion,
      birthdate,
      imageBufferLength: imageBuffer?.length || 0,
      startedAt: scanStartedAt,
    });

    await sendPreScanAcknowledgement({ client, userId });

    const scanOut = await runDeepScan({
      imageBuffer,
      birthdate,
      userId,
    });
    resultText = scanOut.resultText;
    scanFromCache = Boolean(scanOut.fromCache);
    scanQualityAnalytics = scanOut.qualityAnalytics ?? null;

    const scanFinishedAt = Date.now();
    console.log("[WEBHOOK] runScanFlow result ready", {
      userId,
      scanJobId,
      flowVersion,
      resultLength: resultText?.length || 0,
      finishedAt: scanFinishedAt,
      elapsedMs: scanFinishedAt - scanStartedAt,
      fromCache: scanFromCache,
    });
  } catch (err) {
    console.error("[WEBHOOK] scan failed:", err?.message || err);

    if (scanRequestId) {
      try {
        await updateScanRequestStatus(scanRequestId, "failed");
      } catch (updateError) {
        console.error(
          "[WEBHOOK] updateScanRequestStatus(failed) error (ignored):",
          {
            scanRequestId,
            message: updateError?.message,
            code: updateError?.code,
            details: updateError?.details,
            hint: updateError?.hint,
          }
        );
      }
    }
    clearLatestScanJob(userId, scanJobId);

    if (err.message === "multiple_objects_detected") {
      const c = getMultipleObjectsReplyCandidates();
      await sendNonScanReply({
        client,
        userId,
        replyToken,
        replyType: "multiple_objects_scan",
        semanticKey: "multiple_objects",
        text: c[0],
        alternateTexts: c.slice(1),
      });
      clearSessionIfFlowVersionMatches(userId, flowVersion);
      return;
    }

    if (err.message === "image_unclear") {
      const c = getUnclearImageReplyCandidates();
      await sendNonScanReply({
        client,
        userId,
        replyToken,
        replyType: "unclear_image_scan",
        semanticKey: "unclear_image",
        text: c[0],
        alternateTexts: c.slice(1),
      });
      clearSessionIfFlowVersionMatches(userId, flowVersion);
      return;
    }

    if (err.message === "unsupported_object_type") {
      const c = getUnsupportedObjectReplyCandidates();
      await sendNonScanReply({
        client,
        userId,
        replyToken,
        replyType: "unsupported_object_scan",
        semanticKey: "unsupported_object",
        text: c[0],
        alternateTexts: c.slice(1),
      });
      clearSessionIfFlowVersionMatches(userId, flowVersion);
      return;
    }

    await sendNonScanReply({
      client,
      userId,
      replyToken,
      replyType: "scan_failed_generic",
      semanticKey: "scan_pipeline_error",
      text: "ขออภัยครับ วิเคราะห์ยังไม่สำเร็จ ลองส่งรูปใหม่อีกครั้งได้เลยครับ",
      alternateTexts: [
        "วิเคราะห์ไม่สำเร็จชั่วคราว ลองส่งรูปใหม่ได้เลยครับ",
      ],
    });

    clearSessionIfFlowVersionMatches(userId, flowVersion);
    return;
  }

  if (!isCurrentFlowVersion(userId, flowVersion)) {
    console.log("[WEBHOOK] skip stale scan result by flowVersion", {
      userId,
      flowVersion,
    });
    clearLatestScanJob(userId, scanJobId);
    return;
  }

  if (!isLatestScanJob(userId, scanJobId)) {
    console.log("[WEBHOOK] skip stale scan result by scanJob", {
      userId,
      scanJobId,
      latestScanJobId: getLatestScanJobId(userId),
    });
    return;
  }

  // persist scan result to DB
  const parsedFallback = {
    energyScore: null,
    mainEnergy: null,
    compatibility: null,
  };

  let parsed = parsedFallback;
  try {
  const parsedResult = parseScanResultForHistory(resultText);
  parsed = parsedResult || parsedFallback;
  } catch (error) {
    console.warn(
      "[SCAN_PARSE] parseScanResultForHistory failed, fallback to null fields",
      {
        userId,
        flowVersion,
        scanJobId,
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
      }
    );
  }

  // scan_results + paid decrement (source of truth) — must succeed before user sees success
  try {
    const scanFinishedAt = Date.now();
    const responseTimeMs = scanFromCache
      ? 0
      : scanFinishedAt - scanStartedAt;

    const scanResultId = await createScanResult({
      scanRequestId,
      appUserId,
      resultText,
      resultSummary: null,
      energyScore: parsed.energyScore,
      mainEnergy: parsed.mainEnergy,
      compatibility: parsed.compatibility,
      modelName: scanFromCache ? "persistent_cache" : "gpt-4.1-mini",
      promptVersion: scanFromCache ? "cache_v1" : "v1",
      responseTimeMs,
      fromCache: scanFromCache,
      qualityAnalytics: scanQualityAnalytics,
    });

    if (!scanResultId) {
      throw new Error("scan_result_insert_empty");
    }

    if (accessSource === "paid") {
      await decrementUserPaidRemainingScans(appUserId);
    }
  } catch (billingErr) {
    console.error(
      JSON.stringify({
        event: "BILLING_PATH",
        outcome: "create_scan_result_or_decrement_failed",
        lineUserId: userId,
        appUserId,
        scanRequestId,
        accessSource,
        message: billingErr?.message,
        code: billingErr?.code,
      })
    );
    try {
      await updateScanRequestStatus(scanRequestId, "failed");
    } catch (_) {
      /* ignore */
    }
    clearLatestScanJob(userId, scanJobId);
    await sendNonScanReply({
      client,
      userId,
      replyToken,
      replyType: "scan_billing_failed",
      semanticKey: "scan_result_persist_failed",
      text: "ขออภัยครับ บันทึกผลไม่สำเร็จ ลองส่งรูปใหม่อีกครั้งได้เลยครับ",
      alternateTexts: [
        "บันทึกผลไม่สำเร็จชั่วคราว ลองส่งรูปใหม่ได้เลยครับ",
      ],
    });
    clearSessionIfFlowVersionMatches(userId, flowVersion);
    return;
  }

  // Legacy history table (keyed by line_user_id) - after billing success
  try {
    await addScanHistoryDb(userId, {
      time: Date.now(),
      result: resultText,
      energyScore: parsed.energyScore,
      mainEnergy: parsed.mainEnergy,
      compatibility: parsed.compatibility,
    });
  } catch (error) {
    console.error(
      "[LEGACY_HISTORY] addScanHistoryDb failed (ignored for billing, user will still be replied)",
      {
        userId,
        flowVersion,
        scanJobId,
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
      }
    );
  }

  if (scanRequestId) {
    try {
      await updateScanRequestStatus(scanRequestId, "completed");
    } catch (updateError) {
      console.error(
        "[WEBHOOK] updateScanRequestStatus(completed) error (ignored):",
        {
          scanRequestId,
          message: updateError?.message,
          code: updateError?.code,
          details: updateError?.details,
          hint: updateError?.hint,
        }
      );
    }
  }

  saveScanArtifacts(userId, resultText);
  setCooldownNow(userId);

  if (!isCurrentFlowVersion(userId, flowVersion)) {
    console.log("[WEBHOOK] skip stale reply after save", {
      userId,
      flowVersion,
    });
    clearLatestScanJob(userId, scanJobId);
    return;
  }

  const replyResultText = paidLimitWarningText
    ? `${resultText}\n\n${paidLimitWarningText}`
    : resultText;

  await replyScanResult({
    client,
    replyToken,
    userId,
    resultText: replyResultText,
    birthdate,
  });

  if (accessSource === "free") {
    logEvent("preview_shown", {
      userId,
      personaVariant: await getAssignedPersonaVariant(userId),
      patternUsed: "scan_result_flex",
      bubbleCount: 1,
    });
  }

  clearLatestScanJob(userId, scanJobId);
  clearSessionIfFlowVersionMatches(userId, flowVersion);
}