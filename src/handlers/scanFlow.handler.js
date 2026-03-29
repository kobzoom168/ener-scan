import {
  setBirthdate,
  clearSessionIfFlowVersionMatches,
} from "../stores/session.store.js";
import { saveBirthdate } from "../stores/userProfile.db.js";

import { runDeepScan } from "../services/scan.service.js";
import { replyText } from "../services/lineReply.service.js";
import {
  AuditExemptReason,
  auditExemptEnter,
  auditExemptExit,
  scanPathEnter,
  scanPathExit,
} from "../services/lineReplyAudit.context.js";
import {
  sendNonScanReply,
  sendNonScanSequenceReply,
} from "../services/nonScanReply.gateway.js";
import { buildScanResultFlexWithFallback } from "../services/flex/scanFlexReply.builder.js";
import { buildReportPayloadFromScan } from "../services/reports/reportPayload.builder.js";
import { buildPublicReportUrl } from "../services/reports/reportLink.service.js";
import { generatePublicToken } from "../utils/reports/reportToken.util.js";
import { insertScanPublicReport } from "../stores/scanPublicReports.db.js";
import { uploadScanObjectImageForReport } from "../services/storage/scanObjectImage.storage.js";


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
import { clearPaymentState } from "../stores/manualPaymentAccess.store.js";

import {
  buildPaymentRequiredText,
  buildSingleOfferPaywallAltText,
} from "../utils/webhookText.util.js";
import { paywallMessageSequence } from "../utils/replyCopy.util.js";

import { ensureUserByLineUserId } from "../stores/users.db.js";
import {
  createScanRequest,
  updateScanRequestStatus,
} from "../stores/scanRequests.db.js";
import {
  createScanResult,
  deleteScanResultForAppUser,
} from "../stores/scanResults.db.js";
import { deleteScanPublicReportsForScanResult } from "../stores/scanPublicReports.db.js";
import { loadActiveScanOffer } from "../services/scanOffer.loader.js";

import { logPaywallShown, logEvent } from "../utils/personaAnalytics.util.js";
import { env } from "../config/env.js";
import {
  REPORT_ROLLOUT_SCHEMA_VERSION,
  getRolloutExecutionContext,
  deriveFlexPresentationMode,
  deriveReportLinkPlacement,
  flexRolloutBucket0to99,
  isSummaryFirstFlexSelectedForUser,
  logScanResultFlexRollout,
  logScanResultTextFallback,
  safeLineUserIdPrefix,
  safeTokenPrefix,
} from "../utils/reports/reportRolloutTelemetry.util.js";
import { getAssignedPersonaVariant } from "../utils/personaVariant.util.js";
import {
  sendScanResultPushWith429Retry,
  sendScanResultReplyWith429Retry,
} from "../utils/linePush429Retry.util.js";

async function sendPaymentGateTextReply({ client, replyToken, userId, reply }) {
  const fallbackText =
    reply?.fallbackText ||
    (await buildPaymentRequiredText({ userId, decision: reply?.decision }));

  if (!userId) {
    auditExemptEnter(AuditExemptReason.SCAN_PAYMENT_GATE_NO_USER_ID);
    try {
      await replyText(client, replyToken, fallbackText);
    } finally {
      auditExemptExit();
    }
    return;
  }

  if (reply?.scanOffer) {
    const gateResult = await sendNonScanReply({
      client,
      userId,
      replyToken,
      replyType: reply.scanOffer.replyType,
      semanticKey: reply.scanOffer.semanticKey,
      text: reply.scanOffer.primaryText,
      alternateTexts: reply.scanOffer.alternateTexts,
      scanOfferMeta: reply.scanOffer.scanOfferMeta,
    });
    if (
      reply.scanOffer.replyType === "free_quota_exhausted" &&
      gateResult?.sent
    ) {
      console.log(
        JSON.stringify({
          event: "FREE_QUOTA_EXHAUSTED_REPLY_ROUTED",
          lineUserId: userId,
          replyType: reply.scanOffer.replyType,
          semanticKey: reply.scanOffer.semanticKey,
        }),
      );
    }
    await logPaywallShown(userId, {
      source: "scan_offer_copy",
      patternUsed: reply.scanOffer.replyType,
      bubbleCount: 1,
    });
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
  userId,
  replyToken = null,
  resultText,
  birthdate = null,
  reportUrl = null,
  reportPayload = null,
  scanAccessSource = null,
}) {
  const lineUserIdPrefix = safeLineUserIdPrefix(userId);
  const rolloutBucket = flexRolloutBucket0to99(userId);
  const summaryFirstSelected = isSummaryFirstFlexSelectedForUser(
    userId,
    env.FLEX_SCAN_SUMMARY_FIRST,
    env.FLEX_SCAN_SUMMARY_FIRST_ROLLOUT_PCT,
  );
  let summaryFirstBuildFailed = false;

  scanPathEnter();
  try {
    /** @type {Record<string, unknown>|null} */
    let flex = null;
    let flexBuildException = false;

    try {
      const built = buildScanResultFlexWithFallback({
        summaryFirstEnabled: summaryFirstSelected,
        resultText,
        birthdate,
        reportUrl,
        reportPayload,
        appendReportBubble: env.FLEX_SUMMARY_APPEND_REPORT_BUBBLE,
      });
      flex = built.flex;
      summaryFirstBuildFailed = built.summaryFirstBuildFailed;
      if (summaryFirstBuildFailed && built.error) {
        console.error(
          JSON.stringify({
            event: "FLEX_SUMMARY_FIRST_FAIL",
            outcome: "fallback_legacy",
            schemaVersion: REPORT_ROLLOUT_SCHEMA_VERSION,
            lineUserIdPrefix,
            message: built.error?.message,
            flexScanSummaryFirstRolloutPct: env.FLEX_SCAN_SUMMARY_FIRST_ROLLOUT_PCT,
            flexScanSummaryFirstSelected: summaryFirstSelected,
            flexRolloutBucket0to99: rolloutBucket,
          }),
        );
      }
    } catch (buildErr) {
      flex = null;
      flexBuildException = true;
      summaryFirstBuildFailed = true;
      const buildMsg =
        buildErr && typeof buildErr === "object" && "message" in buildErr
          ? String(/** @type {{ message?: unknown }} */ (buildErr).message)
          : String(buildErr);
      console.error(
        JSON.stringify({
          event: "SCAN_RESULT_FLEX_BUILD_FAILED",
          lineUserIdPrefix,
          message: buildMsg,
        }),
      );
    }

    const scanResultBubbleCount =
      flex?.contents?.type === "carousel" &&
      Array.isArray(flex.contents.contents)
        ? flex.contents.contents.length
        : flex?.contents?.type === "bubble"
          ? 1
          : 0;

    const totalCarouselBubbles =
      flex?.contents?.type === "carousel" &&
      Array.isArray(flex.contents.contents)
        ? flex.contents.contents.length
        : scanResultBubbleCount;

    const settingsBubbleAppended = false;

    const flexPresentationMode = deriveFlexPresentationMode({
      flexSummaryFirstEnabled: summaryFirstSelected,
      summaryFirstBuildFailed,
      appendReportBubble: env.FLEX_SUMMARY_APPEND_REPORT_BUBBLE,
    });

    const hasReportLink = Boolean(String(reportUrl || "").trim());
    const reportLinkPlacement = deriveReportLinkPlacement(
      flexPresentationMode,
      hasReportLink,
    );
    const hasObjectImage = Boolean(
      String(reportPayload?.object?.objectImageUrl || "").trim(),
    );

    const rolloutMeta = {
      flexPresentationMode,
      totalCarouselBubbles,
      scanResultBubbleCount,
      hasReportLink,
      reportLinkPlacement,
      hasObjectImage,
      flexBuildException,
    };

    const rt = String(replyToken || "").trim();
    const delivery = rt
      ? await sendScanResultReplyWith429Retry({
          client,
          replyToken: rt,
          userId,
          flexMessage: flex,
          text: resultText,
          logPrefix: "[SCAN_RESULT_LINE_REPLY]",
        })
      : await sendScanResultPushWith429Retry({
          client,
          userId,
          flexMessage: flex,
          text: resultText,
          logPrefix: "[SCAN_RESULT_LINE_PUSH]",
        });

    if (delivery.sent) {
      console.log("[WEBHOOK] scan result delivered", {
        method: delivery.method,
        attempts: delivery.attempts,
      });
      if (delivery.method === "reply_flex" || delivery.method === "push_flex") {
        logScanResultFlexRollout({
          lineUserIdPrefix,
          flexPresentationMode,
          scanResultBubbleCount,
          totalCarouselBubbles,
          settingsBubbleAppended,
          hasReportLink,
          reportLinkPlacement,
          hasObjectImage,
          scanAccessSource,
          summaryFirstBuildFailed,
          envFlexScanSummaryFirst: env.FLEX_SCAN_SUMMARY_FIRST,
          envFlexSummaryAppendReportBubble: env.FLEX_SUMMARY_APPEND_REPORT_BUBBLE,
          flexScanSummaryFirstRolloutPct: env.FLEX_SCAN_SUMMARY_FIRST_ROLLOUT_PCT,
          flexScanSummaryFirstSelected: summaryFirstSelected,
          flexRolloutBucket0to99: rolloutBucket,
        });
      } else {
        logScanResultTextFallback({
          lineUserIdPrefix,
          envFlexScanSummaryFirst: env.FLEX_SCAN_SUMMARY_FIRST,
          envFlexSummaryAppendReportBubble: env.FLEX_SUMMARY_APPEND_REPORT_BUBBLE,
          flexScanSummaryFirstRolloutPct: env.FLEX_SCAN_SUMMARY_FIRST_ROLLOUT_PCT,
          flexScanSummaryFirstSelected: summaryFirstSelected,
          flexRolloutBucket0to99: rolloutBucket,
        });
      }
    } else {
      console.error(
        JSON.stringify({
          event: "SCAN_RESULT_DELIVERY_FAILED",
          lineUserIdPrefix,
          ...delivery,
          scanAccessSource,
          flexPresentationMode,
        }),
      );
    }

    return { ...rolloutMeta, delivery };
  } finally {
    scanPathExit();
  }
}

/**
 * Flow-level detection for OpenAI rate limits (SDK / wrapper shapes differ).
 * @param {unknown} err
 * @returns {boolean}
 */
function isOpenAi429Error(err) {
  if (!err || typeof err !== "object") return false;
  const o = /** @type {{ status?: number; response?: { status?: number }; message?: string }} */ (
    err
  );
  if (o.status === 429) return true;
  if (o.response?.status === 429) return true;
  const msg = o.message ?? "";
  if (typeof msg === "string") {
    if (msg.includes("429")) return true;
    if (msg.includes("rate limit")) return true;
    if (msg.toLowerCase().includes("rate_limit")) return true;
  }
  return false;
}

export async function runScanFlow({
  client,
  replyToken,
  userId,
  imageBuffer,
  birthdate,
  flowVersion,
  skipBirthdateSave = false,
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
      freeUsedToday: access?.usedScans ?? 0,
      freeUsedTodayForGate: access?.usedScans ?? 0,
    });

    accessSource = access?.reason || null;

    if (!access.allowed) {
      const reply = await buildPaymentGateReply({ decision: access, userId });
      await sendPaymentGateTextReply({
        client,
        replyToken,
        userId,
        reply,
      });
      clearSessionIfFlowVersionMatches(userId, flowVersion);
      return;
    }

    if (access?.allowed === true && access?.reason === "paid") {
      const scanCount = getUserScanCountLast24h(userId);

      if (scanCount >= 30) {
        console.log("[PAID_LIMIT]", { userId, scanCount });

        const pkgHint = buildSingleOfferPaywallAltText(loadActiveScanOffer());
        await sendNonScanReply({
          client,
          userId,
          replyToken,
          replyType: "paid_scan_burst_cap",
          semanticKey: "paid_scan_burst_cap",
          text: `ช่วงนี้สแกนถี่ไปหน่อย เว้นระยะสักครู่นะครับ\n\nถ้าอยากเปิดสิทธิ์ใหม่เมื่อพร้อม\n\n${pkgHint}`,
          alternateTexts: [pkgHint],
        });
        await logPaywallShown(userId, {
          patternUsed: "paid_burst_package_hint",
          bubbleCount: 1,
          source: "paid_scan_burst_cap",
        });
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

  if (skipBirthdateSave) {
    console.log("[WEBHOOK] saveBirthdate skipped (already saved)", {
      userId,
      flowVersion,
      scanJobId,
    });
  } else {
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
  }

  let resultText = "";
  let scanFromCache = false;
  /** @type {object | null} */
  let scanQualityAnalytics = null;
  const scanStartedAt = Date.now();

  console.log("[WEBHOOK] runScanFlow start", {
    userId,
    scanJobId,
    flowVersion,
    birthdate,
    imageBufferLength: imageBuffer?.length || 0,
    startedAt: scanStartedAt,
    hasReplyTokenForScanResult: Boolean(String(replyToken || "").trim()),
  });

  try {
    let scanOut;
    try {
      scanOut = await runDeepScan({
        imageBuffer,
        birthdate,
        userId,
      });
    } catch (err) {
      console.log("[SCAN_FLOW] runDeepScan error details:", {
        message: err?.message,
        status: err?.status,
        responseStatus: err?.response?.status,
        code: err?.code,
        name: err?.name,
      });
      if (!isOpenAi429Error(err)) throw err;
      console.log("[SCAN_FLOW] 429 from OpenAI, waiting 15s before retry");
      await new Promise((r) => setTimeout(r, 15_000));
      scanOut = await runDeepScan({
        imageBuffer,
        birthdate,
        userId,
      });
    }
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

  /** Set when scan_results row + scan_public_reports insert succeed. */
  let reportUrl = null;
  /** Set when public report row is inserted; used for summary-first Flex (Phase 2.3). */
  let reportPayloadForReply = null;

  // scan_results + paid decrement — row exists for report FK; free tier rolled back if LINE delivery fails
  let scanResultId = /** @type {string | null} */ (null);
  try {
    const scanFinishedAt = Date.now();
    const responseTimeMs = scanFromCache
      ? 0
      : scanFinishedAt - scanStartedAt;

    scanResultId = await createScanResult({
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

    /** Public HTML report (optional — failure does not block scan success). */
    try {
      const publicToken = generatePublicToken();
      let objectImageUrl = "";
      try {
        const uploaded = await uploadScanObjectImageForReport({
          buffer: imageBuffer,
          publicToken,
          lineUserId: userId,
        });
        objectImageUrl = uploaded ? String(uploaded).trim() : "";
      } catch (imgErr) {
        console.error(
          JSON.stringify({
            event: "SCAN_OBJECT_IMAGE",
            outcome: "upload_exception_ignored",
            message: imgErr?.message,
          }),
        );
      }
      const reportPayload = buildReportPayloadFromScan({
        resultText,
        scanResultId,
        scanRequestId,
        lineUserId: userId,
        birthdateUsed: birthdate,
        publicToken,
        modelLabel: scanFromCache ? "persistent_cache" : "gpt-4.1-mini",
        objectImageUrl,
      });
      await insertScanPublicReport({
        scanResultId,
        publicToken,
        reportPayload,
        reportVersion: reportPayload.reportVersion,
      });
      reportPayloadForReply = reportPayload;
      reportUrl = buildPublicReportUrl(publicToken);
      console.log(
        JSON.stringify({
          event: "REPORT_PUBLIC_OK",
          schemaVersion: REPORT_ROLLOUT_SCHEMA_VERSION,
          ...getRolloutExecutionContext(),
          lineUserIdPrefix: safeLineUserIdPrefix(userId),
          scanResultIdPrefix: String(scanResultId || "").slice(0, 8),
          tokenPrefix: String(publicToken || "").slice(0, 12),
          publicTokenPrefix8: safeTokenPrefix(publicToken, 8),
          hasObjectImage: Boolean(String(objectImageUrl || "").trim()),
          hasReportLink: true,
          flexSummaryFirstEnv: env.FLEX_SCAN_SUMMARY_FIRST,
          flexScanSummaryFirstRolloutPct: env.FLEX_SCAN_SUMMARY_FIRST_ROLLOUT_PCT,
          flexScanSummaryFirstSelected: isSummaryFirstFlexSelectedForUser(
            userId,
            env.FLEX_SCAN_SUMMARY_FIRST,
            env.FLEX_SCAN_SUMMARY_FIRST_ROLLOUT_PCT,
          ),
          flexRolloutBucket0to99: flexRolloutBucket0to99(userId),
          flexSummaryAppendReportBubbleEnv: env.FLEX_SUMMARY_APPEND_REPORT_BUBBLE,
        }),
      );
    } catch (reportErr) {
      console.error(
        JSON.stringify({
          event: "REPORT_PUBLIC_FAIL",
          schemaVersion: REPORT_ROLLOUT_SCHEMA_VERSION,
          outcome: "persist_ignored",
          ...getRolloutExecutionContext(),
          lineUserIdPrefix: safeLineUserIdPrefix(userId),
          scanResultIdPrefix: String(scanResultId || "").slice(0, 8),
          message: reportErr?.message,
          code: reportErr?.code,
        }),
      );
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

  if (!isCurrentFlowVersion(userId, flowVersion)) {
    console.log("[WEBHOOK] skip stale reply before LINE delivery", {
      userId,
      flowVersion,
    });
    clearLatestScanJob(userId, scanJobId);
    return;
  }

  const replyResultText = paidLimitWarningText
    ? `${resultText}\n\n${paidLimitWarningText}`
    : resultText;

  const flexRollout = await replyScanResult({
    client,
    userId,
    replyToken,
    resultText: replyResultText,
    birthdate,
    reportUrl,
    reportPayload: reportPayloadForReply,
    scanAccessSource: accessSource,
  });

  const delivered = Boolean(flexRollout?.delivery?.sent);

  if (!delivered && accessSource === "free" && scanResultId && appUserId) {
    console.error(
      JSON.stringify({
        event: "SCAN_FREE_DELIVERY_FAILED_ROLLBACK",
        userId,
        scanJobId,
        scanResultIdPrefix: String(scanResultId).slice(0, 8),
        delivery: flexRollout?.delivery ?? null,
      }),
    );
    await deleteScanPublicReportsForScanResult(scanResultId);
    await deleteScanResultForAppUser(scanResultId, appUserId);
    try {
      await updateScanRequestStatus(scanRequestId, "failed");
    } catch (updateErr) {
      console.error(
        JSON.stringify({
          event: "SCAN_ROLLBACK_UPDATE_REQUEST_FAILED",
          scanRequestId,
          message: updateErr?.message,
        }),
      );
    }
    clearLatestScanJob(userId, scanJobId);
    clearSessionIfFlowVersionMatches(userId, flowVersion);
    console.log(
      JSON.stringify({
        event: "SCAN_FLOW_COMPLETE",
        userId,
        scanJobId,
        resultPersisted: false,
        resultDelivered: false,
        freeEntitlementRollback: true,
        delivery: flexRollout?.delivery ?? null,
      }),
    );
    return;
  }

  // Legacy history + in-memory stats only after successful LINE delivery (or paid path with persisted result)
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

  if (accessSource === "free") {
    const d = flexRollout?.delivery;
    const scanDeliveryMode = !d?.sent
      ? "delivery_failed"
      : d.method === "push_flex"
        ? "flex"
        : "text_fallback";
    logEvent("preview_shown", {
      userId,
      personaVariant: await getAssignedPersonaVariant(userId),
      patternUsed: "scan_result_flex",
      scanDeliveryMode,
      resultDelivered: Boolean(d?.sent),
      scanResultDeliveryAttempts: d?.attempts ?? 0,
      scanResultDeliveryIs429: Boolean(d?.is429),
      bubbleCount: flexRollout?.totalCarouselBubbles ?? 0,
      flexPresentationMode: flexRollout?.flexPresentationMode ?? "unknown",
      flexMode:
        flexRollout?.flexPresentationMode === "legacy" ||
        flexRollout?.flexPresentationMode === "summary_first_fallback_legacy"
          ? "legacy"
          : flexRollout?.flexPresentationMode
            ? "summary_first"
            : "unknown",
      hasReportLink: flexRollout?.hasReportLink ?? false,
      reportLinkPlacement: flexRollout?.reportLinkPlacement ?? "none",
      hasObjectImage: flexRollout?.hasObjectImage ?? false,
    });
  }

  console.log(
    JSON.stringify({
      event: "SCAN_FLOW_COMPLETE",
      userId,
      scanJobId,
      resultPersisted: true,
      resultDelivered: delivered,
      deliveryMethod: flexRollout?.delivery?.method ?? null,
      deliveryAttempts: flexRollout?.delivery?.attempts ?? 0,
    }),
  );

  clearLatestScanJob(userId, scanJobId);
  clearPaymentState(userId);
  clearSessionIfFlowVersionMatches(userId, flowVersion);
}