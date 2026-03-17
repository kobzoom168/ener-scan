import {
  setBirthdate,
  clearSession,
} from "../stores/session.store.js";

import {
  saveBirthdate,
} from "../stores/userProfile.store.js";

import { runDeepScan } from "../services/scan.service.js";
import { replyText, replyFlex } from "../services/lineReply.service.js";
import { buildScanFlex } from "../services/flex/flex.service.js";

import {
  buildUnsupportedObjectFlex,
  buildMultipleObjectsFlex,
  buildUnclearImageFlex,
  buildRateLimitFlex,
  buildCooldownFlex,
} from "../services/flex/status.flex.js";

import { checkScanRateLimit } from "../stores/rateLimit.store.js";
import {
  getCooldownStatus,
  setCooldownNow,
} from "../stores/cooldown.store.js";

import { addScanHistory } from "../stores/scanHistory.store.js";
import { updateUserStats } from "../stores/userStats.store.js";

import { parseScanResultForHistory } from "../services/history/history.parser.js";

import {
  startScanJob,
  isLatestScanJob,
  clearLatestScanJob,
  getLatestScanJobId,
} from "../stores/runtime.store.js";

import {
  buildMultipleObjectsText,
  buildUnclearImageText,
  buildUnsupportedObjectText,
  buildRateLimitText,
  buildCooldownText,
} from "../utils/webhookText.util.js";

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
}) {
  const rate = checkScanRateLimit(userId);

  if (!rate.allowed) {
    await replyFlexWithFallback({
      client,
      replyToken,
      flex: buildRateLimitFlex(rate.retryAfterSec),
      fallbackText: buildRateLimitText(rate.retryAfterSec),
      logLabel: "rate limit flex",
    });
    clearSession(userId);
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
    clearSession(userId);
    return;
  }

  const scanJobId = startScanJob(userId);

  setBirthdate(userId, birthdate);
  saveBirthdate(userId, birthdate);

  let resultText = "";

  try {
    console.log("[WEBHOOK] runScanFlow start", {
      userId,
      scanJobId,
      birthdate,
      imageBufferLength: imageBuffer?.length || 0,
      startedAt: Date.now(),
    });

    resultText = await runDeepScan({
      imageBuffer,
      birthdate,
      userId,
    });

    console.log("[WEBHOOK] runScanFlow result ready", {
      userId,
      scanJobId,
      resultLength: resultText?.length || 0,
      finishedAt: Date.now(),
    });
  } catch (err) {
    console.error("[WEBHOOK] scan failed:", err?.message || err);
    clearLatestScanJob(userId, scanJobId);

    if (err.message === "multiple_objects_detected") {
      await replyFlexWithFallback({
        client,
        replyToken,
        flex: buildMultipleObjectsFlex(),
        fallbackText: buildMultipleObjectsText(),
        logLabel: "multiple objects flex",
      });
      clearSession(userId);
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
      clearSession(userId);
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
      clearSession(userId);
      return;
    }

    clearSession(userId);
    throw err;
  }

  if (!isLatestScanJob(userId, scanJobId)) {
    console.log("[WEBHOOK] skip stale scan result", {
      userId,
      scanJobId,
      latestScanJobId: getLatestScanJobId(userId),
    });
    clearSession(userId);
    return;
  }

  saveScanArtifacts(userId, resultText);
  setCooldownNow(userId);

  await replyScanResult({
    client,
    replyToken,
    resultText,
  });

  clearLatestScanJob(userId, scanJobId);
  clearSession(userId);
}