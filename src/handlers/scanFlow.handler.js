import {
  setBirthdate,
  clearSessionIfFlowVersionMatches,
} from "../stores/session.store.js";
import { saveBirthdate } from "../stores/userProfile.db.js";

import { runDeepScan } from "../services/scan.service.js";
import { replyText, replyFlex } from "../services/lineReply.service.js";
import { buildScanFlex } from "../services/flex/flex.service.js";

import {
  buildUnsupportedObjectFlex,
  buildMultipleObjectsFlex,
  buildUnclearImageFlex,
  buildRateLimitFlex,
  buildCooldownFlex,
  buildPaymentRequiredFlex,
  buildPaymentPaywallFlex,
} from "../services/flex/status.flex.js";

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
  buildMultipleObjectsText,
  buildUnclearImageText,
  buildUnsupportedObjectText,
  buildRateLimitText,
  buildCooldownText,
  buildPaymentRequiredText,
} from "../utils/webhookText.util.js";

import { ensureUserByLineUserId } from "../stores/users.db.js";
import {
  createScanRequest,
  updateScanRequestStatus,
} from "../stores/scanRequests.db.js";
import { createScanResult } from "../stores/scanResults.db.js";
import { createPaymentPending } from "../stores/payments.db.js";

export async function replyFlexWithFallback({
  client,
  replyToken,
  flex,
  fallbackText,
  logLabel = "status flex",
}) {
  try {
    await replyFlex(client, replyToken, flex);
    console.log(`[WEBHOOK] ${logLabel} sent as flex`);
  } catch (error) {
    console.error(`[WEBHOOK] ${logLabel} failed:`, error);
    await replyText(client, replyToken, fallbackText);
    console.log(`[WEBHOOK] ${logLabel} fallback sent as text`);
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

export async function replyScanResult({ client, replyToken, resultText }) {
  try {
    const flex = buildScanFlex(resultText);
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
    await replyFlexWithFallback({
      client,
      replyToken,
      flex: buildRateLimitFlex(rate.retryAfterSec),
      fallbackText: buildRateLimitText(rate.retryAfterSec),
      logLabel: "rate limit flex",
    });
    clearSessionIfFlowVersionMatches(userId, flowVersion);
    return;
  }

  const cooldown = getCooldownStatus(userId);

  if (!cooldown.allowed) {
    await replyFlexWithFallback({
      client,
      replyToken,
      flex: buildCooldownFlex(cooldown.remainingSec),
      fallbackText: buildCooldownText(cooldown.remainingSec),
      logLabel: "cooldown flex",
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
      const reply = buildPaymentGateReply({ decision: access });

      if (access?.reason === "payment_required") {
        try {
          const MVP_PRICE_THB = 99;
          const MVP_CURRENCY = "THB";

          const appUser = await ensureUserByLineUserId(userId);
          const paymentId = await createPaymentPending({
            appUserId: appUser.id,
            amount: MVP_PRICE_THB,
            currency: MVP_CURRENCY,
          });

          const paymentUrl = `https://ener-scan-production.up.railway.app/payments/mock/${paymentId}`;

          const paywallFlex = buildPaymentPaywallFlex({
            usedScans: access?.usedScans,
            freeLimit: access?.freeScansLimit,
            paymentUrl,
            priceTHB: MVP_PRICE_THB,
          });

          await replyFlexWithFallback({
            client,
            replyToken,
            flex: paywallFlex,
            fallbackText: reply.fallbackText || buildPaymentRequiredText(),
            logLabel: "payment required flex",
          });
        } catch (err) {
          await replyFlexWithFallback({
            client,
            replyToken,
            flex: reply.flex || buildPaymentRequiredFlex(),
            fallbackText: reply.fallbackText || buildPaymentRequiredText(),
            logLabel: "payment required flex",
          });
        }
      } else {
        await replyFlexWithFallback({
          client,
          replyToken,
          flex: reply.flex || buildPaymentRequiredFlex(),
          fallbackText: reply.fallbackText || buildPaymentRequiredText(),
          logLabel: "payment required flex",
        });
      }

      clearSessionIfFlowVersionMatches(userId, flowVersion);
      return;
    }

    if (access?.allowed === true && access?.reason === "paid") {
      const scanCount = getUserScanCountLast24h(userId);

      if (scanCount >= 30) {
        console.log("[PAID_LIMIT]", { userId, scanCount });

        const fallbackText =
          "คุณใช้สิทธิ์ครบแล้วในช่วง 24 ชั่วโมงนี้\nปลดล็อกรอบใหม่เพื่อใช้งานต่อได้ทันที";

        try {
          const MVP_PRICE_THB = 99;
          const MVP_CURRENCY = "THB";

          const appUser = await ensureUserByLineUserId(userId);
          const paymentId = await createPaymentPending({
            appUserId: appUser.id,
            amount: MVP_PRICE_THB,
            currency: MVP_CURRENCY,
          });

          const paymentUrl = `https://ener-scan-production.up.railway.app/payments/mock/${paymentId}`;

          const paywallFlex = buildPaymentPaywallFlex({
            usedScans: access?.usedScans,
            freeLimit: access?.freeScansLimit,
            paymentUrl,
            priceTHB: MVP_PRICE_THB,
          });

          await replyFlexWithFallback({
            client,
            replyToken,
            flex: paywallFlex,
            fallbackText,
            logLabel: "payment required flex",
          });
        } catch (err) {
          await replyText(client, replyToken, fallbackText);
        }
        return;
      }

      const remaining = 30 - scanCount;
      if (remaining === 3 || remaining === 2 || remaining === 1) {
        console.log("[PAID_LIMIT_WARNING]", { userId, scanCount, remaining });

        paidLimitWarningText =
          remaining === 3
            ? "หมายเหตุ: คุณเหลือสิทธิ์สแกนอีก 3 ครั้งในรอบ 24 ชั่วโมงนี้"
            : remaining === 2
              ? "หมายเหตุ: คุณเหลือสิทธิ์สแกนอีก 2 ครั้งในรอบ 24 ชั่วโมงนี้"
              : "หมายเหตุ: คุณเหลือสิทธิ์สแกนอีก 1 ครั้งในรอบ 24 ชั่วโมงนี้";
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

    await replyText(
      client,
      replyToken,
      "ขออภัยครับ ระบบตรวจสอบสิทธิ์ใช้งานขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้งครับ"
    );

    clearSessionIfFlowVersionMatches(userId, flowVersion);
    return;
  }

  const scanJobId = startScanJob(userId);

  let scanRequestId = null;
  let appUserId = null;

  // Create scan_requests row (write-path only, keep flow resilient)
  try {
    const appUser = await ensureUserByLineUserId(userId);
    appUserId = appUser.id;

    scanRequestId = await createScanRequest({
      appUserId: appUser.id,
      flowVersion,
      scanJobId,
      birthdateUsed: birthdate,
      // TODO: wire usedSavedBirthdate flag from caller when available
      usedSavedBirthdate: false,
      requestSource: "line",
    });
  } catch (error) {
    console.error("[WEBHOOK] createScanRequest failed but continue scan:", {
      lineUserId: userId,
      flowVersion,
      scanJobId,
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
    });
  }

  setBirthdate(userId, birthdate, flowVersion);

  if (!imageBuffer || !imageBuffer.length) {
    console.error("[WEBHOOK] missing imageBuffer before scan", {
      userId,
      flowVersion,
      scanJobId,
    });

    await replyText(
      client,
      replyToken,
      "ขออภัยครับ ไม่พบรูปสำหรับการสแกน กรุณาส่งรูปใหม่อีกครั้งได้เลยครับ"
    );

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

    resultText = await runDeepScan({
      imageBuffer,
      birthdate,
      userId,
    });

    const scanFinishedAt = Date.now();
    console.log("[WEBHOOK] runScanFlow result ready", {
      userId,
      scanJobId,
      flowVersion,
      resultLength: resultText?.length || 0,
      finishedAt: scanFinishedAt,
      elapsedMs: scanFinishedAt - scanStartedAt,
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
      await replyFlexWithFallback({
        client,
        replyToken,
        flex: buildMultipleObjectsFlex(),
        fallbackText: buildMultipleObjectsText(),
        logLabel: "multiple objects flex",
      });
      clearSessionIfFlowVersionMatches(userId, flowVersion);
      return;
    }

    if (err.message === "image_unclear") {
      await replyFlexWithFallback({
        client,
        replyToken,
        flex: buildUnclearImageFlex(),
        fallbackText: buildUnclearImageText(),
        logLabel: "unclear image flex",
      });
      clearSessionIfFlowVersionMatches(userId, flowVersion);
      return;
    }

    if (err.message === "unsupported_object_type") {
      await replyFlexWithFallback({
        client,
        replyToken,
        flex: buildUnsupportedObjectFlex(),
        fallbackText: buildUnsupportedObjectText(),
        logLabel: "unsupported object flex",
      });
      clearSessionIfFlowVersionMatches(userId, flowVersion);
      return;
    }

    await replyText(
      client,
      replyToken,
      "ขออภัยครับ ระบบวิเคราะห์ยังไม่สำเร็จ ลองส่งรูปใหม่อีกครั้งได้เลยครับ"
    );

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

  // 1) Legacy history table (keyed by line_user_id) - non-blocking for billing
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

  // 2) New normalized scan_results table (source of truth for used scans)
  if (scanRequestId && appUserId) {
    try {
      const scanFinishedAt = Date.now();
      const responseTimeMs = scanFinishedAt - scanStartedAt;

      const scanResultId = await createScanResult({
        scanRequestId,
        appUserId,
        resultText,
        resultSummary: null,
        energyScore: parsed.energyScore,
        mainEnergy: parsed.mainEnergy,
        compatibility: parsed.compatibility,
        modelName: "gpt-4.1-mini",
        promptVersion: "v1",
        responseTimeMs,
      });

      // Paid quota enforcement (consume 1 remaining scan after DB insert succeeds)
      if (scanResultId && accessSource === "paid") {
        await decrementUserPaidRemainingScans(appUserId);
      }
    } catch (scanResultError) {
      console.error(
        "[BILLING_INCIDENT] createScanResult failed but user will be replied",
        {
          scanRequestId,
          appUserId,
          message: scanResultError?.message,
          code: scanResultError?.code,
          details: scanResultError?.details,
          hint: scanResultError?.hint,
        }
      );
    }
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
    resultText: replyResultText,
  });

  clearLatestScanJob(userId, scanJobId);
  clearSessionIfFlowVersionMatches(userId, flowVersion);
}