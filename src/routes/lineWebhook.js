import line from "@line/bot-sdk";

import {
  getSession,
  setPendingImage,
  clearSession,
  clearSessionIfFlowVersionMatches,
  clearAwaitingBirthdateUpdate,
  setAwaitingBirthdateUpdate,
  setSelectedPaymentPackageKey,
  getSelectedPaymentPackageKey,
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
import { logConversationCost } from "../utils/conversationCost.util.js";
import {
  evaluateTextEdgeGate,
  isSoftVerifyPending,
  clearSoftVerifyPending,
  isSoftVerifyUnlockText,
} from "../stores/edgeGate.store.js";
import { loadActiveScanOffer } from "../services/scanOffer.loader.js";
import { resolveScanOfferAccessContext } from "../services/scanOfferAccess.resolver.js";
import { buildScanOfferReply } from "../services/scanOffer.copy.js";
import {
  parsePackageSelectionFromText,
  findPackageByKey,
} from "../services/scanOffer.packages.js";
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
  replyPaymentInstructions,
  replyText,
} from "../services/lineReply.service.js";
import {
  sendNonScanReply,
  sendNonScanSequenceReply,
} from "../services/nonScanReply.gateway.js";
import { sendScanLockReply } from "../utils/scanLockReply.util.js";
import {
  handleStickerLikeInput,
  isLineStickerPlaceholderText,
} from "../handlers/stickerMessage.handler.js";
import {
  parseBirthdateInput,
  looksLikeBirthdateInput,
} from "../utils/birthdateParse.util.js";
import {
  beforeScanMessageSequence,
  birthdateUpdatePrompt,
  birthdateSavedAfterUpdate,
} from "../utils/replyCopy.util.js";
import { sleep } from "../utils/timing.util.js";
import { logEvent, logPaywallShown } from "../utils/personaAnalytics.util.js";
import { getAssignedPersonaVariant } from "../utils/personaVariant.util.js";

import {
  toBase64,
  formatHistory,
  formatBangkokDateTime,
  buildStartInstructionMessages,
  buildWaitingBirthdateDateFirstGuidanceMessages,
  buildMultiImageInRequestText,
  buildMultipleObjectsText,
  buildUnclearImageText,
  buildUnsupportedObjectText,
  buildDuplicateImageText,
  getDuplicateImageReplyCandidates,
  getMultipleObjectsReplyCandidates,
  getUnclearImageReplyCandidates,
  getUnsupportedObjectReplyCandidates,
  getMultiImageInRequestReplyCandidates,
  buildNoHistoryText,
  buildNoStatsText,
  buildIdleText,
  buildIdleDeterministicPrimaryText,
  buildSystemErrorText,
  isPaymentCommand,
  buildPaymentInstructionText,
  buildPaymentQrIntroText,
  buildPaymentQrSlipText,
  buildPackageSelectionPromptFromOffer,
  buildPaymentPackageSelectedAck,
  buildSlipReceivedText,
  buildPendingVerifyReminderText,
  buildPendingVerifyHumanGuidanceText,
  buildPaywallHumanGuidanceText,
  buildPackageAlreadySelectedContinueHuman,
  buildPaymentPayIntentNoPackageHumanText,
  buildPaidActiveScanReadyHumanText,
  buildPendingVerifyBlockScanText,
  buildPendingVerifyPaymentCommandText,
  allowsUtilityCommandsDuringPendingVerify,
  buildAwaitingSlipReminderText,
  buildWaitingBirthdateGuidanceText,
  buildWaitingBirthdateImageReminderMessages,
  buildBirthdateErrorMessages,
  isBlockedIntentDuringWaitingBirthdate,
  isMainMenuAlias,
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

import { runScanFlow } from "../handlers/scanFlow.handler.js";

import {
  checkGlobalAbuseStatus,
  checkPaymentAbuseStatus,
  checkScanAbuseStatus,
  getHandleEventAbuseGateDiagnostics,
  recordLockedImageActivity,
  registerPaymentIntent,
  registerScanIntent,
  registerSlipEvent,
  registerTextEvent,
} from "../stores/abuseGuard.store.js";

/** Lightweight QA logs (grep: `[WAITING_BIRTHDATE]`). */
function logWaitingBirthdate(event, payload = {}) {
  console.log(`[WAITING_BIRTHDATE] ${event}`, payload);
}

const MAIN_MENU_HINT_TEXT = "พิมพ์เมนูหลัก เพื่อกลับเมนูหลักได้ตลอดครับ";

/**
 * Shared path for payment / จ่ายเงิน / ปลดล็อก (create or reuse payment, QR / text fallback).
 * @returns {Promise<boolean>} true if input was a payment command and was fully handled.
 */
async function handlePaymentCommandTextRoute({
  client,
  event,
  userId,
  session,
  text,
  lowerText,
  isPaywallGateWithPendingScan,
}) {
  if (!isPaymentCommand(text, lowerText)) return false;

  try {
    const ps = getPaymentState(userId).state;
    const row = await getLatestAwaitingPaymentForLineUserId(userId);
    const slipRow =
      row &&
      (String(row.status) === "awaiting_payment" ||
        String(row.status) === "pending_verify");
    if (
      session.pendingImage &&
      ps !== "awaiting_slip" &&
      !slipRow &&
      !isPaywallGateWithPendingScan
    ) {
      logWaitingBirthdate("guidance", {
        gate: "payment_command_blocked",
        userId,
        hint: "pending_scan_needs_birthdate",
      });
      await sendNonScanSequenceReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "payment_cmd_needs_birthdate",
        semanticKey: "waiting_birthdate_guidance",
        messages: await buildWaitingBirthdateDateFirstGuidanceMessages(userId),
      });
      return true;
    }
  } catch (_) {
    // ignore
  }

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
    await sendNonScanReply({
      client,
      userId,
      replyToken: event.replyToken,
      replyType: "abuse_payment_lock",
      semanticKey: "abuse_payment_lock_pay_cmd",
      text: ABUSE_MSG_PAYMENT_LOCK,
      alternateTexts: [
        "เรื่องชำระเงินส่งถี่ไปหน่อย รอสักครู่แล้วลองใหม่นะครับ",
      ],
    });
    return true;
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
    await sendScanLockReply(client, {
      userId,
      replyToken: event.replyToken,
      lockType: "hard",
      semanticKey: "scan_locked_hard:payment_command",
    });
    return true;
  }

  const offerPay = loadActiveScanOffer();
  const selKey = getSelectedPaymentPackageKey(userId);
  const paidPackage = selKey ? findPackageByKey(offerPay, selKey) : null;

  if (!paidPackage) {
    console.log(
      JSON.stringify({
        event: "PAYMENT_PACKAGE_PROMPT_REASON",
        userId,
        paymentState: null,
        selectedPaymentPackageKey: getSelectedPaymentPackageKey(userId),
        inputText: text,
        reason: "pay_intent_no_package_selected",
      }),
    );
    const humanNoPkg = buildPaymentPayIntentNoPackageHumanText({
      offer: offerPay,
      userId,
    });
    const menuAlt = buildPackageSelectionPromptFromOffer(offerPay);
    await sendNonScanReply({
      client,
      userId,
      replyToken: event.replyToken,
      replyType: "payment_pay_intent_no_package",
      semanticKey: "payment_pay_intent_no_package",
      text: humanNoPkg,
      alternateTexts: [menuAlt],
    });
    logEvent("payment_intent", {
      userId,
      personaVariant: await getAssignedPersonaVariant(userId),
      patternUsed: "need_package_first",
      bubbleCount: 1,
      source: "payment_command",
    });
    return true;
  }

  const currency = env.PAYMENT_UNLOCK_CURRENCY || "THB";
  let cmdPaymentRef = null;
  let cmdPaymentId = null;
  try {
    const appUser = await ensureUserByLineUserId(userId);
    const created = await createPaymentPending({
      appUserId: appUser.id,
      amount: paidPackage.priceThb,
      currency,
      packageCode: paidPackage.key,
      packageName: paidPackage.label,
      expectedAmount: paidPackage.priceThb,
      unlockHours: paidPackage.windowHours,
    });
    cmdPaymentRef = created?.paymentRef ?? null;
    cmdPaymentId = created?.paymentId ?? null;
  } catch (err) {
    console.error("[WEBHOOK] createPaymentPending failed:", {
      userId,
      message: err?.message,
      code: err?.code,
      details: err?.details,
      hint: err?.hint,
    });
  }

  logEvent("payment_intent", {
    userId,
    personaVariant: await getAssignedPersonaVariant(userId),
    patternUsed: null,
    bubbleCount: 1,
    source: "payment_command",
    ...(cmdPaymentId ? { paymentId: cmdPaymentId } : {}),
  });

  if (cmdPaymentId) {
    setAwaitingPayment(userId);
  }

  const qrUrl = getPromptPayQrPublicUrl();
  const intro = buildPaymentQrIntroText({
    paymentRef: cmdPaymentRef,
    paidPackage,
  });
  const slipText = buildPaymentQrSlipText();

  if (isPromptPayQrUrlHttpsForLine(qrUrl)) {
    try {
      await replyPaymentInstructions(client, event.replyToken, {
        introText: intro,
        qrImageUrl: qrUrl,
        slipText,
      });
      await logPaywallShown(userId, {
        patternUsed: "qr_intro_image_slip",
        bubbleCount: 3,
        source: "payment_command",
        ...(cmdPaymentId ? { paymentId: cmdPaymentId } : {}),
      });
      return true;
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

  const payCmdBody = `${buildPaymentInstructionText({
    amount: paidPackage.priceThb,
    currency,
    paymentRef: cmdPaymentRef,
    paidPackage,
  })}\n\n${MAIN_MENU_HINT_TEXT}`;
  await sendNonScanReply({
    client,
    userId,
    replyToken: event.replyToken,
    replyType: "payment_instruction_text",
    semanticKey: "payment_command_text_fallback",
    text: payCmdBody,
    alternateTexts: [
      `${buildPaymentInstructionText({
        amount: paidPackage.priceThb,
        currency,
        paymentRef: cmdPaymentRef,
        paidPackage,
      })}\n\nพิมพ์เมนูหลักได้ตลอดครับ`,
    ],
  });
  await logPaywallShown(userId, {
    patternUsed: "qr_text_fallback",
    bubbleCount: 1,
    source: "payment_command_text",
    ...(cmdPaymentId ? { paymentId: cmdPaymentId } : {}),
  });
  return true;
}

async function replyIdleTextNoDuplicate({ client, replyToken, userId }) {
  const primary = buildIdleDeterministicPrimaryText();
  let personaSoft = null;
  try {
    personaSoft = await buildIdleText(userId);
  } catch (_) {
    personaSoft = null;
  }
  const altPersona =
    String(personaSoft || "").trim() &&
    String(personaSoft).trim() !== primary.trim()
      ? String(personaSoft).trim()
      : null;
  await sendNonScanReply({
    client,
    userId,
    replyToken,
    replyType: "idle_post_scan",
    semanticKey: "idle_post_scan",
    text: primary,
    alternateTexts: [
      ...(altPersona ? [altPersona] : []),
      "มีชิ้นไหนอยากให้ดูต่อก็ส่งมา\nเดี๋ยวไล่ดูให้",
    ],
  });
}

const ABUSE_MSG_PAYMENT_LOCK =
  "ส่งเรื่องชำระเงินถี่ไปหน่อย ขอรอสักครู่แล้วลองใหม่นะครับ";

async function handleHistoryCommand({ client, replyToken, userId }) {
  const history = getScanHistory(userId);

  if (!history.length) {
    await sendNonScanReply({
      client,
      userId,
      replyToken,
      replyType: "history_empty",
      semanticKey: "history_empty",
      text: `${buildNoHistoryText()}\n\n${MAIN_MENU_HINT_TEXT}`,
      alternateTexts: [
        `${buildNoHistoryText()}\n\nลองส่งรูปมาใหม่ได้เลยครับ`,
      ],
    });
    return;
  }

  const formatted = formatHistory(history);
  await sendNonScanReply({
    client,
    userId,
    replyToken,
    replyType: "history_list",
    semanticKey: "history_list",
    text: `ประวัติการสแกนล่าสุด\n\n${formatted}\n\n${MAIN_MENU_HINT_TEXT}`,
    alternateTexts: [
      `ประวัติการสแกน\n\n${formatted}\n\n${MAIN_MENU_HINT_TEXT}`,
    ],
  });
}

async function handleStatsCommand({ client, replyToken, userId }) {
  const stats = getUserStats(userId);

  if (!stats) {
    await sendNonScanReply({
      client,
      userId,
      replyToken,
      replyType: "stats_empty",
      semanticKey: "stats_empty",
      text: buildNoStatsText(),
      alternateTexts: ["ยังไม่มีสถิติสแกนให้แสดงตอนนี้ครับ"],
    });
    return;
  }

  const last = stats.lastScanAt ? formatBangkokDateTime(stats.lastScanAt) : "-";

  await sendNonScanReply({
    client,
    userId,
    replyToken,
    replyType: "stats_list",
    semanticKey: "stats_list",
    text: [
      "สถิติการสแกนของคุณ",
      "",
      `สแกนทั้งหมด: ${stats.totalScans} ครั้ง`,
      `พลังที่พบบ่อย: ${stats.topEnergy}`,
      `คะแนนเฉลี่ย: ${stats.avgScore} / 10`,
      `สแกนล่าสุด: ${last}`,
      "",
      MAIN_MENU_HINT_TEXT,
    ].join("\n"),
    alternateTexts: [
      [
        "สรุปสถิติสแกน",
        "",
        `ทั้งหมด ${stats.totalScans} ครั้ง`,
        `พลังที่เจอบ่อย: ${stats.topEnergy}`,
        `เฉลี่ย ${stats.avgScore} / 10`,
        `ล่าสุด: ${last}`,
        "",
        MAIN_MENU_HINT_TEXT,
      ].join("\n"),
    ],
  });
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
    !accessDecision?.allowed && pendingPayment
      ? "slip"
      : !accessDecision?.allowed &&
          accessDecision?.reason === "payment_required"
        ? "payment_gate"
        : "scan";
  console.log("[IMAGE_ROUTING_DECISION]", {
    userId,
    hasPaidAccess,
    accessReason: accessDecision?.reason ?? null,
    hasAwaitingPayment: Boolean(pendingPayment),
    chosenPath,
  });

  // Fast-exit: when payment is required and there's no awaiting slip row,
  // route directly to package/paywall copy instead of going through object-check.
  if (
    !accessDecision?.allowed &&
    accessDecision?.reason === "payment_required" &&
    !pendingPayment
  ) {
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
      await sendNonScanReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "abuse_payment_lock",
        semanticKey: "abuse_payment_lock_finalize",
        text: ABUSE_MSG_PAYMENT_LOCK,
        alternateTexts: [
          "เรื่องชำระเงินส่งถี่ไปหน่อย รอสักครู่แล้วลองใหม่นะครับ",
        ],
      });
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

    clearLatestScanJob(userId);
    setPendingImage(userId, { messageId: event?.message?.id, imageBuffer }, flowVersion);

    const offer = loadActiveScanOffer();
    const accessContext = resolveScanOfferAccessContext({
      offer,
      decision: accessDecision,
      now: new Date(),
    });
    const strictPaywallReply = buildScanOfferReply({
      offer,
      accessContext,
      gate: { allowed: false, reason: "payment_required" },
      userId: null,
    });
    console.log("[PAYMENT_GATE_REPLY_SELECTION]", {
      userId,
      chosenPath,
      accessAllowed: Boolean(accessDecision?.allowed),
      accessReason: accessDecision?.reason ?? null,
      replyType: strictPaywallReply.replyType,
      copyKey: strictPaywallReply.semanticKey,
      templateKey: strictPaywallReply.replyType,
    });
    await sendNonScanReply({
      client,
      userId,
      replyToken: event.replyToken,
      replyType: strictPaywallReply.replyType,
      semanticKey: strictPaywallReply.semanticKey,
      text: strictPaywallReply.primaryText,
      alternateTexts: strictPaywallReply.alternateTexts,
    });
    await logPaywallShown(userId, {
      patternUsed: "finalize_image_package_prompt",
      bubbleCount: 1,
      source: "finalize_image_payment_required_text_only",
    });
    return;
  }

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
      await sendNonScanReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "abuse_payment_lock",
        semanticKey: "abuse_payment_lock",
        text: ABUSE_MSG_PAYMENT_LOCK,
        alternateTexts: [
          "เรื่องชำระเงินส่งถี่ไปหน่อย รอสักครู่แล้วลองใหม่นะครับ",
        ],
      });
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
      await sendNonScanReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "pending_verify_block_scan",
        semanticKey: "pending_verify_block_scan",
        text: buildPendingVerifyBlockScanText({ userId, paymentRef }),
        alternateTexts: [
          "ตอนนี้รอตรวจสลิปอยู่นะครับ ส่งสลิปหรือรอแอดมินก่อน แล้วค่อยสแกนใหม่ได้",
        ],
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

      await sendNonScanReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "slip_received",
        semanticKey: "slip_received",
        text: buildSlipReceivedText({ paymentRef: slipPaymentRef }),
        alternateTexts: [
          "รับสลิปแล้วครับ รอแอดมินตรวจแป๊บนึงนะครับ",
        ],
      });
      logEvent("slip_uploaded", {
        userId,
        personaVariant: await getAssignedPersonaVariant(userId),
        patternUsed: null,
        bubbleCount: 1,
        paymentId,
      });
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

      await sendNonScanReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "slip_save_failed",
        semanticKey: "slip_save_failed",
        text: "ขออภัยครับ ระบบบันทึกสลิปไม่สำเร็จ กรุณาลองส่งสลิปใหม่อีกครั้ง",
        alternateTexts: [
          "บันทึกสลิปไม่สำเร็จชั่วคราว ลองส่งสลิปใหม่อีกครั้งได้เลยครับ",
        ],
      });
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
    await sendScanLockReply(client, {
      userId,
      replyToken: event.replyToken,
      lockType: "hard",
      semanticKey: "scan_locked_hard:finalize_accepted_image",
    });
    return;
  }

  const isDuplicate = await isDuplicateImage(imageBuffer);

  if (isDuplicate) {
    markAcceptedImageEvent(userId, eventTimestamp);
    clearLatestScanJob(userId);
    clearSessionIfFlowVersionMatches(userId, flowVersion);

    const dupCand = getDuplicateImageReplyCandidates();
    await sendNonScanReply({
      client,
      userId,
      replyToken: event.replyToken,
      replyType: "duplicate_image",
      semanticKey: "duplicate_image",
      text: dupCand[0],
      alternateTexts: dupCand.slice(1),
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

    const c = getMultipleObjectsReplyCandidates();
    await sendNonScanReply({
      client,
      userId,
      replyToken: event.replyToken,
      replyType: "multiple_objects",
      semanticKey: "multiple_objects",
      text: c[0],
      alternateTexts: c.slice(1),
    });
    return;
  }

  if (objectCheck === "unclear") {
    markAcceptedImageEvent(userId, eventTimestamp);
    clearLatestScanJob(userId);
    clearSessionIfFlowVersionMatches(userId, flowVersion);

    const c = getUnclearImageReplyCandidates();
    await sendNonScanReply({
      client,
      userId,
      replyToken: event.replyToken,
      replyType: "unclear_image",
      semanticKey: "unclear_image",
      text: c[0],
      alternateTexts: c.slice(1),
    });
    return;
  }

  if (objectCheck === "unsupported") {
    markAcceptedImageEvent(userId, eventTimestamp);
    clearLatestScanJob(userId);
    clearSessionIfFlowVersionMatches(userId, flowVersion);

    const c = getUnsupportedObjectReplyCandidates();
    await sendNonScanReply({
      client,
      userId,
      replyToken: event.replyToken,
      replyType: "unsupported_object",
      semanticKey: "unsupported_object",
      text: c[0],
      alternateTexts: c.slice(1),
    });
    return;
  }

  if (objectCheck !== "single_supported") {
    markAcceptedImageEvent(userId, eventTimestamp);
    clearLatestScanJob(userId);
    clearSessionIfFlowVersionMatches(userId, flowVersion);

    const c = getUnsupportedObjectReplyCandidates();
    await sendNonScanReply({
      client,
      userId,
      replyToken: event.replyToken,
      replyType: "unsupported_object_fallback",
      semanticKey: "unsupported_object",
      text: c[0],
      alternateTexts: c.slice(1),
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
      await sendNonScanReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "abuse_payment_lock",
        semanticKey: "abuse_payment_lock_finalize",
        text: ABUSE_MSG_PAYMENT_LOCK,
        alternateTexts: [
          "เรื่องชำระเงินส่งถี่ไปหน่อย รอสักครู่แล้วลองใหม่นะครับ",
        ],
      });
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

    // No payment row until user picks a package (49 / 99) and sends จ่ายเงิน.
    clearLatestScanJob(userId);

    // Preserve the scan image candidate so user can continue after approval.
    setPendingImage(userId, { messageId: event?.message?.id, imageBuffer }, flowVersion);

    const offer = loadActiveScanOffer();
    const accessContext = resolveScanOfferAccessContext({
      offer,
      decision: accessDecision,
      now: new Date(),
    });
    const strictPaywallReply = buildScanOfferReply({
      offer,
      accessContext,
      gate: { allowed: false, reason: "payment_required" },
      userId: null,
    });
    console.log("[PAYMENT_GATE_REPLY_SELECTION]", {
      userId,
      chosenPath: "payment_gate_post_object_check",
      accessAllowed: Boolean(accessDecision?.allowed),
      accessReason: accessDecision?.reason ?? null,
      replyType: strictPaywallReply.replyType,
      copyKey: strictPaywallReply.semanticKey,
      templateKey: strictPaywallReply.replyType,
    });
    await sendNonScanReply({
      client,
      userId,
      replyToken: event.replyToken,
      replyType: strictPaywallReply.replyType,
      semanticKey: strictPaywallReply.semanticKey,
      text: strictPaywallReply.primaryText,
      alternateTexts: strictPaywallReply.alternateTexts,
    });
    await logPaywallShown(userId, {
      patternUsed: "finalize_image_package_prompt",
      bubbleCount: 1,
      source: "finalize_image_payment_required_text_only",
    });
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
      skipBirthdateSave: true,
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

  await sendNonScanSequenceReply({
    client,
    userId,
    replyToken: event.replyToken,
    replyType: "start_instruction",
    semanticKey: "start_instruction",
    messages: await buildStartInstructionMessages(userId),
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
    await sendScanLockReply(client, {
      userId,
      replyToken: event.replyToken,
      lockType: "hard",
      semanticKey: "scan_locked_hard:handle_image_after_locked_activity",
    });
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
      await sendNonScanReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "abuse_payment_lock",
        semanticKey: "abuse_payment_lock_image_slip",
        text: ABUSE_MSG_PAYMENT_LOCK,
        alternateTexts: [
          "เรื่องชำระเงินส่งถี่ไปหน่อย รอสักครู่แล้วลองใหม่นะครับ",
        ],
      });
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
      await sendScanLockReply(client, {
        userId,
        replyToken: event.replyToken,
        lockType: "soft",
        semanticKey: "scan_locked_soft:handle_image_scan_route",
      });
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
    await sendNonScanReply({
      client,
      userId,
      replyToken: event.replyToken,
      replyType: "birthdate_update_prompt_image",
      semanticKey: "birthdate_update_prompt",
      text: `${birthdateUpdatePrompt(userId)}\n\n${MAIN_MENU_HINT_TEXT}`,
      alternateTexts: [
        `${birthdateUpdatePrompt(userId)}\n\nพิมพ์วันเกิดใหม่ตามรูปแบบ DD/MM/YYYY ได้เลยครับ`,
      ],
    });
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
        logWaitingBirthdate("second_image_reminder", {
          userId,
          sessionFlowVersion: session.flowVersion || 0,
        });
        await sendNonScanSequenceReply({
          client,
          userId,
          replyToken: event.replyToken,
          replyType: "waiting_birthdate_image_reminder",
          semanticKey: "waiting_birthdate_image_reminder",
          messages: await buildWaitingBirthdateImageReminderMessages(userId),
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

    const multiCandGroup = getMultiImageInRequestReplyCandidates();
    await sendNonScanReply({
      client,
      userId,
      replyToken: event.replyToken,
      replyType: "multi_image_in_request_group",
      semanticKey: "multi_image_in_request",
      text: multiCandGroup[0],
      alternateTexts: multiCandGroup.slice(1),
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

    const multiCand2 = getMultiImageInRequestReplyCandidates();
    await sendNonScanReply({
      client,
      userId,
      replyToken: event.replyToken,
      replyType: "multi_image_burst",
      semanticKey: "multi_image_in_request",
      text: multiCand2[0],
      alternateTexts: multiCand2.slice(1),
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

  if (env.EDGE_GATE_SOFT_VERIFY_ENABLED && isSoftVerifyPending(userId)) {
    if (!isSoftVerifyUnlockText(text)) {
      logConversationCost({
        layer: "layer0_edge",
        aiPath: "edge_gate",
        edgeGateAction: "soft_verify_block",
        userId,
        usedAi: false,
        modelUsed: null,
        replyType: "soft_verify_prompt",
        stateOwner: "soft_verify_gate",
        fallbackToDeterministic: true,
        suppressedDuplicate: false,
        softVerifyTriggered: false,
        softVerifyPassed: false,
      });
      await sendNonScanReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "soft_verify_prompt",
        semanticKey: "soft_verify_prompt",
        text: "ก่อนคุยต่อ พิมพ์ ยืนยัน ได้เลยครับ",
        alternateTexts: [
          "ถ้าต้องการใช้งานต่อ พิมพ์ เริ่ม ได้เลยครับ",
        ],
      });
      return;
    }
    clearSoftVerifyPending(userId);
    logConversationCost({
      layer: "layer0_edge",
      aiPath: "edge_gate",
      edgeGateAction: "soft_verify_passed",
      userId,
      usedAi: false,
      modelUsed: null,
      replyType: null,
      stateOwner: "soft_verify_gate",
      fallbackToDeterministic: true,
      suppressedDuplicate: false,
      softVerifyTriggered: false,
      softVerifyPassed: true,
    });
  }

  const messageId = event.message?.id ?? null;
  const edge = evaluateTextEdgeGate({ userId, messageId, text, now });
  if (edge.action === "drop_duplicate_event") {
    logConversationCost({
      layer: "layer0_edge",
      aiPath: "edge_gate",
      edgeGateAction: "drop_duplicate_event",
      userId,
      messageId: edge.messageId ?? null,
      suppressedDuplicate: true,
      usedAi: false,
      modelUsed: null,
      replyType: null,
      stateOwner: null,
      fallbackToDeterministic: true,
      softVerifyTriggered: false,
      softVerifyPassed: false,
    });
    return;
  }
  if (edge.action === "ignore_empty") {
    logConversationCost({
      layer: "layer0_edge",
      aiPath: "edge_gate",
      edgeGateAction: "ignore_empty",
      userId,
      usedAi: false,
      modelUsed: null,
      replyType: null,
      stateOwner: null,
      fallbackToDeterministic: true,
      suppressedDuplicate: false,
      softVerifyTriggered: false,
      softVerifyPassed: false,
    });
    return;
  }
  if (edge.action === "suppress_identical_inbound") {
    logConversationCost({
      layer: "layer0_edge",
      aiPath: "edge_gate",
      edgeGateAction: "suppress_identical_inbound",
      userId,
      suppressedDuplicate: true,
      usedAi: false,
      modelUsed: null,
      replyType: null,
      stateOwner: null,
      fallbackToDeterministic: true,
      repeatHint: edge.repeatHint ?? null,
      softVerifyTriggered: false,
      softVerifyPassed: false,
    });
    return;
  }

  const textSpam = registerTextEvent(userId, text, now);

  if (textSpam.state.isHardBlocked) {
    console.warn("[ABUSE_GUARD_HARD_BLOCK]", { userId, source: "text_register" });
    await sendScanLockReply(client, {
      userId,
      replyToken: event.replyToken,
      lockType: "hard",
      semanticKey: "scan_locked_hard:text_register",
    });
    return;
  }

  if (isLineStickerPlaceholderText(text)) {
    await handleStickerLikeInput({
      client,
      event,
      userId,
      session,
      source: "placeholder_text",
    });
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

  // Active-state routing hardening:
  // Deterministic state ownership decides the turn (replyType / semanticKey).
  // Persona / content pools must not choose branches — only soften wording (e.g. idle alternates).
  // Generic menu/idle runs only when no interactive session still owns the turn.
  let activeAccessDecision = null;
  let activePendingPaymentRow = null;
  try {
    activeAccessDecision = await checkScanAccess({ userId });
  } catch (err) {
    console.error("[ACTIVE_STATE_ROUTING] checkScanAccess failed (ignored):", {
      userId,
      message: err?.message,
      code: err?.code,
    });
  }
  try {
    activePendingPaymentRow = await getLatestAwaitingPaymentForLineUserId(userId);
  } catch (err) {
    console.error("[ACTIVE_STATE_ROUTING] pending payment lookup failed (ignored):", {
      userId,
      message: err?.message,
      code: err?.code,
    });
  }

  const paymentMemoryState = getPaymentState(userId).state;
  const pendingStatus = String(activePendingPaymentRow?.status || "").trim();
  const hasPendingVerify = pendingStatus === "pending_verify";
  const hasAwaitingSlip = pendingStatus === "awaiting_payment";
  const accessState = activeAccessDecision?.allowed
    ? activeAccessDecision?.reason === "paid"
      ? "paid_active"
      : "free_available"
    : activeAccessDecision?.reason || "payment_required";
  /** User exhausted free quota, saw paywall, pending scan image — package text must not go to birthdate flow. */
  const isPaywallGateWithPendingScan =
    Boolean(session.pendingImage) &&
    activeAccessDecision != null &&
    !activeAccessDecision.allowed &&
    activeAccessDecision.reason === "payment_required";
  const flowState = session.pendingImage ? "waiting_birthdate" : "idle";
  let paymentState = "none";
  if (hasPendingVerify) {
    paymentState = "pending_verify";
  } else if (hasAwaitingSlip || paymentMemoryState === "awaiting_slip") {
    paymentState = "awaiting_slip";
  } else if (
    !activeAccessDecision?.allowed &&
    activeAccessDecision?.reason === "payment_required" &&
    session.pendingImage
  ) {
    paymentState = "paywall_selecting_package";
  } else if (activeAccessDecision?.allowed && activeAccessDecision?.reason === "paid") {
    paymentState = "approved_intro";
  }

  const selectedPkgKeyForOwner = getSelectedPaymentPackageKey(userId);
  let conversationOwner = "idle";
  if (hasPendingVerify) {
    conversationOwner = "pending_verify";
  } else if (hasAwaitingSlip || paymentMemoryState === "awaiting_slip") {
    conversationOwner = "awaiting_slip";
  } else if (
    !activeAccessDecision?.allowed &&
    activeAccessDecision?.reason === "payment_required" &&
    session.pendingImage
  ) {
    conversationOwner = selectedPkgKeyForOwner
      ? "payment_package_selected"
      : "paywall_selecting_package";
  } else if (activeAccessDecision?.allowed && activeAccessDecision?.reason === "paid") {
    conversationOwner = "paid_active_scan_ready";
  } else if (flowState === "waiting_birthdate" && paymentState === "none") {
    conversationOwner = "waiting_birthdate";
  }

  if (
    flowState === "waiting_birthdate" &&
    ["paywall_selecting_package", "awaiting_slip", "pending_verify"].includes(
      paymentState,
    )
  ) {
    console.log("[STATE_CONFLICT_RESOLVED]", {
      userId,
      previousFlowState: "waiting_birthdate",
      previousPaymentState: paymentState,
      nextFlowState: "suspended_by_payment_state",
      nextPaymentState: paymentState,
      reason: "payment_state_wins",
    });
  }

  if (paymentState === "paywall_selecting_package") {
    const offer = loadActiveScanOffer();
    const pickedKey = parsePackageSelectionFromText(text, offer);
    const selectedKey = getSelectedPaymentPackageKey(userId);

    if (pickedKey && selectedKey && pickedKey === selectedKey) {
      const pkg = findPackageByKey(offer, pickedKey);
      const human = buildPackageAlreadySelectedContinueHuman(pkg);
      console.log("[ACTIVE_STATE_ROUTING]", {
        userId,
        flowState,
        paymentState,
        accessState,
        conversationOwner,
        stateOwner: conversationOwner,
        replyFamily: "paywall",
        selectedPaymentPackageKey: selectedKey,
        expectedInputType: "pay_intent_or_package_change",
        text,
        chosenReplyType: "payment_package_selected",
        routeReason: "same_package_reselected_stay_in_flow",
      });
      console.log("[UNEXPECTED_INPUT_HANDLED]", {
        userId,
        activeState: paymentState,
        inputText: text,
        normalizedIntent: "package_already_selected",
        chosenReplyType: "payment_package_selected",
      });
      await sendNonScanReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "payment_package_selected",
        semanticKey: "payment_package_already_selected",
        text: human,
        alternateTexts: [
          "ถ้าพร้อมโอน พิมพ์ จ่ายเงิน ได้เลยครับ",
          buildPaymentPackageSelectedAck(pkg),
        ],
      });
      return;
    }

    if (pickedKey) {
      console.log("[ACTIVE_STATE_ROUTING]", {
        userId,
        flowState,
        paymentState,
        accessState,
        conversationOwner,
        stateOwner: conversationOwner,
        replyFamily: "paywall",
        expectedInputType: "package_selection",
        text,
        chosenReplyType: "payment_package_selected",
        routeReason: "accepted_package_selection",
      });
      console.log("[STATE_CONFLICT_RESOLVED]", {
        userId,
        previousFlowState: flowState,
        previousPaymentState: paymentState,
        nextFlowState: "package_selected_pending_pay_command",
        nextPaymentState: paymentState,
        reason:
          "package_selection_consumed_turn_payment_wins_over_waiting_birthdate",
      });
      setSelectedPaymentPackageKey(userId, pickedKey);
      const pkg = findPackageByKey(offer, pickedKey);
      console.log(
        JSON.stringify({
          event: "PAYMENT_PACKAGE_SELECTED",
          lineUserId: userId,
          packageKey: pickedKey,
          priceThb: pkg?.priceThb ?? null,
          scanCount: pkg?.scanCount ?? null,
          windowHours: pkg?.windowHours ?? null,
          source: "paywall_selecting_package_text_route",
        }),
      );
      const ack = buildPaymentPackageSelectedAck(pkg);
      await sendNonScanReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "payment_package_selected",
        semanticKey: "payment_package_selected",
        text: ack,
        alternateTexts: [buildPackageSelectionPromptFromOffer(offer)],
      });
      return;
    }

    if (selectedKey && isPaymentCommand(text, lowerText)) {
      console.log(
        JSON.stringify({
          event: "PAYMENT_PAY_INTENT_CONSUMED",
          userId,
          paymentState,
          selectedPaymentPackageKey: selectedKey,
          inputText: text,
          action: "create_or_show_payment_qr",
        }),
      );
      await handlePaymentCommandTextRoute({
        client,
        event,
        userId,
        session,
        text,
        lowerText,
        isPaywallGateWithPendingScan,
      });
      return;
    }

    const selectedForPrompt = selectedKey;
    let guidanceReason = "unexpected_input_not_package_selection";
    let chosenReplyType = "payment_package_prompt";
    let semanticKey = "payment_need_package_first";
    let primaryText = buildPaywallHumanGuidanceText({
      offer,
      userId,
      guidanceReason: "unexpected",
    });
    const menuCompact = buildPackageSelectionPromptFromOffer(offer);

    if (isPaymentCommand(text, lowerText) && !selectedForPrompt) {
      chosenReplyType = "payment_pay_intent_no_package";
      semanticKey = "payment_pay_intent_no_package";
      guidanceReason = "pay_intent_no_package_selected";
      primaryText = buildPaywallHumanGuidanceText({
        offer,
        userId,
        guidanceReason: "pay_intent_no_package",
      });
    } else if (looksLikeBirthdateInput(text)) {
      chosenReplyType = "payment_package_prompt";
      semanticKey = "paywall_birthdate_deferred";
      guidanceReason = "birthdate_like_while_selecting_package";
      primaryText = buildPaywallHumanGuidanceText({
        offer,
        userId,
        guidanceReason: "birthdate_deferred",
      });
    }

    console.log(
      JSON.stringify({
        event: "PAYMENT_PACKAGE_PROMPT_REASON",
        userId,
        paymentState,
        conversationOwner,
        selectedPaymentPackageKey: selectedForPrompt,
        inputText: text,
        reason: guidanceReason,
      }),
    );
    console.log("[UNEXPECTED_INPUT_HANDLED]", {
      userId,
      activeState: paymentState,
      inputText: text,
      normalizedIntent: "unexpected_for_package_selection",
      chosenReplyType,
      guidanceReason,
    });
    console.log("[ACTIVE_STATE_ROUTING]", {
      userId,
      flowState,
      paymentState,
      accessState,
      conversationOwner,
      stateOwner: conversationOwner,
      replyFamily: "paywall",
      guidanceReason,
      selectedPaymentPackageKey: selectedForPrompt,
      expectedInputType: "package_selection",
      text,
      chosenReplyType,
      routeReason: "unexpected_input_kept_in_state",
    });
    await sendNonScanReply({
      client,
      userId,
      replyToken: event.replyToken,
      replyType: chosenReplyType,
      semanticKey,
      text: primaryText,
      alternateTexts: [menuCompact],
    });
    return;
  }

  if (paymentState === "awaiting_slip") {
    let paymentRef = null;
    try {
      if (activePendingPaymentRow?.id) {
        paymentRef =
          activePendingPaymentRow.payment_ref ||
          (await ensurePaymentRefForPaymentId(activePendingPaymentRow.id));
      }
    } catch (_) {
      paymentRef = null;
    }
    const slipReminder = await buildAwaitingSlipReminderText({
      userId,
      paymentRef,
    });
    console.log("[UNEXPECTED_INPUT_HANDLED]", {
      userId,
      activeState: paymentState,
      inputText: text,
      normalizedIntent: "awaiting_slip_guidance",
      chosenReplyType: "awaiting_slip_guidance",
    });
    console.log("[ACTIVE_STATE_ROUTING]", {
      userId,
      flowState,
      paymentState,
      accessState,
      conversationOwner,
      stateOwner: conversationOwner,
      replyFamily: "awaiting_slip",
      expectedInputType: "slip_image_or_slip_status",
      text,
      chosenReplyType: "awaiting_slip_guidance",
      routeReason: "awaiting_slip_text_guard",
    });
    await sendNonScanReply({
      client,
      userId,
      replyToken: event.replyToken,
      replyType: "awaiting_slip_guidance",
      semanticKey: "awaiting_slip_guidance",
      text: slipReminder,
      alternateTexts: [
        "ส่งรูปสลิปในแชตนี้ได้เลยครับ",
        "ถ้าต้องการดูคิวอาร์อีกครั้ง พิมพ์ จ่ายเงิน ได้เลยครับ",
      ],
    });
    return;
  }

  if (paymentState === "pending_verify") {
    let paymentRef = null;
    try {
      if (activePendingPaymentRow?.id) {
        paymentRef =
          activePendingPaymentRow.payment_ref ||
          (await ensurePaymentRefForPaymentId(activePendingPaymentRow.id));
      }
    } catch (_) {
      paymentRef = null;
    }
    const isStatusLike = /สถานะ|คืบหน้า|รอ|ตรวจ|อนุมัติ|pending/i.test(text);
    const pendingText = buildPendingVerifyHumanGuidanceText({ paymentRef });
    const pvReplyType = isStatusLike
      ? "pending_verify_status"
      : "pending_verify_guidance";
    const pvSemantic = isStatusLike
      ? "pending_verify_status"
      : "pending_verify_guidance";
    console.log("[UNEXPECTED_INPUT_HANDLED]", {
      userId,
      activeState: paymentState,
      inputText: text,
      normalizedIntent: isStatusLike
        ? "status_like_pending_verify"
        : "unexpected_pending_verify",
      chosenReplyType: pvReplyType,
    });
    console.log("[ACTIVE_STATE_ROUTING]", {
      userId,
      flowState,
      paymentState,
      accessState,
      conversationOwner,
      stateOwner: conversationOwner,
      replyFamily: "pending_verify",
      expectedInputType: "status_like",
      text,
      chosenReplyType: pvReplyType,
      routeReason: "pending_verify_text_guard",
    });
    await sendNonScanReply({
      client,
      userId,
      replyToken: event.replyToken,
      replyType: pvReplyType,
      semanticKey: pvSemantic,
      text: pendingText,
      alternateTexts: [
        "รอแจ้งผลในแชตนี้ได้เลยครับ",
        buildPendingVerifyReminderText({ paymentRef }),
      ],
    });
    return;
  }

  if (flowState === "waiting_birthdate" && paymentState === "none") {
    const parsedEarly = parseBirthdateInput(text);
    if (parsedEarly.ok) {
      console.log("[ACTIVE_STATE_ROUTING]", {
        userId,
        flowState,
        paymentState,
        accessState,
        expectedInputType: "birthdate_dd_mm_yyyy",
        text,
        chosenReplyType: "waiting_birthdate_accepted",
        routeReason: "accepted_birthdate",
      });
      // Continue to existing waiting_birthdate branch below.
    } else {
      const isDateLike = looksLikeBirthdateInput(text);
      const guidanceMsgs = await buildWaitingBirthdateDateFirstGuidanceMessages(userId);
      const errMsgs = await buildBirthdateErrorMessages(userId, parsedEarly.reason);
      console.log("[UNEXPECTED_INPUT_HANDLED]", {
        userId,
        activeState: flowState,
        inputText: text,
        normalizedIntent: isDateLike ? "invalid_date_like" : "non_date_like",
        chosenReplyType: isDateLike
          ? "waiting_birthdate_error"
          : "waiting_birthdate_guidance",
      });
      console.log("[ACTIVE_STATE_ROUTING]", {
        userId,
        flowState,
        paymentState,
        accessState,
        expectedInputType: "birthdate_dd_mm_yyyy",
        text,
        chosenReplyType: isDateLike
          ? "waiting_birthdate_error"
          : "waiting_birthdate_guidance",
        routeReason: "unexpected_input_kept_in_state",
      });
      await sendNonScanSequenceReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: isDateLike
          ? "waiting_birthdate_error"
          : "waiting_birthdate_guidance",
        semanticKey: isDateLike
          ? "birthdate_error_waiting_scan"
          : "waiting_birthdate_guidance",
        messages: isDateLike ? errMsgs : guidanceMsgs,
      });
      return;
    }
  }

  if (paymentState === "approved_intro") {
    if (
      !isHistoryCommand(text, lowerText) &&
      !isStatsCommand(text, lowerText) &&
      !isMainMenuAlias(text, lowerText) &&
      !isPaymentCommand(text, lowerText) &&
      text !== "เปลี่ยนวันเกิด" &&
      text !== "สแกนพลังงาน"
    ) {
      const scanReadyText = buildPaidActiveScanReadyHumanText(userId);
      console.log("[ACTIVE_STATE_ROUTING]", {
        userId,
        flowState,
        paymentState,
        accessState,
        conversationOwner,
        stateOwner: conversationOwner,
        replyFamily: "paid_active",
        expectedInputType: "object_image",
        text,
        chosenReplyType: "scan_ready_guidance",
        routeReason: "paid_active_scan_ready_guidance",
      });
      await sendNonScanReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "scan_ready_guidance",
        semanticKey: "scan_ready_guidance",
        text: scanReadyText,
        alternateTexts: [
          "ส่งรูปวัตถุที่ต้องการสแกน 1 รูปได้เลยครับ",
          "ส่งรูปมา 1 รูป เดี๋ยวผมอ่านให้",
        ],
      });
      return;
    }
  }

  // --- STATE-FIRST: awaiting_slip → pending_verify → awaitingBirthdateUpdate → waiting_birthdate ---

  // 1) awaiting_slip (strict: any non-payment text stays in slip flow)
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
    const slipRem = await buildAwaitingSlipReminderText({ userId, paymentRef });
    await sendNonScanReply({
      client,
      userId,
      replyToken: event.replyToken,
      replyType: "awaiting_slip_guidance",
      semanticKey: "awaiting_slip_guidance",
      text: slipRem,
      alternateTexts: [
        "รอสลิปโอนอยู่นะครับ ส่งสลิปมาในแชทนี้ได้เลย",
      ],
    });
    return;
  }

  // 2) pending_verify — payment cmd / lock / utility passthrough handled next
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
        await sendNonScanReply({
          client,
          userId,
          replyToken: event.replyToken,
          replyType: "pending_verify_payment_cmd",
          semanticKey: "pending_verify_payment_cmd",
          text: buildPendingVerifyPaymentCommandText({ userId, paymentRef }),
          alternateTexts: [
            "รอแอดมินตรวจสลิปก่อนนะครับ ถ้ายังไม่ได้ส่งสลิป ส่งมาได้เลย",
          ],
        });
        return;
      }
      if (!allowsUtilityCommandsDuringPendingVerify(text, lowerText)) {
        const pvRem = buildPendingVerifyReminderText({
          userId,
          paymentRef,
        });
        await sendNonScanReply({
          client,
          userId,
          replyToken: event.replyToken,
          replyType: "pending_verify_reminder",
          semanticKey: "pending_verify_reminder",
          text: pvRem,
          alternateTexts: [
            "รอตรวจสลิปแป๊บนึงนะครับ แจ้งแอดมินถ้ารอนานเกินไป",
          ],
        });
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

  // 2c) pending_verify — allowed utility commands (before birthdate lock)
  try {
    const pvForUtility = await getLatestAwaitingPaymentForLineUserId(userId);
    if (pvForUtility && String(pvForUtility.status) === "pending_verify") {
      if (allowsUtilityCommandsDuringPendingVerify(text, lowerText)) {
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
        if (text === "เปลี่ยนวันเกิด") {
          setAwaitingBirthdateUpdate(userId, true);
          await sendNonScanReply({
            client,
            userId,
            replyToken: event.replyToken,
            replyType: "birthdate_update_prompt_pending_verify",
            semanticKey: "birthdate_update_prompt",
            text: `${birthdateUpdatePrompt(userId)}\n\n${MAIN_MENU_HINT_TEXT}`,
            alternateTexts: [
              `${birthdateUpdatePrompt(userId)}\n\nพิมพ์วันเกิดใหม่เป็น DD/MM/YYYY ได้เลยครับ`,
            ],
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
          await sendNonScanReply({
            client,
            userId,
            replyToken: event.replyToken,
            replyType: "scan_energy_helper_pending_verify",
            semanticKey: "scan_energy_helper",
            text: helperText,
            alternateTexts: [
              "ส่งรูปวัตถุ 1 รูปมาได้เลยครับ แล้วตามด้วยวันเกิดถ้าระบบถาม",
            ],
          });
          return;
        }
        if (text === "วิธีใช้" || text === "วิธีใช้งาน") {
          const usage = [
            "วิธีใช้งาน Ener Scan",
            "",
            "1) ส่งรูปวัตถุที่ต้องการสแกน",
            "2) ระบบให้พิมพ์วันเกิด (DD/MM/YYYY)",
            "3) ระบบจะส่งผลการสแกนกลับมาในแชทนี้",
            "",
            "หากหมดสิทธิ์ฟรี: พิมพ์ 49 หรือ 99 เลือกแพ็ก แล้วพิมพ์ จ่ายเงิน",
            "",
            MAIN_MENU_HINT_TEXT,
          ].join("\n");
          await sendNonScanReply({
            client,
            userId,
            replyToken: event.replyToken,
            replyType: "usage_help_pending_verify",
            semanticKey: "usage_help",
            text: usage,
            alternateTexts: [
              [
                "สรุปวิธีใช้",
                "",
                "ส่งรูป 1 รูป → พิมพ์วันเกิด DD/MM/YYYY → รอผลในแชท",
                "",
                MAIN_MENU_HINT_TEXT,
              ].join("\n"),
            ],
          });
          return;
        }
        if (isMainMenuAlias(text, lowerText)) {
          await replyIdleTextNoDuplicate({
            client,
            replyToken: event.replyToken,
            userId,
          });
          return;
        }
      }
    }
  } catch (pvUtilErr) {
    console.error("[WEBHOOK] pending_verify utility branch failed (ignored):", {
      userId,
      message: pvUtilErr?.message,
    });
  }

  // 3) awaiting birthdate update (profile)
  if (session.awaitingBirthdateUpdate) {
    if (text === "เปลี่ยนวันเกิด") {
      await sendNonScanReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "birthdate_update_prompt_repeat",
        semanticKey: "birthdate_update_prompt",
        text: `${birthdateUpdatePrompt(userId)}\n\n${MAIN_MENU_HINT_TEXT}`,
        alternateTexts: [
          `${birthdateUpdatePrompt(userId)}\n\nพิมพ์วันเกิดใหม่เป็น DD/MM/YYYY ได้เลยครับ`,
        ],
      });
      return;
    }

    const parsedBd = parseBirthdateInput(text);
    if (!parsedBd.ok) {
      console.log("[BIRTHDATE_UPDATE] invalid", {
        userId,
        text,
        reason: parsedBd.reason,
      });
      if (looksLikeBirthdateInput(text)) {
        logWaitingBirthdate("invalid_date_attempt", {
          gate: "birthdate_update_profile",
          userId,
          reason: parsedBd.reason,
        });
      } else {
        logWaitingBirthdate("guidance", {
          gate: "birthdate_update_profile",
          userId,
          hint: "non_date_like",
        });
      }
      if (looksLikeBirthdateInput(text)) {
        const errMsgs = await buildBirthdateErrorMessages(userId, parsedBd.reason);
        if (errMsgs.length) {
          errMsgs[errMsgs.length - 1] = `${errMsgs[errMsgs.length - 1]}\n\n${MAIN_MENU_HINT_TEXT}`;
        }
        await sendNonScanSequenceReply({
          client,
          userId,
          replyToken: event.replyToken,
          replyType: "birthdate_update_error",
          semanticKey: "birthdate_error_profile",
          messages: errMsgs,
        });
        return;
      }
      const gMsgs = await buildWaitingBirthdateDateFirstGuidanceMessages(userId);
      if (gMsgs.length) {
        gMsgs[gMsgs.length - 1] = `${gMsgs[gMsgs.length - 1]}\n\n${MAIN_MENU_HINT_TEXT}`;
      }
      await sendNonScanSequenceReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "birthdate_update_guidance",
        semanticKey: "birthdate_guidance_profile",
        messages: gMsgs.length
          ? gMsgs
          : [`${await buildWaitingBirthdateGuidanceText(userId)}\n\n${MAIN_MENU_HINT_TEXT}`],
      });
      return;
    }

    const normalizedBirthdate = parsedBd.normalizedDisplay;
    await saveBirthdate(userId, normalizedBirthdate);

    clearAwaitingBirthdateUpdate(userId);
    logWaitingBirthdate("accepted", {
      gate: "birthdate_update_profile",
      userId,
      yearCE: parsedBd.yearCE,
      isoDate: parsedBd.isoDate,
      normalizedDisplay: normalizedBirthdate,
    });
    console.log("[BIRTHDATE_UPDATE] saved", {
      userId,
      birthdate: normalizedBirthdate,
    });

    await sendNonScanReply({
      client,
      userId,
      replyToken: event.replyToken,
      replyType: "birthdate_saved_profile",
      semanticKey: "birthdate_saved",
      text: `${birthdateSavedAfterUpdate(userId, normalizedBirthdate)}\n\n${MAIN_MENU_HINT_TEXT}`,
      alternateTexts: [
        `${birthdateSavedAfterUpdate(userId, normalizedBirthdate)}\n\nพิมพ์เมนูหลักได้ตลอดครับ`,
      ],
    });
    return;
  }

  // 4) waiting_birthdate (pending scan image; includes awaiting_payment slip reminder branch)
  try {
    const paymentState = getPaymentState(userId).state;
    const pendingPayRow = await getLatestAwaitingPaymentForLineUserId(userId);
    const hasAwaitingPaymentRow =
      pendingPayRow && String(pendingPayRow.status) === "awaiting_payment";

    if (
      session.pendingImage &&
      paymentState !== "awaiting_slip" &&
      !isPaywallGateWithPendingScan
    ) {
      if (hasAwaitingPaymentRow) {
        let paymentRef = null;
        try {
          if (pendingPayRow?.id) {
            paymentRef =
              pendingPayRow.payment_ref ||
              (await ensurePaymentRefForPaymentId(pendingPayRow.id));
          }
        } catch (_) {
          paymentRef = null;
        }
        const slipRem2 = await buildAwaitingSlipReminderText({
          userId,
          paymentRef,
        });
        await sendNonScanReply({
          client,
          userId,
          replyToken: event.replyToken,
          replyType: "awaiting_slip_reminder_waiting_bd",
          semanticKey: "awaiting_slip_reminder",
          text: slipRem2,
          alternateTexts: [
            "รอสลิปโอนอยู่นะครับ ส่งสลิปมาในแชทนี้ได้เลย",
          ],
        });
        return;
      }

      if (text === "เปลี่ยนวันเกิด") {
        setAwaitingBirthdateUpdate(userId, true);
        await sendNonScanReply({
          client,
          userId,
          replyToken: event.replyToken,
          replyType: "birthdate_update_prompt_waiting_bd",
          semanticKey: "birthdate_update_prompt",
          text: `${birthdateUpdatePrompt(userId)}\n\n${MAIN_MENU_HINT_TEXT}`,
          alternateTexts: [
            `${birthdateUpdatePrompt(userId)}\n\nพิมพ์วันเกิดใหม่เป็น DD/MM/YYYY ได้เลยครับ`,
          ],
        });
        return;
      }

      const parsedLock = parseBirthdateInput(text);
      if (parsedLock.ok) {
        const flowVersion = session.flowVersion || 0;
        const normalizedBirthdate = parsedLock.normalizedDisplay;

        const scanGateNow = Date.now();
        const scanGateFromText = checkScanAbuseStatus(userId, scanGateNow);
        console.log("[ABUSE_GUARD_SCAN_STATUS]", {
          userId,
          gate: "waiting_birthdate",
          ...scanGateFromText,
        });
        if (scanGateFromText.isLocked) {
          console.warn("[ABUSE_GUARD_SCAN_LOCK]", {
            userId,
            lockUntil: scanGateFromText.lockUntil,
            gate: "waiting_birthdate",
          });
          await sendScanLockReply(client, {
            userId,
            replyToken: event.replyToken,
            lockType: "soft",
            semanticKey: "scan_locked_soft:waiting_birthdate",
          });
          return;
        }

        logWaitingBirthdate("accepted", {
          gate: "waiting_birthdate",
          userId,
          yearCE: parsedLock.yearCE,
          isoDate: parsedLock.isoDate,
          normalizedDisplay: normalizedBirthdate,
        });
        try {
          await sendNonScanSequenceReply({
            client,
            userId,
            replyToken: null,
            replyType: "before_scan_sequence",
            semanticKey: "before_scan_sequence",
            messages: await beforeScanMessageSequence(userId),
          });
        } catch (beforeScanErr) {
          console.error("[LINE] before_scan push failed (ignored):", {
            userId,
            message: beforeScanErr?.message,
          });
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

      const offerBd = loadActiveScanOffer();
      if (
        parsePackageSelectionFromText(text, offerBd) ||
        isPaymentCommand(text, lowerText)
      ) {
        logWaitingBirthdate("guidance", {
          gate: "waiting_birthdate",
          userId,
          hint: "payment_or_package_deferred",
        });
        console.log("[ACTIVE_STATE_ROUTING]", {
          userId,
          flowState,
          paymentState,
          accessState,
          conversationOwner: "waiting_birthdate",
          expectedInputType: "date_like",
          text,
          chosenReplyType: "waiting_birthdate_guidance",
          routeReason: "package_or_pay_deferred_date_first",
        });
        await sendNonScanSequenceReply({
          client,
          userId,
          replyToken: event.replyToken,
          replyType: "waiting_birthdate_guidance",
          semanticKey: "waiting_birthdate_guidance",
          messages: await buildWaitingBirthdateDateFirstGuidanceMessages(userId),
        });
        return;
      }

      if (looksLikeBirthdateInput(text)) {
        logWaitingBirthdate("invalid_date_attempt", {
          gate: "waiting_birthdate",
          userId,
          reason: parsedLock.reason,
        });
        await sendNonScanSequenceReply({
          client,
          userId,
          replyToken: event.replyToken,
          replyType: "waiting_birthdate_error",
          semanticKey: "birthdate_error_waiting_scan",
          messages: await buildBirthdateErrorMessages(userId, parsedLock.reason),
        });
        return;
      }

      if (isBlockedIntentDuringWaitingBirthdate(text, lowerText)) {
        logWaitingBirthdate("guidance", {
          gate: "waiting_birthdate",
          userId,
          hint: "blocked_intent",
        });
        await sendNonScanSequenceReply({
          client,
          userId,
          replyToken: event.replyToken,
          replyType: "waiting_birthdate_guidance_blocked",
          semanticKey: "waiting_birthdate_guidance",
          messages: await buildWaitingBirthdateDateFirstGuidanceMessages(userId),
        });
        return;
      }

      logWaitingBirthdate("guidance", {
        gate: "waiting_birthdate",
        userId,
        hint: "default",
      });
      await sendNonScanSequenceReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "waiting_birthdate_guidance",
        semanticKey: "waiting_birthdate_guidance",
        messages: await buildWaitingBirthdateDateFirstGuidanceMessages(userId),
      });
      return;
    }
  } catch (birthLockErr) {
    console.error("[WEBHOOK] waiting_birthdate branch failed:", {
      userId,
      message: birthLockErr?.message,
    });
    if (session.pendingImage) {
      try {
        const msgs = await buildWaitingBirthdateDateFirstGuidanceMessages(userId);
        console.log("[ACTIVE_STATE_ROUTING]", {
          userId,
          flowState: "waiting_birthdate",
          paymentState,
          accessState,
          conversationOwner: "waiting_birthdate",
          expectedInputType: "date_like",
          text,
          chosenReplyType: "waiting_birthdate_guidance",
          routeReason: "waiting_birthdate_branch_error_guard",
        });
        await sendNonScanSequenceReply({
          client,
          userId,
          replyToken: event.replyToken,
          replyType: "waiting_birthdate_guidance",
          semanticKey: "waiting_birthdate_guidance",
          messages: msgs,
        });
      } catch (_) {
        /* ignore */
      }
      return;
    }
  }

  // 5) explicit commands (no active lock above)
  if (text === "เปลี่ยนวันเกิด") {
    console.log("[BIRTHDATE_UPDATE] requested", { userId });
    setAwaitingBirthdateUpdate(userId, true);
    await sendNonScanReply({
      client,
      userId,
      replyToken: event.replyToken,
      replyType: "birthdate_update_prompt_open",
      semanticKey: "birthdate_update_prompt",
      text: `${birthdateUpdatePrompt(userId)}\n\n${MAIN_MENU_HINT_TEXT}`,
      alternateTexts: [
        `${birthdateUpdatePrompt(userId)}\n\nพิมพ์วันเกิดใหม่เป็น DD/MM/YYYY ได้เลยครับ`,
      ],
    });
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

  const offerPick = loadActiveScanOffer();
  const pickedKey = parsePackageSelectionFromText(text, offerPick);
  if (pickedKey) {
    try {
      const ps = getPaymentState(userId).state;
      const row = await getLatestAwaitingPaymentForLineUserId(userId);
      const slipRow =
        row &&
        (String(row.status) === "awaiting_payment" ||
          String(row.status) === "pending_verify");
      if (
        session.pendingImage &&
        ps !== "awaiting_slip" &&
        !slipRow &&
        !isPaywallGateWithPendingScan
      ) {
        logWaitingBirthdate("guidance", {
          gate: "package_pick_blocked",
          userId,
          hint: "pending_scan_needs_birthdate",
        });
        await sendNonScanSequenceReply({
          client,
          userId,
          replyToken: event.replyToken,
          replyType: "payment_cmd_needs_birthdate",
          semanticKey: "waiting_birthdate_guidance",
          messages: await buildWaitingBirthdateDateFirstGuidanceMessages(userId),
        });
        return;
      }
    } catch (_) {
      /* ignore */
    }

    const alreadySelectedKey = getSelectedPaymentPackageKey(userId);
    if (alreadySelectedKey && pickedKey === alreadySelectedKey) {
      const pkg = findPackageByKey(offerPick, pickedKey);
      const human = buildPackageAlreadySelectedContinueHuman(pkg);
      await sendNonScanReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "payment_package_selected",
        semanticKey: "payment_package_already_selected",
        text: human,
        alternateTexts: [
          "ถ้าพร้อมโอน พิมพ์ จ่ายเงิน ได้เลยครับ",
          buildPaymentPackageSelectedAck(pkg),
        ],
      });
      return;
    }

    setSelectedPaymentPackageKey(userId, pickedKey);
    const pkg = findPackageByKey(offerPick, pickedKey);
    console.log(
      JSON.stringify({
        event: "PAYMENT_PACKAGE_SELECTED",
        lineUserId: userId,
        packageKey: pickedKey,
        priceThb: pkg?.priceThb ?? null,
        scanCount: pkg?.scanCount ?? null,
        windowHours: pkg?.windowHours ?? null,
      }),
    );
    const ack = buildPaymentPackageSelectedAck(pkg);
    await sendNonScanReply({
      client,
      userId,
      replyToken: event.replyToken,
      replyType: "payment_package_selected",
      semanticKey: "payment_package_selected",
      text: ack,
      alternateTexts: [buildPackageSelectionPromptFromOffer(offerPick)],
    });
    return;
  }

  if (
    await handlePaymentCommandTextRoute({
      client,
      event,
      userId,
      session,
      text,
      lowerText,
      isPaywallGateWithPendingScan,
    })
  ) {
    return;
  }

  if (session.pendingImage) {
    const msgs = await buildWaitingBirthdateDateFirstGuidanceMessages(userId);
    console.log("[UNEXPECTED_INPUT_HANDLED]", {
      userId,
      activeState: "waiting_birthdate",
      inputText: text,
      normalizedIntent: "terminal_guard_prevent_generic_idle",
      chosenReplyType: "waiting_birthdate_guidance",
    });
    console.log("[ACTIVE_STATE_ROUTING]", {
      userId,
      flowState: "waiting_birthdate",
      paymentState,
      accessState,
      conversationOwner: "waiting_birthdate",
      expectedInputType: "date_like",
      text,
      chosenReplyType: "waiting_birthdate_guidance",
      routeReason: "terminal_guard_no_generic_fallback",
    });
    await sendNonScanSequenceReply({
      client,
      userId,
      replyToken: event.replyToken,
      replyType: "waiting_birthdate_guidance",
      semanticKey: "waiting_birthdate_guidance",
      messages: msgs,
    });
    return;
  }

  if (session.awaitingBirthdateUpdate) {
    const msgs = await buildWaitingBirthdateDateFirstGuidanceMessages(userId);
    console.log("[ACTIVE_STATE_ROUTING]", {
      userId,
      flowState: "awaiting_birthdate_update",
      paymentState,
      accessState,
      conversationOwner: "waiting_birthdate",
      expectedInputType: "date_like",
      text,
      chosenReplyType: "birthdate_update_guidance",
      routeReason: "terminal_guard_profile_birthdate_no_generic_idle",
    });
    await sendNonScanSequenceReply({
      client,
      userId,
      replyToken: event.replyToken,
      replyType: "birthdate_update_guidance",
      semanticKey: "birthdate_guidance_profile",
      messages: msgs,
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

    await sendNonScanReply({
      client,
      userId,
      replyToken: event.replyToken,
      replyType: "scan_energy_helper",
      semanticKey: "scan_energy_helper",
      text: helperText,
      alternateTexts: [
        "ส่งรูปวัตถุ 1 รูปมาได้เลยครับ แล้วตามด้วยวันเกิดถ้าระบบถาม",
      ],
    });
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
    const usageMain = [
      "วิธีใช้งาน Ener Scan",
      "",
      "1) ส่งรูปวัตถุที่ต้องการสแกน",
      "2) ระบบให้พิมพ์วันเกิด (DD/MM/YYYY)",
      "3) ระบบจะส่งผลการสแกนกลับมาในแชทนี้",
      "",
      "หากหมดสิทธิ์ฟรี: พิมพ์ 49 หรือ 99 เพื่อเลือกแพ็ก แล้วพิมพ์ จ่ายเงิน",
      "",
      MAIN_MENU_HINT_TEXT,
    ].join("\n");
    await sendNonScanReply({
      client,
      userId,
      replyToken: event.replyToken,
      replyType: "usage_help",
      semanticKey: "usage_help",
      text: usageMain,
      alternateTexts: [
        [
          "สรุปวิธีใช้",
          "",
          "ส่งรูป 1 รูป → พิมพ์วันเกิด DD/MM/YYYY → รอผลในแชท",
          "",
          MAIN_MENU_HINT_TEXT,
        ].join("\n"),
      ],
    });
    return;
  }

  if (menuAliases.has(text) || menuAliases.has(lowerText)) {
    await replyIdleTextNoDuplicate({
      client,
      replyToken: event.replyToken,
      userId,
    });
    return;
  }

  // True idle / menu only — interactive sessions are handled above (terminal guards + state blocks).
  await replyIdleTextNoDuplicate({
    client,
    replyToken: event.replyToken,
    userId,
  });
}

async function handleEvent({ client, event }) {
  if (event.type !== "message") return;
  if (!event.replyToken) return;

  const userId = event.source?.userId;

  if (!userId) {
    await replyText(client, event.replyToken, "ยังไม่พบข้อมูลผู้ใช้ครับ");
    return;
  }

  const now = Date.now();
  const gateDiag = getHandleEventAbuseGateDiagnostics(userId, now);
  console.log(
    JSON.stringify({
      event: "ABUSE_GUARD_HANDLE_EVENT_GATE",
      userId,
      gate: "handleEvent",
      textSpamScore: gateDiag.textSpamScore,
      scanSpamScore: gateDiag.scanSpamScore,
      paymentSpamScore: gateDiag.paymentSpamScore,
      totalScore: gateDiag.totalScore,
      isHardBlocked: gateDiag.isHardBlocked,
      scanLockUntil: gateDiag.scanLockUntil,
      paymentLockUntil: gateDiag.paymentLockUntil,
      scanLocked: gateDiag.scanLocked,
      paymentLocked: gateDiag.paymentLocked,
      hardBlockReason: gateDiag.hardBlockReason,
    }),
  );
  const globalStatus = {
    isHardBlocked: gateDiag.isHardBlocked,
    totalScore: gateDiag.totalScore,
    textSpamScore: gateDiag.textSpamScore,
    scanSpamScore: gateDiag.scanSpamScore,
    paymentSpamScore: gateDiag.paymentSpamScore,
  };
  console.log("[ABUSE_GUARD_GLOBAL_STATUS]", {
    userId,
    ...globalStatus,
  });

  if (globalStatus.isHardBlocked) {
    console.warn("[ABUSE_GUARD_HARD_BLOCK]", {
      userId,
      gate: "handleEvent",
      hardBlockReason: gateDiag.hardBlockReason,
    });
    await sendScanLockReply(client, {
      userId,
      replyToken: event.replyToken,
      lockType: "hard",
      semanticKey: "scan_locked_hard:handle_event",
    });
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

  if (event.message?.type === "sticker") {
    await handleStickerLikeInput({
      client,
      event,
      userId,
      session,
      source: "sticker",
    });
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

              const multiCandReq = getMultiImageInRequestReplyCandidates();
              await sendNonScanReply({
                client,
                userId,
                replyToken: event.replyToken,
                replyType: "multi_image_same_request",
                semanticKey: "multi_image_in_request",
                text: multiCandReq[0],
                alternateTexts: multiCandReq.slice(1),
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
              const errUid = event.source?.userId || "";
              if (errUid) {
                await sendNonScanReply({
                  client,
                  userId: errUid,
                  replyToken: event.replyToken,
                  replyType: "webhook_event_error",
                  semanticKey: "system_error",
                  text: buildSystemErrorText(),
                  alternateTexts: [
                    "ขออภัยครับ มีข้อผิดพลาดชั่วคราว ลองส่งใหม่อีกครั้งได้เลย",
                  ],
                });
              } else {
                await replyText(
                  client,
                  event.replyToken,
                  buildSystemErrorText(),
                );
              }
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