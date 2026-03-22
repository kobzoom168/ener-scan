import line from "@line/bot-sdk";

import {
  getSession,
  setPendingImage,
  clearSession,
  clearSessionIfFlowVersionMatches,
  clearAwaitingBirthdateUpdate,
  setAwaitingBirthdateUpdate,
} from "../stores/session.store.js";

import { getSavedBirthdate, saveBirthdate } from "../stores/userProfile.db.js";

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
import {
  getPromptPayQrPublicUrl,
  isPromptPayQrUrlHttpsForLine,
} from "../utils/promptpayQrPublicUrl.util.js";
import { ensureUserByLineUserId, touchUserLastActive } from "../stores/users.db.js";
import {
  createPaymentPending,
  ensurePaymentRefForPaymentId,
  getLatestAwaitingPaymentForLineUserId,
  setPaymentSlipPendingVerify,
} from "../stores/payments.db.js";

import { uploadSlipImageToStorage } from "../services/slipUpload.service.js";

import {
  replyText,
  replyPaymentInstructions,
} from "../services/lineReply.service.js";
import { buildStartInstructionFlex } from "../services/flex/startInstruction.flex.js";
import {
  buildUnsupportedObjectFlex,
  buildIdleFlex,
  buildDuplicateImageFlex,
  buildMultipleObjectsFlex,
  buildUnclearImageFlex,
  buildMainMenuFlex,
  buildPendingVerifyFlex,
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
  buildPaymentQrIntroText,
  buildPaymentQrSlipText,
  buildSlipReceivedText,
  buildPendingVerifyReminderText,
  buildPendingVerifyBlockScanText,
  buildPendingVerifyPaymentCommandText,
  allowsUtilityCommandsDuringPendingVerify,
  buildAwaitingSlipReminderText,
  isHistoryCommand,
  isStatsCommand,
  groupImageEventCountByUser,
} from "../utils/webhookText.util.js";

import {
  getPaymentState,
  setAwaitingPayment,
  clearPaymentState,
} from "../stores/manualPaymentAccess.store.js";
import { checkScanAccess } from "../services/paymentAccess.service.js";

import {
  replyFlexWithFallback,
  runScanFlow,
} from "../handlers/scanFlow.handler.js";

import {
  checkGlobalAbuseStatus,
  checkPaymentAbuseStatus,
  checkScanAbuseStatus,
  recordLockedImageActivity,
  registerPaymentIntent,
  registerScanIntent,
  registerSlipEvent,
  registerTextEvent,
} from "../stores/abuseGuard.store.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MAIN_MENU_HINT_TEXT = "พิมพ์เมนูหลัก เพื่อกลับเมนูหลักได้ตลอดครับ";

const ABUSE_MSG_HARD = "ไม่สามารถใช้งานได้ชั่วคราว";
const ABUSE_MSG_SCAN_LOCK =
  "มีการสแกนถี่เกินไป ขอพักระบบสักครู่แล้วค่อยลองใหม่นะครับ 🙏";
const ABUSE_MSG_PAYMENT_LOCK =
  "มีการส่งข้อมูลการชำระถี่เกินไป กรุณารอสักครู่แล้วลองใหม่อีกครั้งนะครับ";

async function handleHistoryCommand({ client, replyToken, userId }) {
  const history = getScanHistory(userId);

  if (!history.length) {
    await replyText(
      client,
      replyToken,
      `${buildNoHistoryText()}\n\n${MAIN_MENU_HINT_TEXT}`
    );
    return;
  }

  const formatted = formatHistory(history);
  await replyText(
    client,
    replyToken,
    `📜 ประวัติการสแกนล่าสุด\n\n${formatted}\n\n${MAIN_MENU_HINT_TEXT}`
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
      "",
      MAIN_MENU_HINT_TEXT,
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

  // Image routing: scan access first — never treat as slip if user already has scan access
  // (e.g. paid after admin approve, while stale awaiting_payment rows may still exist).
  let accessDecision;
  try {
    accessDecision = await checkScanAccess({ userId });
  } catch (accessErr) {
    console.error("[WEBHOOK] checkScanAccess (image routing) failed:", {
      userId,
      message: accessErr?.message,
      code: accessErr?.code,
      details: accessErr?.details,
      hint: accessErr?.hint,
    });
    throw accessErr;
  }

  const hasPaidAccess =
    accessDecision?.allowed === true && accessDecision?.reason === "paid";

  let pendingPayment = null;
  if (!accessDecision?.allowed) {
    try {
      console.log("[SLIP_VERIFY_LOOKUP] start", {
        userId,
        source: "finalizeAcceptedImage",
        messageId: event?.message?.id || null,
      });
      pendingPayment = await getLatestAwaitingPaymentForLineUserId(userId);
    } catch (err) {
      console.error("[PAYMENT_SLIP_VERIFY] lookup pending payment failed:", {
        userId,
        message: err?.message,
        code: err?.code,
        hint: err?.hint,
      });
    }
  }

  const chosenPath =
    !accessDecision?.allowed && pendingPayment ? "slip" : "scan";
  console.log("[IMAGE_ROUTING_DECISION]", {
    userId,
    hasPaidAccess,
    accessReason: accessDecision?.reason ?? null,
    hasAwaitingPayment: Boolean(pendingPayment),
    chosenPath,
  });

  if (!accessDecision?.allowed && pendingPayment) {
    const payNow = Date.now();
    const payStatus = checkPaymentAbuseStatus(userId, payNow);
    console.log("[ABUSE_GUARD_PAYMENT_STATUS]", {
      userId,
      ...payStatus,
    });
    if (payStatus.isLocked) {
      console.warn("[ABUSE_GUARD_PAYMENT_LOCK]", {
        userId,
        lockUntil: payStatus.lockUntil,
      });
      await replyText(client, event.replyToken, ABUSE_MSG_PAYMENT_LOCK);
      return;
    }

    if (String(pendingPayment.status) === "pending_verify") {
      let paymentRef = null;
      try {
        paymentRef =
          pendingPayment.payment_ref ||
          (await ensurePaymentRefForPaymentId(pendingPayment.id));
      } catch (_) {
        paymentRef = null;
      }
      markAcceptedImageEvent(userId, eventTimestamp);
      clearLatestScanJob(userId);
      await replyFlexWithFallback({
        client,
        replyToken: event.replyToken,
        flex: buildPendingVerifyFlex(),
        fallbackText: buildPendingVerifyBlockScanText({ paymentRef }),
        logLabel: "pending verify block scan flex",
      });
      return;
    }

    const slipMessageId = event?.message?.id;
    const paymentId = pendingPayment.id;

    const slipReg = registerSlipEvent(userId, payNow);
    if (slipReg.abusive) {
      console.warn("[ABUSE_GUARD_PAYMENT_ABUSE]", {
        userId,
        reasons: slipReg.reasons,
        paymentSpamScore: slipReg.state.paymentSpamScore,
      });
    }

    try {
      const slipUrl = await uploadSlipImageToStorage({
        buffer: imageBuffer,
        lineUserId: userId,
        paymentId,
        slipMessageId,
      });

      await setPaymentSlipPendingVerify({
        paymentId,
        slipUrl,
        slipMessageId,
      });

      clearPaymentState(userId);
      markAcceptedImageEvent(userId, eventTimestamp);
      clearLatestScanJob(userId);

      let slipPaymentRef = null;
      try {
        slipPaymentRef =
          pendingPayment.payment_ref ||
          (await ensurePaymentRefForPaymentId(paymentId));
      } catch (_) {
        slipPaymentRef = null;
      }

      await replyText(
        client,
        event.replyToken,
        buildSlipReceivedText({ paymentRef: slipPaymentRef }),
      );
      return;
    } catch (err) {
      console.error("[PAYMENT_SLIP_VERIFY] slip upload/update failed:", {
        userId,
        paymentId,
        slipMessageId,
        message: err?.message,
        code: err?.code,
        hint: err?.hint,
      });

      await replyText(
        client,
        event.replyToken,
        "ขออภัยครับ ระบบบันทึกสลิปไม่สำเร็จ กรุณาลองส่งสลิปใหม่อีกครั้ง"
      );
      return;
    }
  }

  const scanIntentNow = Date.now();
  const scanIntent = registerScanIntent(userId, scanIntentNow);
  if (scanIntent.abusive) {
    console.warn("[ABUSE_GUARD_SCAN_ABUSE]", {
      userId,
      reasons: scanIntent.reasons,
      scanSpamScore: scanIntent.state.scanSpamScore,
    });
  }
  if (scanIntent.state.isHardBlocked) {
    await replyText(client, event.replyToken, ABUSE_MSG_HARD);
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

  // Reuse accessDecision from image routing (same request; avoids slip vs scan mismatch).
  if (!accessDecision.allowed && accessDecision.reason === "payment_required") {
    const payReqGateNow = Date.now();
    const payReqStatus = checkPaymentAbuseStatus(userId, payReqGateNow);
    console.log("[ABUSE_GUARD_PAYMENT_STATUS]", {
      userId,
      gate: "finalize_payment_required",
      ...payReqStatus,
    });
    if (payReqStatus.isLocked) {
      console.warn("[ABUSE_GUARD_PAYMENT_LOCK]", {
        userId,
        lockUntil: payReqStatus.lockUntil,
        gate: "finalize_payment_required",
      });
      await replyText(client, event.replyToken, ABUSE_MSG_PAYMENT_LOCK);
      return;
    }

    const payIntentNow = Date.now();
    const payIntent = registerPaymentIntent(userId, payIntentNow);
    if (payIntent.abusive) {
      console.warn("[ABUSE_GUARD_PAYMENT_ABUSE]", {
        userId,
        reasons: payIntent.reasons,
        paymentSpamScore: payIntent.state.paymentSpamScore,
      });
    }

    // Create (or re-create) the pending payment row for this LINE user.
    // All subsequent images will be treated as slip upload until admin verifies.
    let createdPaymentRef = null;
    try {
      const appUser = await ensureUserByLineUserId(userId);
      // createPaymentPending dedupes: reuses active awaiting_payment / pending_verify row
      const created = await createPaymentPending({
        appUserId: appUser.id,
        amount: env.PAYMENT_UNLOCK_AMOUNT_THB || 99,
        currency: env.PAYMENT_UNLOCK_CURRENCY || "THB",
      });
      createdPaymentRef = created?.paymentRef ?? null;
    } catch (err) {
      console.error("[WEBHOOK] createPaymentPending (payment_required) failed:", {
        userId,
        message: err?.message,
        code: err?.code,
        hint: err?.hint,
      });
      // Still proceed with the user-facing payment instructions.
    }

    setAwaitingPayment(userId);
    clearLatestScanJob(userId);

    // Preserve the scan image candidate so user can continue after approval.
    setPendingImage(userId, { messageId: event?.message?.id, imageBuffer }, flowVersion);

    const qrUrl = getPromptPayQrPublicUrl();
    if (isPromptPayQrUrlHttpsForLine(qrUrl)) {
      try {
        await replyPaymentInstructions(client, event.replyToken, {
          introText: buildPaymentQrIntroText({
            paymentRef: createdPaymentRef,
          }),
          qrImageUrl: qrUrl,
          slipText: buildPaymentQrSlipText(),
        });
        return;
      } catch (qrErr) {
        console.error(
          "[WEBHOOK] replyPaymentInstructions (finalizeAcceptedImage payment_required) failed:",
          {
            userId,
            message: qrErr?.message,
          },
        );
      }
    } else {
      console.warn(
        "[WEBHOOK] QR URL not HTTPS — LINE cannot load image. Set APP_BASE_URL to public https URL.",
        { qrUrl },
      );
    }

    await replyText(
      client,
      event.replyToken,
      buildPaymentInstructionText({
        amount: env.PAYMENT_UNLOCK_AMOUNT_THB || 99,
        currency: env.PAYMENT_UNLOCK_CURRENCY || "THB",
        paymentRef: createdPaymentRef,
      }),
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
  const now = Date.now();

  const lockedBump = recordLockedImageActivity(userId, now);
  if (lockedBump.bumped) {
    console.log("[ABUSE_GUARD_LOCKED_IMAGE_ACTIVITY]", { userId });
  }

  const globalAfter = checkGlobalAbuseStatus(userId, now);
  if (globalAfter.isHardBlocked) {
    console.warn("[ABUSE_GUARD_HARD_BLOCK]", {
      userId,
      source: "after_locked_image_activity",
    });
    await replyText(client, event.replyToken, ABUSE_MSG_HARD);
    return;
  }

  let routeAccessDecision;
  try {
    routeAccessDecision = await checkScanAccess({ userId });
  } catch (routeErr) {
    console.error("[ABUSE_GUARD] checkScanAccess (image route) failed:", {
      userId,
      message: routeErr?.message,
    });
    routeAccessDecision = { allowed: false };
  }

  let routePendingPayment = null;
  if (!routeAccessDecision?.allowed) {
    try {
      routePendingPayment = await getLatestAwaitingPaymentForLineUserId(userId);
    } catch (_) {
      routePendingPayment = null;
    }
  }

  const imageWillUseSlipPath =
    !routeAccessDecision?.allowed && routePendingPayment;

  if (imageWillUseSlipPath) {
    const payStatus = checkPaymentAbuseStatus(userId, now);
    console.log("[ABUSE_GUARD_PAYMENT_STATUS]", {
      userId,
      gate: "handleImageMessage_slip_route",
      ...payStatus,
    });
    if (payStatus.isLocked) {
      console.warn("[ABUSE_GUARD_PAYMENT_LOCK]", {
        userId,
        lockUntil: payStatus.lockUntil,
        gate: "handleImageMessage_slip_route",
      });
      await replyText(client, event.replyToken, ABUSE_MSG_PAYMENT_LOCK);
      return;
    }
  } else {
    const scanStatus = checkScanAbuseStatus(userId, now);
    console.log("[ABUSE_GUARD_SCAN_STATUS]", {
      userId,
      ...scanStatus,
    });
    if (scanStatus.isLocked) {
      console.warn("[ABUSE_GUARD_SCAN_LOCK]", {
        userId,
        lockUntil: scanStatus.lockUntil,
      });
      await replyText(client, event.replyToken, ABUSE_MSG_SCAN_LOCK);
      return;
    }
  }

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

  if (session.awaitingBirthdateUpdate) {
    await replyText(
      client,
      event.replyToken,
      `กรุณาพิมพ์วันเกิดใหม่ของคุณ\nตัวอย่าง: 14/09/1995\n\n${MAIN_MENU_HINT_TEXT}`
    );
    return;
  }

  if (
    session.pendingImage &&
    getPaymentState(userId).state !== "awaiting_slip"
  ) {
    // Allow slip uploads while a pending payment exists in DB.
    // Otherwise keep the original behavior: ignore images while waiting birthdate.
    let pendingPaymentExists = false;
    try {
      const pendingPayment = await getLatestAwaitingPaymentForLineUserId(userId);
      pendingPaymentExists = Boolean(pendingPayment);
    } catch (err) {
      console.error("[WEBHOOK] pendingPaymentExists check failed:", {
        userId,
        message: err?.message,
        code: err?.code,
      });
    }

    if (!pendingPaymentExists) {
      // If birthdate is already saved, allow images to proceed to scan flow.
      // Otherwise keep the original behavior: ignore images while waiting birthdate.
      let birthdateExists = false;
      try {
        const savedBirthdate = await getSavedBirthdate(userId);
        birthdateExists = Boolean(savedBirthdate);
      } catch (err) {
        console.error("[WEBHOOK] getSavedBirthdate in ignore-guard failed (ignored):", {
          userId,
          message: err?.message,
          code: err?.code,
        });
      }

      if (!birthdateExists) {
        console.log("[WEBHOOK] ignore image: waiting birthdate", {
          userId,
          sessionFlowVersion: session.flowVersion || 0,
        });
        return;
      }
    }
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
  const now = Date.now();

  const textSpam = registerTextEvent(userId, text, now);

  if (textSpam.state.isHardBlocked) {
    console.warn("[ABUSE_GUARD_HARD_BLOCK]", { userId, source: "text_register" });
    await replyText(client, event.replyToken, ABUSE_MSG_HARD);
    return;
  }

  if (textSpam.abusive) {
    console.warn("[ABUSE_GUARD_TEXT_SPAM]", {
      userId,
      reasons: textSpam.reasons,
      textSpamScore: textSpam.state.textSpamScore,
      scanSpamScore: textSpam.state.scanSpamScore,
      paymentSpamScore: textSpam.state.paymentSpamScore,
    });
  }

  console.log("[WEBHOOK] text received:", {
    userId,
    text,
    hasPendingImage: !!session.pendingImage,
    sessionFlowVersion: session.flowVersion || 0,
  });

  // Priority 1: awaiting birthdate update
  if (session.awaitingBirthdateUpdate) {
    if (text === "เปลี่ยนวันเกิด") {
      await replyText(
        client,
        event.replyToken,
        `กรุณาพิมพ์วันเกิดใหม่ของคุณ\nตัวอย่าง: 14/09/1995\n\n${MAIN_MENU_HINT_TEXT}`
      );
      return;
    }

    const candidateValid = isValidBirthdate(text);
    if (!candidateValid) {
      console.log("[BIRTHDATE_UPDATE] invalid", {
        userId,
        text,
      });
      await replyText(
        client,
        event.replyToken,
        `รูปแบบวันเกิดไม่ถูกต้อง\nกรุณาพิมพ์เป็น DD/MM/YYYY\nตัวอย่าง: 14/09/1995\n\n${MAIN_MENU_HINT_TEXT}`
      );
      return;
    }

    const normalizedBirthdate = normalizeBirthdateForScan(text);
    await saveBirthdate(userId, normalizedBirthdate);

    clearAwaitingBirthdateUpdate(userId);
    console.log("[BIRTHDATE_UPDATE] saved", {
      userId,
      birthdate: normalizedBirthdate,
    });

    await replyText(
      client,
      event.replyToken,
      `บันทึกวันเกิดใหม่เรียบร้อยแล้ว\nวันเกิดปัจจุบัน: ${normalizedBirthdate}\n\nส่งรูปใหม่มาได้เลยครับ\n\n${MAIN_MENU_HINT_TEXT}`
    );
    return;
  }

  // Priority 2: awaiting_slip reminder (must not be replaced by menu)
  if (
    getPaymentState(userId).state === "awaiting_slip" &&
    !isPaymentCommand(text, lowerText)
  ) {
    let paymentRef = null;
    try {
      const row = await getLatestAwaitingPaymentForLineUserId(userId);
      if (row?.id) {
        paymentRef =
          row.payment_ref || (await ensurePaymentRefForPaymentId(row.id));
      }
    } catch (_) {
      paymentRef = null;
    }
    await replyText(
      client,
      event.replyToken,
      buildAwaitingSlipReminderText({ paymentRef })
    );
    return;
  }

  // Priority 2b: DB pending_verify — short replies; payment cmd = already queued
  try {
    const pendingVerifyRow = await getLatestAwaitingPaymentForLineUserId(userId);
    if (pendingVerifyRow && String(pendingVerifyRow.status) === "pending_verify") {
      let paymentRef = null;
      try {
        paymentRef =
          pendingVerifyRow.payment_ref ||
          (await ensurePaymentRefForPaymentId(pendingVerifyRow.id));
      } catch (_) {
        paymentRef = null;
      }
      if (isPaymentCommand(text, lowerText)) {
        await replyText(
          client,
          event.replyToken,
          buildPendingVerifyPaymentCommandText({ paymentRef })
        );
        return;
      }
      if (!allowsUtilityCommandsDuringPendingVerify(text, lowerText)) {
        await replyText(
          client,
          event.replyToken,
          buildPendingVerifyReminderText({ paymentRef })
        );
        return;
      }
    }
  } catch (pvErr) {
    console.error("[PAYMENT_PENDING_VERIFY] lookup failed (ignored):", {
      userId,
      message: pvErr?.message,
      code: pvErr?.code,
    });
  }

  // Priority 3: explicit commands (before pendingImage so history/menu work during pending_verify)
  if (text === "เปลี่ยนวันเกิด") {
    console.log("[BIRTHDATE_UPDATE] requested", { userId });
    setAwaitingBirthdateUpdate(userId, true);
    await replyText(
      client,
      event.replyToken,
      `กรุณาพิมพ์วันเกิดใหม่ของคุณ\nตัวอย่าง: 14/09/1995\n\n${MAIN_MENU_HINT_TEXT}`
    );
    return;
  }

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

  if (isPaymentCommand(text, lowerText)) {
    const payCmdNow = Date.now();
    const payCmdStatus = checkPaymentAbuseStatus(userId, payCmdNow);
    console.log("[ABUSE_GUARD_PAYMENT_STATUS]", {
      userId,
      ...payCmdStatus,
    });
    if (payCmdStatus.isLocked) {
      console.warn("[ABUSE_GUARD_PAYMENT_LOCK]", {
        userId,
        lockUntil: payCmdStatus.lockUntil,
        source: "payment_command",
      });
      await replyText(client, event.replyToken, ABUSE_MSG_PAYMENT_LOCK);
      return;
    }

    const payCmdIntent = registerPaymentIntent(userId, payCmdNow);
    if (payCmdIntent.abusive) {
      console.warn("[ABUSE_GUARD_PAYMENT_ABUSE]", {
        userId,
        reasons: payCmdIntent.reasons,
        paymentSpamScore: payCmdIntent.state.paymentSpamScore,
      });
    }
    if (payCmdIntent.state.isHardBlocked) {
      await replyText(client, event.replyToken, ABUSE_MSG_HARD);
      return;
    }

    const amount = env.PAYMENT_UNLOCK_AMOUNT_THB || 0;
    const currency = env.PAYMENT_UNLOCK_CURRENCY || "THB";
    const amountForCopy = amount > 0 ? amount : 99;
    let cmdPaymentRef = null;
    try {
      const appUser = await ensureUserByLineUserId(userId);
      const created = await createPaymentPending({
        appUserId: appUser.id,
        amount,
        currency,
      });
      cmdPaymentRef = created?.paymentRef ?? null;
    } catch (err) {
      console.error("[WEBHOOK] createPaymentPending failed:", {
        userId,
        message: err?.message,
        code: err?.code,
        details: err?.details,
        hint: err?.hint,
      });
    }

    const qrUrl = getPromptPayQrPublicUrl();
    const intro = buildPaymentQrIntroText({ paymentRef: cmdPaymentRef });
    const slipText = buildPaymentQrSlipText();

    if (isPromptPayQrUrlHttpsForLine(qrUrl)) {
      try {
        await replyPaymentInstructions(client, event.replyToken, {
          introText: intro,
          qrImageUrl: qrUrl,
          slipText,
        });
        return;
      } catch (qrErr) {
        console.error("[WEBHOOK] replyPaymentInstructions failed, fallback text:", {
          userId,
          message: qrErr?.message,
        });
      }
    } else {
      console.warn(
        "[WEBHOOK] QR URL not HTTPS — LINE cannot load QR image. Set APP_BASE_URL to public https URL.",
        {
          qrUrl,
        },
      );
    }

    await replyText(
      client,
      event.replyToken,
      `${buildPaymentInstructionText({
        amount: amountForCopy,
        currency,
        paymentRef: cmdPaymentRef,
      })}\n\n${MAIN_MENU_HINT_TEXT}`
    );
    return;
  }

  // Priority 4: pendingImage / waiting birthdate for scan
  if (session.pendingImage) {
    try {
      const pendingPayment = await getLatestAwaitingPaymentForLineUserId(userId);
      if (pendingPayment && String(pendingPayment.status) === "awaiting_payment") {
        await replyText(
          client,
          event.replyToken,
          buildAwaitingSlipReminderText()
        );
        return;
      }
    } catch (err) {
      console.error("[PAYMENT_FLOW_GUARD] pending payment check failed (ignored):", {
        userId,
        message: err?.message,
        code: err?.code,
      });
    }

    if (!isValidBirthdate(text)) {
      await replyText(
        client,
        event.replyToken,
        buildInvalidBirthdateText()
      );
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

    const scanGateNow = Date.now();
    const scanGateFromText = checkScanAbuseStatus(userId, scanGateNow);
    console.log("[ABUSE_GUARD_SCAN_STATUS]", {
      userId,
      gate: "pendingImage_birthdate_text",
      ...scanGateFromText,
    });
    if (scanGateFromText.isLocked) {
      console.warn("[ABUSE_GUARD_SCAN_LOCK]", {
        userId,
        lockUntil: scanGateFromText.lockUntil,
        gate: "pendingImage_birthdate_text",
      });
      await replyText(client, event.replyToken, ABUSE_MSG_SCAN_LOCK);
      return;
    }

    await runScanFlow({
      client,
      replyToken: event.replyToken,
      userId,
      imageBuffer: session.pendingImage.imageBuffer,
      birthdate: normalizedBirthdate,
      flowVersion,
    });
    return;
  }

  if (text === "สแกนพลังงาน") {
    let savedBirthdate = null;
    try {
      savedBirthdate = await getSavedBirthdate(userId);
    } catch (error) {
      console.error("[BIRTHDATE_UPDATE] getSavedBirthdate failed (ignored):", {
        userId,
        message: error?.message,
      });
    }

    const helperText = [
      "ส่งรูปวัตถุที่ต้องการสแกน 1 รูปได้เลยครับ",
      savedBirthdate
        ? "ถ้าคุณมีวันเกิดที่บันทึกไว้แล้ว ระบบจะเริ่มสแกนให้ทันที"
        : "ถ้ายังไม่มีวันเกิดที่บันทึกไว้ ระบบจะให้คุณพิมพ์วันเกิดก่อนสแกน",
      "",
      "ส่งรูปถัดไปมาได้เลยครับ",
      "",
      MAIN_MENU_HINT_TEXT,
    ].join("\n");

    await replyText(client, event.replyToken, helperText);
    return;
  }

  // main menu / help / start aliases
  const menuAliases = new Set([
    "เมนู",
    "เมนูหลัก",
    "menu",
    "help",
    "start",
    "เริ่ม",
    "วิธีใช้งาน",
    "วิธีใช้",
  ]);

  // "วิธีใช้" should show usage instructions (not the menu itself)
  if (text === "วิธีใช้" || text === "วิธีใช้งาน") {
    await replyText(
      client,
      event.replyToken,
      [
        "วิธีใช้งาน Ener Scan",
        "",
        "1) ส่งรูปวัตถุที่ต้องการสแกน",
        "2) ระบบให้พิมพ์วันเกิด (DD/MM/YYYY)",
        "3) ระบบจะส่งผลการสแกนกลับมาในแชทนี้",
        "",
        "หากหมดสิทธิ์ฟรี: พิมพ์ `payment` หรือ `จ่ายเงิน`",
        "",
        MAIN_MENU_HINT_TEXT,
      ].join("\n")
    );
    return;
  }

  if (menuAliases.has(text) || menuAliases.has(lowerText)) {
    await replyFlexWithFallback({
      client,
      replyToken: event.replyToken,
      flex: buildMainMenuFlex(),
      fallbackText: buildIdleText(),
      logLabel: "main menu flex",
    });
    return;
  }

  // fallback => show main menu
  await replyFlexWithFallback({
    client,
    replyToken: event.replyToken,
    flex: buildMainMenuFlex(),
    fallbackText: buildIdleText(),
    logLabel: "main menu fallback",
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

  const now = Date.now();
  const globalStatus = checkGlobalAbuseStatus(userId, now);
  console.log("[ABUSE_GUARD_GLOBAL_STATUS]", {
    userId,
    ...globalStatus,
  });

  if (globalStatus.isHardBlocked) {
    console.warn("[ABUSE_GUARD_HARD_BLOCK]", { userId, gate: "handleEvent" });
    await replyText(client, event.replyToken, ABUSE_MSG_HARD);
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