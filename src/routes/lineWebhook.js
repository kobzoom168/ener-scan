import line from "@line/bot-sdk";

import {
  getSession,
  setPendingImage,
  clearSession,
  clearSessionIfFlowVersionMatches,
} from "../stores/session.store.js";

import { getSavedBirthdate } from "../stores/userProfile.db.js";

import {
  getEventTimestamp,
  isUserProcessingImage,
  setUserProcessingImage,
  clearUserProcessingImage,
  isInImageBurstWindow,
  markAcceptedImageEvent,
  clearLatestScanJob,
  bumpUserFlowVersion,
  blockUserForRequest,
  isUserBlockedForRequest,
  cleanupExpiredRequestBlocks,
  getPendingImageCandidate,
  clearPendingImageCandidate,
  clearExpiredImageCandidates,
  hasPendingImageCandidate,
  registerImageCandidateEvent,
  isCandidateWindowActive,
} from "../stores/runtime.store.js";

import { getScanHistory } from "../stores/scanHistory.store.js";
import { getUserStats } from "../stores/userStats.store.js";

import { getImageBufferFromLineMessage } from "../services/image.service.js";
import { isDuplicateImage } from "../services/dedupe.service.js";
import { checkSingleObject } from "../services/objectCheck.service.js";

import { env } from "../config/env.js";
import { ensureUserByLineUserId, touchUserLastActive } from "../stores/users.db.js";
import { createPaymentPending } from "../stores/payments.db.js";

import { replyText } from "../services/lineReply.service.js";
import { buildStartInstructionFlex } from "../services/flex/startInstruction.flex.js";
import {
  buildUnsupportedObjectFlex,
  buildIdleFlex,
  buildDuplicateImageFlex,
  buildMultipleObjectsFlex,
  buildUnclearImageFlex,
} from "../services/flex/status.flex.js";

import {
  isValidBirthdate,
  normalizeBirthdateForScan,
  toBase64,
  formatHistory,
  formatBangkokDateTime,
  buildStartInstructionText,
  buildMultiImageInRequestText,
  buildMultipleObjectsText,
  buildUnclearImageText,
  buildUnsupportedObjectText,
  buildDuplicateImageText,
  buildNoHistoryText,
  buildNoStatsText,
  buildIdleText,
  buildInvalidBirthdateText,
  buildSystemErrorText,
  isPaymentCommand,
  buildPaymentInstructionText,
  buildManualPaymentRequestText,
  buildSlipReceivedText,
  buildAwaitingSlipReminderText,
  isHistoryCommand,
  isStatsCommand,
  groupImageEventCountByUser,
} from "../utils/webhookText.util.js";

import {
  getPaymentState,
  setAwaitingPayment,
  unlockPaymentAccess,
} from "../stores/manualPaymentAccess.store.js";
import { checkScanAccess } from "../services/paymentAccess.service.js";

import {
  replyFlexWithFallback,
  runScanFlow,
} from "../handlers/scanFlow.handler.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function handleHistoryCommand({ client, replyToken, userId }) {
  const history = getScanHistory(userId);

  if (!history.length) {
    await replyText(client, replyToken, buildNoHistoryText());
    return;
  }

  const formatted = formatHistory(history);
  await replyText(
    client,
    replyToken,
    `📜 ประวัติการสแกนล่าสุด\n\n${formatted}`
  );
}

async function handleStatsCommand({ client, replyToken, userId }) {
  const stats = getUserStats(userId);

  if (!stats) {
    await replyText(client, replyToken, buildNoStatsText());
    return;
  }

  const last = stats.lastScanAt ? formatBangkokDateTime(stats.lastScanAt) : "-";

  await replyText(
    client,
    replyToken,
    [
      "📊 สถิติการสแกนของคุณ",
      "",
      `สแกนทั้งหมด: ${stats.totalScans} ครั้ง`,
      `พลังที่พบบ่อย: ${stats.topEnergy}`,
      `คะแนนเฉลี่ย: ${stats.avgScore} / 10`,
      `สแกนล่าสุด: ${last}`,
    ].join("\n")
  );
}

async function finalizeAcceptedImage({
  client,
  event,
  userId,
  flowVersion,
  eventTimestamp,
  imageBuffer,
}) {
  console.log("[WEBHOOK] finalize accepted image", {
    userId,
    flowVersion,
    eventTimestamp,
    imageBufferLength: imageBuffer?.length || 0,
  });

  // MVP manual payment: any image counts as slip while awaiting (no object/OCR checks).
  const slipState = getPaymentState(userId);
  if (slipState.state === "awaiting_slip") {
    unlockPaymentAccess(userId);
    markAcceptedImageEvent(userId, eventTimestamp);
    clearLatestScanJob(userId);
    clearSession(userId);

    await replyText(client, event.replyToken, buildSlipReceivedText());
    return;
  }

  const isDuplicate = await isDuplicateImage(imageBuffer);

  if (isDuplicate) {
    markAcceptedImageEvent(userId, eventTimestamp);
    clearLatestScanJob(userId);
    clearSessionIfFlowVersionMatches(userId, flowVersion);

    await replyFlexWithFallback({
      client,
      replyToken: event.replyToken,
      flex: buildDuplicateImageFlex(),
      fallbackText: buildDuplicateImageText(),
      logLabel: "duplicate image flex",
    });
    return;
  }

  const imageBase64 = toBase64(imageBuffer);
  const objectCheck = await checkSingleObject(imageBase64);

  console.log("[WEBHOOK] object check result:", objectCheck);

  if (objectCheck === "multiple") {
    markAcceptedImageEvent(userId, eventTimestamp);
    clearLatestScanJob(userId);
    clearSessionIfFlowVersionMatches(userId, flowVersion);

    await replyFlexWithFallback({
      client,
      replyToken: event.replyToken,
      flex: buildMultipleObjectsFlex(),
      fallbackText: buildMultipleObjectsText(),
      logLabel: "multiple objects flex",
    });
    return;
  }

  if (objectCheck === "unclear") {
    markAcceptedImageEvent(userId, eventTimestamp);
    clearLatestScanJob(userId);
    clearSessionIfFlowVersionMatches(userId, flowVersion);

    await replyFlexWithFallback({
      client,
      replyToken: event.replyToken,
      flex: buildUnclearImageFlex(),
      fallbackText: buildUnclearImageText(),
      logLabel: "unclear image flex",
    });
    return;
  }

  if (objectCheck === "unsupported") {
    markAcceptedImageEvent(userId, eventTimestamp);
    clearLatestScanJob(userId);
    clearSessionIfFlowVersionMatches(userId, flowVersion);

    await replyFlexWithFallback({
      client,
      replyToken: event.replyToken,
      flex: buildUnsupportedObjectFlex(),
      fallbackText: buildUnsupportedObjectText(),
      logLabel: "unsupported object flex",
    });
    return;
  }

  if (objectCheck !== "single_supported") {
    markAcceptedImageEvent(userId, eventTimestamp);
    clearLatestScanJob(userId);
    clearSessionIfFlowVersionMatches(userId, flowVersion);

    await replyFlexWithFallback({
      client,
      replyToken: event.replyToken,
      flex: buildUnsupportedObjectFlex(),
      fallbackText: buildUnsupportedObjectText(),
      logLabel: "unsupported object flex",
    });
    return;
  }

  markAcceptedImageEvent(userId, eventTimestamp);

  let accessDecision;
  try {
    accessDecision = await checkScanAccess({ userId });
  } catch (accessErr) {
    console.error("[WEBHOOK] checkScanAccess before scan failed:", {
      userId,
      message: accessErr?.message,
      code: accessErr?.code,
      details: accessErr?.details,
      hint: accessErr?.hint,
    });
    throw accessErr;
  }

  if (!accessDecision.allowed && accessDecision.reason === "payment_required") {
    setAwaitingPayment(userId);
    clearLatestScanJob(userId);
    clearSessionIfFlowVersionMatches(userId, flowVersion);

    await replyText(
      client,
      event.replyToken,
      buildManualPaymentRequestText()
    );
    return;
  }

  let savedBirthdate = null;

  try {
    console.log("[WEBHOOK] before getSavedBirthdate", { userId });
    savedBirthdate = await getSavedBirthdate(userId);
    console.log("[WEBHOOK] after getSavedBirthdate:", {
      userId,
      savedBirthdate,
    });
  } catch (error) {
    console.error("[WEBHOOK] getSavedBirthdate failed:", {
      userId,
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
    });
  }

  if (savedBirthdate) {
    console.log("[WEBHOOK] using saved birthdate:", savedBirthdate);

    await runScanFlow({
      client,
      replyToken: event.replyToken,
      userId,
      imageBuffer,
      birthdate: savedBirthdate,
      flowVersion,
    });
    return;
  }

  setPendingImage(
    userId,
    {
      messageId: event.message.id,
      imageBuffer,
    },
    flowVersion
  );

  await replyFlexWithFallback({
    client,
    replyToken: event.replyToken,
    flex: buildStartInstructionFlex(),
    fallbackText: buildStartInstructionText(),
    logLabel: "start instruction flex",
  });
}

async function handleImageMessage({ client, event, userId, session }) {
  const eventTimestamp = getEventTimestamp(event);

  if (isUserBlockedForRequest(userId)) {
    console.log("[WEBHOOK] ignore image: request-blocked", {
      userId,
      eventTimestamp,
    });
    return;
  }

  if (isUserProcessingImage(userId)) {
    console.log("[WEBHOOK] ignore image: active processing", userId);
    return;
  }

  if (
    session.pendingImage &&
    getPaymentState(userId).state !== "awaiting_slip"
  ) {
    console.log("[WEBHOOK] ignore image: waiting birthdate", {
      userId,
      sessionFlowVersion: session.flowVersion || 0,
    });
    return;
  }

  /*
  ------------------------------------------------
  collect window
  - รูปแรก: ลง candidate แล้วรอ 5 วินาที
  - รูปถัดมาใน window เดียวกัน: เพิ่ม count
  - เมื่อครบ window:
      count > 1 => reject multi-image
      count = 1 => finalize รับรูป
  ------------------------------------------------
  */
  const flowVersion = bumpUserFlowVersion(userId);

  const candidateBefore = getPendingImageCandidate(userId);

  if (!candidateBefore || !isCandidateWindowActive(userId, eventTimestamp)) {
    clearPendingImageCandidate(userId);
  }

  const candidate = registerImageCandidateEvent(userId, {
    eventTimestamp,
    messageId: event.message.id,
    replyToken: event.replyToken,
    flowVersion,
  });

  console.log("[WEBHOOK] image candidate registered", {
    userId,
    flowVersion,
    eventTimestamp,
    messageId: event.message.id,
    candidateCount: candidate?.count || 0,
    firstMessageId: candidate?.firstMessageId || null,
    latestMessageId: candidate?.latestMessageId || null,
  });

  await sleep(5000);

  const latestCandidate = getPendingImageCandidate(userId);

  if (!latestCandidate) {
    console.log("[WEBHOOK] candidate disappeared, skip", {
      userId,
      flowVersion,
    });
    return;
  }

  if (latestCandidate.firstMessageId !== event.message.id) {
    console.log("[WEBHOOK] not first candidate message, skip", {
      userId,
      flowVersion,
      firstMessageId: latestCandidate.firstMessageId,
      currentMessageId: event.message.id,
    });
    return;
  }

  if ((latestCandidate.count || 0) > 1) {
    console.log("[WEBHOOK] reject image group: multiple images collected", {
      userId,
      flowVersion,
      count: latestCandidate.count,
      firstMessageId: latestCandidate.firstMessageId,
      latestMessageId: latestCandidate.latestMessageId,
    });

    blockUserForRequest(userId);
    clearLatestScanJob(userId);
    clearSession(userId);
    clearPendingImageCandidate(userId);

    await replyFlexWithFallback({
      client,
      replyToken: event.replyToken,
      flex: buildMultipleObjectsFlex(),
      fallbackText: buildMultiImageInRequestText(),
      logLabel: "multi image collect-window flex",
    });
    return;
  }

  if (isUserBlockedForRequest(userId)) {
    console.log("[WEBHOOK] candidate cancelled by request block", {
      userId,
      flowVersion,
    });
    clearPendingImageCandidate(userId);
    return;
  }

  if (isInImageBurstWindow(userId, eventTimestamp)) {
    console.log("[WEBHOOK] reject image: burst window", userId, eventTimestamp);

    blockUserForRequest(userId);
    clearLatestScanJob(userId);
    clearSession(userId);
    clearPendingImageCandidate(userId);

    await replyFlexWithFallback({
      client,
      replyToken: event.replyToken,
      flex: buildMultipleObjectsFlex(),
      fallbackText: buildMultiImageInRequestText(),
      logLabel: "multi image burst flex",
    });
    return;
  }

  setUserProcessingImage(userId);

  try {
    const imageBuffer = await getImageBufferFromLineMessage(
      client,
      event.message.id
    );

    clearPendingImageCandidate(userId);

    await finalizeAcceptedImage({
      client,
      event,
      userId,
      flowVersion,
      eventTimestamp,
      imageBuffer,
    });
  } finally {
    clearUserProcessingImage(userId);
  }
}

async function handleTextMessage({ client, event, userId, session }) {
  const text = String(event.message.text || "").trim();
  const lowerText = text.toLowerCase();

  console.log("[WEBHOOK] text received:", {
    userId,
    text,
    hasPendingImage: !!session.pendingImage,
    sessionFlowVersion: session.flowVersion || 0,
  });

  if (isHistoryCommand(text, lowerText)) {
    await handleHistoryCommand({
      client,
      replyToken: event.replyToken,
      userId,
    });
    return;
  }

  if (isStatsCommand(text, lowerText)) {
    await handleStatsCommand({
      client,
      replyToken: event.replyToken,
      userId,
    });
    return;
  }

  if (!session.pendingImage) {
    if (
      getPaymentState(userId).state === "awaiting_slip" &&
      !isPaymentCommand(text, lowerText)
    ) {
      await replyText(
        client,
        event.replyToken,
        buildAwaitingSlipReminderText()
      );
      return;
    }

    if (isPaymentCommand(text, lowerText)) {
      let paymentId = null;
      const amount = env.PAYMENT_UNLOCK_AMOUNT_THB || 0;
      const currency = env.PAYMENT_UNLOCK_CURRENCY || "THB";
      try {
        const appUser = await ensureUserByLineUserId(userId);
        paymentId = await createPaymentPending({
          appUserId: appUser.id,
          amount,
          currency,
        });
      } catch (err) {
        console.error("[WEBHOOK] createPaymentPending failed:", {
          userId,
          message: err?.message,
          code: err?.code,
          details: err?.details,
          hint: err?.hint,
        });
      }
      await replyText(
        client,
        event.replyToken,
        buildPaymentInstructionText({ paymentId, amount, currency })
      );
      return;
    }

    await replyFlexWithFallback({
      client,
      replyToken: event.replyToken,
      flex: buildIdleFlex(),
      fallbackText: buildIdleText(),
      logLabel: "idle flex",
    });
    return;
  }

  if (!isValidBirthdate(text)) {
    await replyText(client, event.replyToken, buildInvalidBirthdateText());
    return;
  }

  const flowVersion = session.flowVersion || 0;
  const normalizedBirthdate = normalizeBirthdateForScan(text);

  console.log("[WEBHOOK] use session flowVersion(text):", flowVersion);
  console.log("[WEBHOOK] normalized birthdate:", normalizedBirthdate);
  console.log("[WEBHOOK] going to runScanFlow from text", {
    userId,
    birthdate: normalizedBirthdate,
    flowVersion,
  });

  await runScanFlow({
    client,
    replyToken: event.replyToken,
    userId,
    imageBuffer: session.pendingImage.imageBuffer,
    birthdate: normalizedBirthdate,
    flowVersion,
  });
}

async function handleEvent({ client, event }) {
  if (event.type !== "message") return;
  if (!event.replyToken) return;

  const userId = event.source?.userId;

  if (!userId) {
    await replyText(client, event.replyToken, "ไม่พบข้อมูลผู้ใช้ครับ");
    return;
  }

  // Ensure production app user exists (app_users uses UUID PK)
  try {
    const appUser = await ensureUserByLineUserId(userId);
    await touchUserLastActive(appUser.id);
  } catch (error) {
    console.error("[WEBHOOK] ensure app user failed:", {
      lineUserId: userId,
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
    });
    // Keep current scan flow intact even if app_users is unavailable.
  }

  if (isUserBlockedForRequest(userId)) {
    console.log("[WEBHOOK] skip event: request-blocked", {
      userId,
      eventType: event.type,
      messageType: event.message?.type || "no-message-type",
    });
    return;
  }

  const session = getSession(userId);

  if (event.message?.type === "image") {
    await handleImageMessage({ client, event, userId, session });
    return;
  }

  if (event.message?.type === "text") {
    await handleTextMessage({ client, event, userId, session });
    return;
  }

  console.log("[WEBHOOK] skip unsupported message");
}

export function lineWebhookRouter(lineConfig) {
  const client = new line.Client(lineConfig);

  return async (req, res) => {
    try {
      const events = Array.isArray(req.body.events) ? req.body.events : [];
      const imageCountByUser = groupImageEventCountByUser(events);
      const multiImageUsersReplied = new Set();

      console.log("========== LINE WEBHOOK ==========");
      console.log("event count:", events.length);
      console.log(
        "[WEBHOOK] imageCountByUser:",
        Object.fromEntries(imageCountByUser)
      );

      cleanupExpiredRequestBlocks();
      clearExpiredImageCandidates();

      for (let index = 0; index < events.length; index += 1) {
        const event = events[index];

        try {
          console.log(`\n----- event #${index + 1} -----`);
          console.log("[WEBHOOK] type:", event.type);
          console.log(
            "[WEBHOOK] userId:",
            event.source?.userId || "no-user-id"
          );
          console.log(
            "[WEBHOOK] message type:",
            event.message?.type || "no-message-type"
          );
          console.log("[WEBHOOK] timestamp:", event.timestamp || "no-timestamp");

          const userId = event.source?.userId;

          if (
            userId &&
            event.type === "message" &&
            event.message?.type === "image" &&
            (imageCountByUser.get(userId) || 0) > 1
          ) {
            const flowVersion = bumpUserFlowVersion(userId);

            blockUserForRequest(userId);
            clearLatestScanJob(userId);
            clearSession(userId);
            clearPendingImageCandidate(userId);

            if (!multiImageUsersReplied.has(userId) && event.replyToken) {
              multiImageUsersReplied.add(userId);

              console.log("[WEBHOOK] multi image request rejected", {
                userId,
                flowVersion,
              });

              await replyFlexWithFallback({
                client,
                replyToken: event.replyToken,
                flex: buildMultipleObjectsFlex(),
                fallbackText: buildMultiImageInRequestText(),
                logLabel: "multi image request flex",
              });
            }

            console.log(
              "[WEBHOOK] skip image because multiple image events in same request",
              userId
            );
            continue;
          }

          await handleEvent({ client, event });
        } catch (err) {
          console.error(`[WEBHOOK] event #${index + 1} error:`, err);

          if (event.replyToken) {
            try {
              await replyText(
                client,
                event.replyToken,
                buildSystemErrorText()
              );
            } catch (replyErr) {
              console.error("[WEBHOOK] fallback error reply failed:", replyErr);
            }
          }
        }
      }

      cleanupExpiredRequestBlocks();
      clearExpiredImageCandidates();

      res.status(200).json({ ok: true });
    } catch (error) {
      console.error("[WEBHOOK] fatal:", error);
      res.status(500).json({ error: "webhook_failed" });
    }
  };
}