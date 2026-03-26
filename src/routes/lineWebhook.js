import line from "@line/bot-sdk";

import {
  getSession,
  setPendingImage,
  clearSession,
  clearSessionIfFlowVersionMatches,
  clearAwaitingBirthdateUpdate,
  setAwaitingBirthdateUpdate,
  getBirthdateChangeFlowState,
  getBirthdateChangePending,
  setBirthdateChangeFlowState,
  clearBirthdateChangeFlow,
  bumpGuidanceNoProgress,
  resetGuidanceNoProgress,
  bumpSameStateAckStreak,
  resetSameStateAckStreak,
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
  getDefaultPackage,
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
  sendNonScanReplyWithOptionalConvSurface,
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
  guidanceTierFromStreak,
  isResendQrIntentText,
  isAwaitingSlipStatusLikeText,
  isPendingVerifyStatusLikeText,
  isGenericAckText,
  isUnclearNoiseText,
  isPackageSelectedHesitation,
  isPackageChangeIntentPhrase,
  isWaitingBirthdatePackageOrPaymentWords,
  isWaitForTomorrowIntent,
  isSingleOfferPriceToken,
} from "../utils/stateMicroIntent.util.js";
import {
  isBirthdateChangeCandidateText,
  isBirthdateFlowConfirmYes,
  isBirthdateFlowConfirmNo,
  pickBirthdateFirstConfirmQuestion,
  pickBirthdateAskDateLine,
  pickBirthdateFinalConfirmText,
  buildBirthdateEchoForUser,
  BIRTHDATE_CHANGE_INVALID_FORMAT_TEXT,
  BIRTHDATE_CHANGE_LOW_CONFIDENCE_TEXT,
  BIRTHDATE_CHANGE_FLOW,
} from "../utils/birthdateChangeFlow.util.js";
import {
  beforeScanMessageSequence,
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
  buildDeterministicBirthdateErrorText,
  buildWaitingBirthdatePaymentDeferredRedirectText,
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
  buildSingleOfferPaywallAltText,
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
  buildAwaitingSlipFatigueGuidanceText,
  buildAwaitingSlipStatusHintText,
  buildPaywallFatiguePromptText,
  resolvePaywallPromptReplyType,
  formatPaywallPriceTokensForLine,
  buildPaymentPackageSelectedHesitationText,
  buildPaymentPackageSelectedGentleRemindText,
  buildPaymentPackageSelectedUnclearText,
  buildPendingVerifyStatusShortText,
  buildPendingVerifyGentleRemindText,
  buildAwaitingSlipAckContinueText,
  buildPendingVerifyAckContinueText,
  buildWaitingBirthdateGuidanceText,
  buildWaitingBirthdateImageReminderMessages,
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

function logStateMicroIntent(payload) {
  console.log(JSON.stringify({ event: "STATE_MICRO_INTENT", ...payload }));
}

function logStateGuidanceLevel(payload) {
  console.log(JSON.stringify({ event: "STATE_GUIDANCE_LEVEL", ...payload }));
}

function logSafeIntentConsumed(payload) {
  console.log(JSON.stringify({ event: "SAFE_INTENT_CONSUMED", ...payload }));
}

const MAIN_MENU_HINT_TEXT = "พิมพ์เมนูหลัก เพื่อกลับเมนูหลักได้ตลอดครับ";

function logHumanConversationMemory(payload) {
  console.log(JSON.stringify(payload));
}

function buildConvSurfacePaywall(userId, text, legacyReplyType, primaryText, tier, defaultPkg) {
  return {
    userId,
    legacyReplyType,
    lastUserText: text,
    deterministicPrimary: primaryText,
    tierString: tier,
    paymentTruth: {
      priceThb: defaultPkg?.priceThb,
      packageLabel: defaultPkg?.label,
      paymentStatusVerbal: "none",
    },
  };
}

function buildConvSurfaceBirthdate(userId, text, legacyReplyType, primaryText, tier) {
  return {
    userId,
    legacyReplyType,
    lastUserText: text,
    deterministicPrimary: primaryText,
    tierString: tier,
    paymentTruth: {},
  };
}

function buildConvSurfaceAwaitingSlip(userId, text, legacyReplyType, primaryText, tier, paymentRef) {
  return {
    userId,
    legacyReplyType,
    lastUserText: text,
    deterministicPrimary: primaryText,
    tierString: tier,
    paymentTruth: {
      paymentRef: paymentRef || undefined,
      paymentStatusVerbal: "awaiting_payment",
    },
  };
}

function buildConvSurfacePendingVerify(userId, text, legacyReplyType, primaryText, tier, paymentRef) {
  return {
    userId,
    legacyReplyType,
    lastUserText: text,
    deterministicPrimary: primaryText,
    tierString: tier,
    paymentTruth: {
      paymentRef: paymentRef || undefined,
      paymentStatusVerbal: "pending_verify",
    },
  };
}

/**
 * Birthdate-change subflow (soft-detect → confirm intent → date → final confirm → save).
 * Runs before payment / paywall branches so date-like text is not mis-routed mid-flow.
 * @returns {Promise<boolean>} true if the turn was fully handled
 */
async function handleBirthdateChangeFlowTurn({
  client,
  event,
  userId,
  session,
  text,
}) {
  void session;
  const flowState = getBirthdateChangeFlowState(userId);
  if (!flowState) return false;

  if (flowState === BIRTHDATE_CHANGE_FLOW.CANDIDATE) {
    if (isBirthdateFlowConfirmYes(text)) {
      setBirthdateChangeFlowState(userId, BIRTHDATE_CHANGE_FLOW.WAITING_DATE, null);
      const ask = pickBirthdateAskDateLine(userId);
      await sendNonScanReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "birthdate_change_ask_date",
        semanticKey: "waiting_birthdate_change",
        text: ask,
        alternateTexts: [ask],
      });
      return true;
    }
    if (isBirthdateFlowConfirmNo(text)) {
      clearBirthdateChangeFlow(userId);
      await sendNonScanReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "birthdate_change_cancelled",
        semanticKey: "birthdate_change_cancelled",
        text: "โอเคครับ ถ้าจะเปลี่ยนทีหลัง บอกได้เลย",
      });
      return true;
    }
    if (looksLikeBirthdateInput(text)) {
      await sendNonScanReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "birthdate_change_please_confirm_first",
        semanticKey: "birthdate_change_candidate",
        text: "ขอคอนเฟิร์มก่อนนะครับ จะเปลี่ยนวันเกิดในระบบใช่ไหม\nพิมพ์ ใช่ หรือ โอเค ได้เลยครับ",
      });
      return true;
    }
    await sendNonScanReply({
      client,
      userId,
      replyToken: event.replyToken,
      replyType: "birthdate_change_ask_intent_again",
      semanticKey: "birthdate_change_candidate",
      text: pickBirthdateFirstConfirmQuestion(userId),
    });
    return true;
  }

  if (flowState === BIRTHDATE_CHANGE_FLOW.WAITING_DATE) {
    const trimmed = String(text || "").trim();
    const parsedBd = parseBirthdateInput(text);
    if (parsedBd.ok) {
      const echo = buildBirthdateEchoForUser(parsedBd);
      const pending = {
        rawBirthdateInput: parsedBd.originalInput,
        normalizedBirthdate: parsedBd.normalizedDisplay,
        echoDisplay: echo,
        isoDate: parsedBd.isoDate,
        yearCE: parsedBd.yearCE,
      };
      setBirthdateChangeFlowState(
        userId,
        BIRTHDATE_CHANGE_FLOW.WAITING_FINAL_CONFIRM,
        pending,
      );
      await sendNonScanReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "birthdate_change_confirm_final",
        semanticKey: "waiting_birthdate_change_confirm",
        text: pickBirthdateFinalConfirmText(userId, echo),
      });
      return true;
    }
    if (/^\d{6,7}$/.test(trimmed)) {
      await sendNonScanReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "birthdate_change_low_confidence",
        semanticKey: "birthdate_change_invalid",
        text: BIRTHDATE_CHANGE_LOW_CONFIDENCE_TEXT,
      });
      return true;
    }
    if (looksLikeBirthdateInput(text)) {
      await sendNonScanReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "birthdate_change_invalid_format",
        semanticKey: "birthdate_change_invalid",
        text: BIRTHDATE_CHANGE_INVALID_FORMAT_TEXT,
      });
      return true;
    }
    const ask = pickBirthdateAskDateLine(userId);
    await sendNonScanReply({
      client,
      userId,
      replyToken: event.replyToken,
      replyType: "birthdate_change_remind_date",
      semanticKey: "waiting_birthdate_change",
      text: ask,
    });
    return true;
  }

  if (flowState === BIRTHDATE_CHANGE_FLOW.WAITING_FINAL_CONFIRM) {
    const pending = getBirthdateChangePending(userId);
    if (isBirthdateFlowConfirmYes(text)) {
      if (!pending?.normalizedBirthdate) {
        clearBirthdateChangeFlow(userId);
        return true;
      }
      await saveBirthdate(userId, pending.normalizedBirthdate, {
        rawBirthdateInput: pending.rawBirthdateInput,
      });
      clearBirthdateChangeFlow(userId);
      logWaitingBirthdate("accepted", {
        gate: "birthdate_update_profile",
        userId,
        yearCE: pending.yearCE,
        isoDate: pending.isoDate,
        normalizedDisplay: pending.normalizedBirthdate,
        rawBirthdateInput: pending.rawBirthdateInput,
        echoDisplay: pending.echoDisplay,
      });
      console.log("[BIRTHDATE_UPDATE] saved", {
        userId,
        normalizedBirthdate: pending.normalizedBirthdate,
        rawBirthdateInput: pending.rawBirthdateInput,
      });
      const savedLine = birthdateSavedAfterUpdate(userId, pending.echoDisplay);
      await sendNonScanReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "birthdate_saved_profile",
        semanticKey: "birthdate_saved",
        text: savedLine,
        alternateTexts: [savedLine],
      });
      return true;
    }
    if (isBirthdateFlowConfirmNo(text)) {
      setBirthdateChangeFlowState(userId, BIRTHDATE_CHANGE_FLOW.WAITING_DATE, null);
      const ask = pickBirthdateAskDateLine(userId);
      await sendNonScanReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "birthdate_change_ask_date_again",
        semanticKey: "waiting_birthdate_change",
        text: `โอเคครับ ส่งวันเกิดมาใหม่ได้เลยครับ\n\n${ask}`,
      });
      return true;
    }
    if (looksLikeBirthdateInput(text)) {
      await sendNonScanReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "birthdate_change_please_confirm_first_final",
        semanticKey: "waiting_birthdate_change_confirm",
        text: "ถ้าถูก พิมพ์ ใช่ ได้เลยครับ",
      });
      return true;
    }
    const pe = pending?.echoDisplay || "";
    await sendNonScanReply({
      client,
      userId,
      replyToken: event.replyToken,
      replyType: "birthdate_change_ask_final_again",
      semanticKey: "waiting_birthdate_change_confirm",
      text: pickBirthdateFinalConfirmText(userId, pe),
    });
    return true;
  }

  return false;
}

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
  forcePaymentIntent = false,
}) {
  if (!forcePaymentIntent && !isPaymentCommand(text, lowerText)) return false;

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
  const paidPackage = getDefaultPackage(offerPay);

  if (!paidPackage) {
    console.log(
      JSON.stringify({
        event: "PAYMENT_PACKAGE_PROMPT_REASON",
        userId,
        paymentState: null,
        selectedPaymentPackageKey: null,
        inputText: text,
        reason: "no_default_package_in_offer",
      }),
    );
    const humanNoPkg = buildPaymentPayIntentNoPackageHumanText({
      offer: offerPay,
      userId,
    });
    const menuAlt = buildSingleOfferPaywallAltText(offerPay);
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
    resetGuidanceNoProgress(userId, "paywall_offer_single");
    resetGuidanceNoProgress(userId, "awaiting_slip");
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

  const payCmdBody = buildPaymentInstructionText({
    amount: paidPackage.priceThb,
    currency,
    paymentRef: cmdPaymentRef,
    paidPackage,
  });
  await sendNonScanReply({
    client,
    userId,
    replyToken: event.replyToken,
    replyType: "payment_instruction_text",
    semanticKey: "payment_command_text_fallback",
    text: payCmdBody,
    alternateTexts: [payCmdBody],
  });
  await logPaywallShown(userId, {
    patternUsed: "qr_text_fallback",
    bubbleCount: 1,
    source: "payment_command_text",
    ...(cmdPaymentId ? { paymentId: cmdPaymentId } : {}),
  });
  return true;
}

async function replyIdleTextNoDuplicate({
  client,
  replyToken,
  userId,
  appendMenuFooter = false,
}) {
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
  const body = appendMenuFooter ? `${primary}\n\n${MAIN_MENU_HINT_TEXT}` : primary;
  const altBody =
    altPersona && appendMenuFooter
      ? `${altPersona}\n\n${MAIN_MENU_HINT_TEXT}`
      : altPersona;
  await sendNonScanReply({
    client,
    userId,
    replyToken,
    replyType: "idle_post_scan",
    semanticKey: "idle_post_scan",
    text: body,
    alternateTexts: [
      ...(altBody ? [altBody] : []),
      appendMenuFooter
        ? `มีชิ้นไหนอยากให้ดูต่อก็ส่งมา\nเดี๋ยวไล่ดูให้\n\n${MAIN_MENU_HINT_TEXT}`
        : "มีชิ้นไหนอยากให้ดูต่อก็ส่งมา\nเดี๋ยวไล่ดูให้",
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
      text: buildNoHistoryText(),
      alternateTexts: [`${buildNoHistoryText()}\nลองส่งรูปมาใหม่ได้เลยครับ`],
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
    text: `ประวัติการสแกนล่าสุด\n\n${formatted}`,
    alternateTexts: [`ประวัติการสแกน\n\n${formatted}`],
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
    ].join("\n"),
    alternateTexts: [
      [
        "สรุปสถิติสแกน",
        "",
        `ทั้งหมด ${stats.totalScans} ครั้ง`,
        `พลังที่เจอบ่อย: ${stats.topEnergy}`,
        `เฉลี่ย ${stats.avgScore} / 10`,
        `ล่าสุด: ${last}`,
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

    // No payment row until user sends จ่ายเงิน (single default package from scan offer).
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

  if (getBirthdateChangeFlowState(userId)) {
    const st = getBirthdateChangeFlowState(userId);
    let hint =
      "รบกวนตอบกลับเป็นข้อความก่อนนะครับ ถ้าถูก พิมพ์ ใช่ หรือ โอเค ได้เลย";
    if (st === BIRTHDATE_CHANGE_FLOW.WAITING_DATE) {
      hint = pickBirthdateAskDateLine(userId);
    } else if (st === BIRTHDATE_CHANGE_FLOW.WAITING_FINAL_CONFIRM) {
      hint =
        "รบกวนตอบกลับเป็นข้อความยืนยันก่อนนะครับ ถ้าถูก พิมพ์ ใช่ ได้เลย";
    }
    await sendNonScanReply({
      client,
      userId,
      replyToken: event.replyToken,
      replyType: "birthdate_update_prompt_image",
      semanticKey: "birthdate_update_prompt",
      text: hint,
      alternateTexts: [
        `${hint}\n\nพิมพ์วันเกิดใหม่ตามรูปแบบ DD/MM/YYYY ได้เลยครับ`,
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

  /**
   * Interactive text route priority (single owner per turn; no LLM routing).
   * Order after abuse/sticker gates matches the branch sequence below:
   * 1) Hard / abuse locks (handled above)
   * 2) Payment interactive: pending_verify → awaiting_slip → paywall_offer_single
   *    (single paid offer — no package selection)
   * 3) waiting_birthdate — only when paymentState === "none" and session.pendingImage
   * 4) approved_intro / explicit commands (history, stats, menu, … further down)
   * 5) Generic non-scan fallback (idle persona) — must not run while 2) or 3) owns the turn
   *
   * PAYMENT_WINS: when flowState is waiting_birthdate but paymentState is active, payment branches run first;
   * see STATE_CONFLICT_RESOLVED log.
   */
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
    paymentState = "paywall_offer_single";
  } else if (activeAccessDecision?.allowed && activeAccessDecision?.reason === "paid") {
    paymentState = "approved_intro";
  }

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
    conversationOwner = "paywall_offer_single";
  } else if (activeAccessDecision?.allowed && activeAccessDecision?.reason === "paid") {
    conversationOwner = "paid_active_scan_ready";
  } else if (flowState === "waiting_birthdate" && paymentState === "none") {
    conversationOwner = "waiting_birthdate";
  }

  if (
    flowState === "waiting_birthdate" &&
    ["paywall_offer_single", "awaiting_slip", "pending_verify"].includes(
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

  if (getBirthdateChangeFlowState(userId)) {
    const bdDone = await handleBirthdateChangeFlowTurn({
      client,
      event,
      userId,
      session,
      text,
    });
    if (bdDone) return;
  }

  if (paymentState === "paywall_offer_single") {
    const offer = loadActiveScanOffer();
    const defaultPkg = getDefaultPackage(offer);

    if (isBirthdateChangeCandidateText(text)) {
      console.log(
        JSON.stringify({
          event: "BIRTHDATE_CHANGE_INTENT",
          userId,
          activeState: "paywall_offer_single",
          inputText: text,
        }),
      );
      setBirthdateChangeFlowState(userId, BIRTHDATE_CHANGE_FLOW.CANDIDATE, null);
      resetSameStateAckStreak(userId, "paywall_offer_single");
      resetGuidanceNoProgress(userId, "paywall_offer_single");
      await sendNonScanReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "birthdate_update_prompt_paywall",
        semanticKey: "birthdate_change_candidate",
        text: pickBirthdateFirstConfirmQuestion(userId),
        alternateTexts: [
          `${pickBirthdateFirstConfirmQuestion(userId)}\nพิมพ์ ใช่ หรือ โอเค เพื่อยืนยัน`,
        ],
      });
      return;
    }

    if (isPaymentCommand(text, lowerText)) {
      resetGuidanceNoProgress(userId, "paywall_offer_single");
      resetSameStateAckStreak(userId, "paywall_offer_single");
      console.log(
        JSON.stringify({
          event: "PAYMENT_PAY_INTENT_CONSUMED",
          userId,
          paymentState,
          inputText: text,
          action: "create_or_show_payment_qr",
        }),
      );
      logSafeIntentConsumed({
        userId,
        activeState: "paywall_offer_single",
        inputText: text,
        normalizedIntent: "pay_intent",
        action: "create_or_show_payment_qr",
      });
      logStateMicroIntent({
        userId,
        activeState: "paywall_offer_single",
        inputText: text,
        normalizedIntent: "pay_intent",
        confidence: "exact",
        chosenReplyType: "single_offer_paywall_pay_intent",
      });
      console.log("[ACTIVE_STATE_ROUTING]", {
        userId,
        flowState,
        paymentState,
        accessState,
        conversationOwner,
        stateOwner: conversationOwner,
        replyFamily: "paywall_single_offer",
        expectedInputType: "payment_command",
        text,
        chosenReplyType: "single_offer_paywall_pay_intent",
        routeReason: "pay_intent_to_qr",
      });
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

    const priceOrPackAck =
      defaultPkg &&
      (isSingleOfferPriceToken(text, offer) ||
        parsePackageSelectionFromText(text, offer, {
          thaiRelativeAliases: true,
          allowEoaPricePhrase: true,
        }));

    if (priceOrPackAck) {
      const pkg = defaultPkg;
      resetGuidanceNoProgress(userId, "paywall_offer_single");
      resetSameStateAckStreak(userId, "paywall_offer_single");
      logStateMicroIntent({
        userId,
        activeState: "paywall_offer_single",
        inputText: text,
        normalizedIntent: "single_offer_ack_price_or_pack",
        confidence: "near_safe",
        chosenReplyType: "single_offer_paywall_ready_ack",
      });
      console.log("[ACTIVE_STATE_ROUTING]", {
        userId,
        flowState,
        paymentState,
        accessState,
        conversationOwner,
        replyFamily: "paywall_single_offer",
        routeReason: "single_offer_price_or_token_ack",
        text,
        chosenReplyType: "single_offer_paywall_ready_ack",
      });
      const ack = buildPaymentPackageSelectedAck(pkg);
      await sendNonScanReplyWithOptionalConvSurface({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "single_offer_paywall_ready_ack",
        semanticKey: "single_offer_paywall_ready_ack",
        text: ack,
        alternateTexts: [buildSingleOfferPaywallAltText(offer)],
        convSurface: buildConvSurfacePaywall(
          userId,
          text,
          "single_offer_paywall_ready_ack",
          ack,
          "full",
          defaultPkg,
        ),
      });
      return;
    }

    if (isWaitForTomorrowIntent(text)) {
      resetSameStateAckStreak(userId, "paywall_offer_single");
      const streak = bumpGuidanceNoProgress(userId, "paywall_offer_single");
      const tier = guidanceTierFromStreak(streak);
      logStateGuidanceLevel({
        userId,
        activeState: "paywall_offer_single",
        noProgressCount: streak,
        guidanceLevel: tier,
      });
      logStateMicroIntent({
        userId,
        activeState: "paywall_offer_single",
        inputText: text,
        normalizedIntent: "wait_for_free_tomorrow",
        confidence: "near_safe",
        chosenReplyType: resolvePaywallPromptReplyType("wait_tomorrow", tier),
      });
      const primaryText = buildPaywallFatiguePromptText({
        offer,
        userId,
        tier,
        branch: "wait_tomorrow",
      });
      const chosenReplyType = resolvePaywallPromptReplyType("wait_tomorrow", tier);
      console.log(
        JSON.stringify({
          event: "PAYMENT_SINGLE_OFFER_PROMPT",
          userId,
          paymentState,
          conversationOwner,
          inputText: text,
          reason: "wait_tomorrow_path",
        }),
      );
      console.log("[ACTIVE_STATE_ROUTING]", {
        userId,
        flowState,
        paymentState,
        accessState,
        conversationOwner,
        replyFamily: "paywall_single_offer",
        guidanceReason: "wait_tomorrow",
        text,
        chosenReplyType,
        routeReason: "same_state_wait_tomorrow",
      });
      await sendNonScanReplyWithOptionalConvSurface({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: chosenReplyType,
        semanticKey: "single_offer_paywall_wait_tomorrow",
        text: primaryText,
        alternateTexts: [buildSingleOfferPaywallAltText(offer)],
        convSurface: buildConvSurfacePaywall(
          userId,
          text,
          "single_offer_paywall_wait_tomorrow",
          primaryText,
          tier,
          defaultPkg,
        ),
      });
      return;
    }

    if (isPackageSelectedHesitation(text)) {
      resetSameStateAckStreak(userId, "paywall_offer_single");
      const streak = bumpGuidanceNoProgress(userId, "paywall_offer_single");
      const tier = guidanceTierFromStreak(streak);
      logStateGuidanceLevel({
        userId,
        activeState: "paywall_offer_single",
        noProgressCount: streak,
        guidanceLevel: tier,
      });
      const primaryText = buildPaymentPackageSelectedHesitationText(defaultPkg, offer);
      logStateMicroIntent({
        userId,
        activeState: "paywall_offer_single",
        inputText: text,
        normalizedIntent: "hesitation",
        confidence: "near_safe",
        chosenReplyType: "single_offer_paywall_hesitation",
      });
      await sendNonScanReplyWithOptionalConvSurface({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "single_offer_paywall_hesitation",
        semanticKey: "single_offer_paywall_hesitation",
        text: primaryText,
        alternateTexts: [buildPaymentPackageSelectedGentleRemindText()],
        convSurface: buildConvSurfacePaywall(
          userId,
          text,
          "single_offer_paywall_hesitation",
          primaryText,
          tier,
          defaultPkg,
        ),
      });
      return;
    }

    if (isPackageChangeIntentPhrase(text)) {
      resetSameStateAckStreak(userId, "paywall_offer_single");
      const streak = bumpGuidanceNoProgress(userId, "paywall_offer_single");
      const tier = guidanceTierFromStreak(streak);
      logStateGuidanceLevel({
        userId,
        activeState: "paywall_offer_single",
        noProgressCount: streak,
        guidanceLevel: tier,
      });
      logStateMicroIntent({
        userId,
        activeState: "paywall_offer_single",
        inputText: text,
        normalizedIntent: "package_change_not_available_single_offer",
        confidence: "unclear",
        chosenReplyType: "single_offer_paywall_no_package_change",
      });
      const primaryText = buildPaymentPackageSelectedUnclearText({ tier });
      await sendNonScanReplyWithOptionalConvSurface({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "single_offer_paywall_no_package_change",
        semanticKey: "single_offer_paywall_no_package_change",
        text: primaryText,
        alternateTexts: [buildPaymentPackageSelectedGentleRemindText()],
        convSurface: buildConvSurfacePaywall(
          userId,
          text,
          "single_offer_paywall_no_package_change",
          primaryText,
          tier,
          defaultPkg,
        ),
      });
      return;
    }

    let branch = "unclear";
    if (looksLikeBirthdateInput(text)) branch = "date_wrong";
    else if (isGenericAckText(text)) branch = "ack";

    if (branch === "ack") {
      const ackStreak = bumpSameStateAckStreak(userId, "paywall_offer_single");
      const ackTier = guidanceTierFromStreak(ackStreak);
      logHumanConversationMemory({
        event: "STATE_ACK_CONTINUE",
        userId,
        activeState: "paywall_offer_single",
        ackStreak,
        normalizedIntent: "ack_continue",
      });
      if (ackStreak >= 2) {
        logHumanConversationMemory({
          event: "SAME_STATE_ACK_SHORT",
          userId,
          activeState: "paywall_offer_single",
          ackStreak,
        });
      }
      if (ackStreak >= 3) {
        logHumanConversationMemory({
          event: "SAME_STATE_ACK_MICRO",
          userId,
          activeState: "paywall_offer_single",
          ackStreak,
        });
        logHumanConversationMemory({
          event: "REPLY_REPEAT_AVOIDED",
          userId,
          activeState: "paywall_offer_single",
          reason: "instruction_light_or_absent",
        });
      }
      logHumanConversationMemory({
        event: "HUMAN_SURFACE_FALLBACK",
        userId,
        surface: "deterministic_paywall_ack",
      });
      const primaryText = buildPaywallFatiguePromptText({
        offer,
        userId,
        tier: ackTier,
        branch: "ack",
        ackStreak,
      });
      const chosenReplyType = resolvePaywallPromptReplyType("ack", ackTier);
      logStateGuidanceLevel({
        userId,
        activeState: "paywall_offer_single",
        noProgressCount: ackStreak,
        guidanceLevel: ackTier,
        ladder: "ack_continue",
      });
      logStateMicroIntent({
        userId,
        activeState: "paywall_offer_single",
        inputText: text,
        normalizedIntent: "ack_continue",
        confidence: "near_safe",
        chosenReplyType,
      });
      console.log("[ACTIVE_STATE_ROUTING]", {
        userId,
        flowState,
        paymentState,
        accessState,
        conversationOwner,
        replyFamily: "paywall_single_offer",
        guidanceReason: "ack_continue",
        text,
        chosenReplyType,
        routeReason: "same_state_ack_human",
      });
      const menuAlt = buildSingleOfferPaywallAltText(offer);
      await sendNonScanReplyWithOptionalConvSurface({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: chosenReplyType,
        semanticKey: chosenReplyType,
        text: primaryText,
        alternateTexts: [menuAlt],
        convSurface: buildConvSurfacePaywall(
          userId,
          text,
          chosenReplyType,
          primaryText,
          ackTier,
          defaultPkg,
        ),
      });
      return;
    }

    resetSameStateAckStreak(userId, "paywall_offer_single");
    const streak = bumpGuidanceNoProgress(userId, "paywall_offer_single");
    const tier = guidanceTierFromStreak(streak);
    logStateGuidanceLevel({
      userId,
      activeState: "paywall_offer_single",
      noProgressCount: streak,
      guidanceLevel: tier,
    });
    const primaryText = buildPaywallFatiguePromptText({
      offer,
      userId,
      tier,
      branch: branch === "date_wrong" ? "date_wrong" : "unclear",
    });
    const chosenReplyType = resolvePaywallPromptReplyType(
      branch === "date_wrong" ? "date_wrong" : "unclear",
      tier,
    );
    const semanticKey =
      branch === "date_wrong"
        ? "paywall_birthdate_deferred"
        : "single_offer_paywall_guidance";
    logStateMicroIntent({
      userId,
      activeState: "paywall_offer_single",
      inputText: text,
      normalizedIntent:
        branch === "date_wrong"
          ? "wrong_state_date_like"
          : isUnclearNoiseText(text)
            ? "unrelated_noise"
            : "unclear",
      confidence: branch === "date_wrong" ? "near_safe" : "unclear",
      chosenReplyType,
    });
    console.log(
      JSON.stringify({
        event: "PAYMENT_SINGLE_OFFER_PROMPT",
        userId,
        paymentState,
        conversationOwner,
        inputText: text,
        reason:
          branch === "date_wrong"
            ? "birthdate_like_while_paywall"
            : "unexpected_input_same_state",
      }),
    );
    console.log("[ACTIVE_STATE_ROUTING]", {
      userId,
      flowState,
      paymentState,
      accessState,
      conversationOwner,
      stateOwner: conversationOwner,
      replyFamily: "paywall_single_offer",
      guidanceReason: branch,
      expectedInputType: "payment_or_wait_or_ack",
      text,
      chosenReplyType,
      routeReason: "unexpected_input_kept_in_state",
    });
    console.log("[UNEXPECTED_INPUT_HANDLED]", {
      userId,
      activeState: "paywall_offer_single",
      inputText: text,
      normalizedIntent: branch,
      chosenReplyType,
    });
    logHumanConversationMemory({
      event: "HUMAN_SURFACE_FALLBACK",
      userId,
      surface: "deterministic_paywall_unclear",
    });
    const menuAlt = buildSingleOfferPaywallAltText(offer);
    await sendNonScanReplyWithOptionalConvSurface({
      client,
      userId,
      replyToken: event.replyToken,
      replyType: chosenReplyType,
      semanticKey,
      text: primaryText,
      alternateTexts: [menuAlt],
      convSurface: buildConvSurfacePaywall(
        userId,
        text,
        chosenReplyType,
        primaryText,
        tier,
        defaultPkg,
      ),
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

    if (isBirthdateChangeCandidateText(text)) {
      console.log(
        JSON.stringify({
          event: "BIRTHDATE_CHANGE_INTENT",
          userId,
          activeState: "awaiting_slip",
          inputText: text,
        }),
      );
      setBirthdateChangeFlowState(userId, BIRTHDATE_CHANGE_FLOW.CANDIDATE, null);
      resetSameStateAckStreak(userId, "awaiting_slip");
      await sendNonScanReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "birthdate_update_prompt_awaiting_slip",
        semanticKey: "birthdate_change_candidate",
        text: pickBirthdateFirstConfirmQuestion(userId),
        alternateTexts: [
          `${pickBirthdateFirstConfirmQuestion(userId)}\n\nพิมพ์ ใช่ หรือ โอเค เพื่อยืนยัน`,
        ],
      });
      return;
    }

    if (isPaymentCommand(text, lowerText) || isResendQrIntentText(text)) {
      const isResend = isResendQrIntentText(text);
      logSafeIntentConsumed({
        userId,
        activeState: "awaiting_slip",
        inputText: text,
        normalizedIntent: isResend ? "resend_qr_request" : "pay_intent",
        action: isResend ? "resend_qr" : "show_payment_qr",
      });
      logStateMicroIntent({
        userId,
        activeState: "awaiting_slip",
        inputText: text,
        normalizedIntent: isResend ? "resend_qr_request" : "pay_intent",
        confidence: "exact",
        chosenReplyType: "awaiting_slip_resend_qr",
      });
      resetSameStateAckStreak(userId, "awaiting_slip");
      await handlePaymentCommandTextRoute({
        client,
        event,
        userId,
        session,
        text: "จ่ายเงิน",
        lowerText: "จ่ายเงิน",
        isPaywallGateWithPendingScan,
        forcePaymentIntent: true,
      });
      return;
    }

    if (isAwaitingSlipStatusLikeText(text)) {
      resetSameStateAckStreak(userId, "awaiting_slip");
      const streak = bumpGuidanceNoProgress(userId, "awaiting_slip");
      const tier = guidanceTierFromStreak(streak);
      logStateGuidanceLevel({
        userId,
        activeState: "awaiting_slip",
        noProgressCount: streak,
        guidanceLevel: tier,
      });
      logStateMicroIntent({
        userId,
        activeState: "awaiting_slip",
        inputText: text,
        normalizedIntent: "status_check",
        confidence: "near_safe",
        chosenReplyType: "awaiting_slip_status_hint",
      });
      const hintText = buildAwaitingSlipStatusHintText({ paymentRef });
      console.log("[ACTIVE_STATE_ROUTING]", {
        userId,
        flowState,
        paymentState,
        accessState,
        conversationOwner,
        stateOwner: conversationOwner,
        replyFamily: "awaiting_slip",
        expectedInputType: "slip_status",
        text,
        chosenReplyType: "awaiting_slip_status_hint",
        routeReason: "awaiting_slip_status_micro",
      });
      await sendNonScanReplyWithOptionalConvSurface({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "awaiting_slip_status_hint",
        semanticKey: "awaiting_slip_status_hint",
        text: hintText,
        alternateTexts: [
          buildAwaitingSlipFatigueGuidanceText({
            paymentRef,
            tier: "short",
            kind: "default",
          }),
        ],
        convSurface: buildConvSurfaceAwaitingSlip(
          userId,
          text,
          "awaiting_slip_status_hint",
          hintText,
          tier,
          paymentRef,
        ),
      });
      return;
    }

    if (isGenericAckText(text)) {
      const ackStreak = bumpSameStateAckStreak(userId, "awaiting_slip");
      logHumanConversationMemory({
        event: "STATE_ACK_CONTINUE",
        userId,
        activeState: "awaiting_slip",
        ackStreak,
        normalizedIntent: "ack_continue",
      });
      if (ackStreak >= 3) {
        logHumanConversationMemory({
          event: "REPLY_REPEAT_AVOIDED",
          userId,
          activeState: "awaiting_slip",
          reason: "slip_ack_micro",
        });
      }
      logHumanConversationMemory({
        event: "HUMAN_SURFACE_FALLBACK",
        userId,
        surface: "deterministic_awaiting_slip_ack",
      });
      const slipAckText = buildAwaitingSlipAckContinueText({
        userId,
        ackStreak,
        paymentRef,
      });
      const ackTier = guidanceTierFromStreak(ackStreak);
      logStateGuidanceLevel({
        userId,
        activeState: "awaiting_slip",
        noProgressCount: ackStreak,
        guidanceLevel: ackTier,
        ladder: "ack_continue",
      });
      logStateMicroIntent({
        userId,
        activeState: "awaiting_slip",
        inputText: text,
        normalizedIntent: "ack_continue",
        confidence: "near_safe",
        chosenReplyType:
          ackTier === "full"
            ? "awaiting_slip_guidance"
            : "awaiting_slip_gentle_remind",
      });
      const slipAckReplyType =
        ackTier === "full" ? "awaiting_slip_guidance" : "awaiting_slip_gentle_remind";
      await sendNonScanReplyWithOptionalConvSurface({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: slipAckReplyType,
        semanticKey: slipAckReplyType,
        text: slipAckText,
        alternateTexts: [
          buildAwaitingSlipFatigueGuidanceText({
            paymentRef,
            tier: "short",
            kind: "default",
          }),
        ],
        convSurface: buildConvSurfaceAwaitingSlip(
          userId,
          text,
          slipAckReplyType,
          slipAckText,
          ackTier,
          paymentRef,
        ),
      });
      return;
    }

    resetSameStateAckStreak(userId, "awaiting_slip");
    const streak = bumpGuidanceNoProgress(userId, "awaiting_slip");
    const tier = guidanceTierFromStreak(streak);
    logStateGuidanceLevel({
      userId,
      activeState: "awaiting_slip",
      noProgressCount: streak,
      guidanceLevel: tier,
    });
    logStateMicroIntent({
      userId,
      activeState: "awaiting_slip",
      inputText: text,
      normalizedIntent: "default_guidance",
      confidence: "unclear",
      chosenReplyType:
        tier === "full" ? "awaiting_slip_guidance" : "awaiting_slip_gentle_remind",
    });
    const slipReminder = buildAwaitingSlipFatigueGuidanceText({
      paymentRef,
      tier,
      kind: "default",
    });
    logHumanConversationMemory({
      event: "HUMAN_SURFACE_FALLBACK",
      userId,
      surface: "deterministic_awaiting_slip_default",
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
      chosenReplyType:
        tier === "full" ? "awaiting_slip_guidance" : "awaiting_slip_gentle_remind",
      routeReason: "awaiting_slip_text_guard",
    });
    const slipRemReplyType =
      tier === "full" ? "awaiting_slip_guidance" : "awaiting_slip_gentle_remind";
    await sendNonScanReplyWithOptionalConvSurface({
      client,
      userId,
      replyToken: event.replyToken,
      replyType: slipRemReplyType,
      semanticKey: slipRemReplyType,
      text: slipReminder,
      alternateTexts: [
        "ส่งรูปสลิปในแชตนี้ได้เลยครับ",
        "ถ้าต้องการดูคิวอาร์อีกครั้ง พิมพ์ จ่ายเงิน ได้เลยครับ",
      ],
      convSurface: buildConvSurfaceAwaitingSlip(
        userId,
        text,
        slipRemReplyType,
        slipReminder,
        tier,
        paymentRef,
      ),
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

    if (isBirthdateChangeCandidateText(text)) {
      console.log(
        JSON.stringify({
          event: "BIRTHDATE_CHANGE_INTENT",
          userId,
          activeState: "pending_verify",
          inputText: text,
        }),
      );
      setBirthdateChangeFlowState(userId, BIRTHDATE_CHANGE_FLOW.CANDIDATE, null);
      resetSameStateAckStreak(userId, "pending_verify");
      await sendNonScanReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "birthdate_update_prompt_pending_verify",
        semanticKey: "birthdate_change_candidate",
        text: pickBirthdateFirstConfirmQuestion(userId),
        alternateTexts: [
          `${pickBirthdateFirstConfirmQuestion(userId)}\n\nพิมพ์ ใช่ หรือ โอเค เพื่อยืนยัน`,
        ],
      });
      return;
    }

    if (isPaymentCommand(text, lowerText)) {
      resetSameStateAckStreak(userId, "pending_verify");
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
      logStateMicroIntent({
        userId,
        activeState: "pending_verify",
        inputText: text,
        normalizedIntent: "pay_intent_while_pending_verify",
        confidence: "exact",
        chosenReplyType: "pending_verify_payment_cmd",
      });
      return;
    }

    if (!allowsUtilityCommandsDuringPendingVerify(text, lowerText)) {
      if (isPendingVerifyStatusLikeText(text)) {
      resetSameStateAckStreak(userId, "pending_verify");
      const streak = bumpGuidanceNoProgress(userId, "pending_verify");
      const tier = guidanceTierFromStreak(streak);
      logStateGuidanceLevel({
        userId,
        activeState: "pending_verify",
        noProgressCount: streak,
        guidanceLevel: tier,
      });
      logStateMicroIntent({
        userId,
        activeState: "pending_verify",
        inputText: text,
        normalizedIntent: "status_check",
        confidence: "near_safe",
        chosenReplyType: "pending_verify_status",
      });
      const pendingText =
        tier === "full"
          ? buildPendingVerifyHumanGuidanceText({ paymentRef })
          : buildPendingVerifyStatusShortText({ paymentRef });
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
        chosenReplyType: "pending_verify_status",
        routeReason: "pending_verify_status_micro",
      });
      await sendNonScanReplyWithOptionalConvSurface({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "pending_verify_status",
        semanticKey: "pending_verify_status",
        text: pendingText,
        alternateTexts: [
          "รอแจ้งผลในแชตนี้ได้เลยครับ",
          buildPendingVerifyReminderText({ paymentRef }),
        ],
        convSurface: buildConvSurfacePendingVerify(
          userId,
          text,
          "pending_verify_status",
          pendingText,
          tier,
          paymentRef,
        ),
      });
      return;
    }

    if (isGenericAckText(text)) {
      const ackStreak = bumpSameStateAckStreak(userId, "pending_verify");
      logHumanConversationMemory({
        event: "STATE_ACK_CONTINUE",
        userId,
        activeState: "pending_verify",
        ackStreak,
        normalizedIntent: "ack_continue",
      });
      if (ackStreak >= 3) {
        logHumanConversationMemory({
          event: "REPLY_REPEAT_AVOIDED",
          userId,
          activeState: "pending_verify",
          reason: "pv_ack_micro",
        });
      }
      logHumanConversationMemory({
        event: "HUMAN_SURFACE_FALLBACK",
        userId,
        surface: "deterministic_pending_verify_ack",
      });
      const ackTier = guidanceTierFromStreak(ackStreak);
      const pendingText = buildPendingVerifyAckContinueText({
        userId,
        ackStreak,
        paymentRef,
      });
      logStateGuidanceLevel({
        userId,
        activeState: "pending_verify",
        noProgressCount: ackStreak,
        guidanceLevel: ackTier,
        ladder: "ack_continue",
      });
      logStateMicroIntent({
        userId,
        activeState: "pending_verify",
        inputText: text,
        normalizedIntent: "ack_continue",
        confidence: "near_safe",
        chosenReplyType:
          ackTier === "full"
            ? "pending_verify_guidance"
            : "pending_verify_gentle_remind",
      });
      const pvReplyType =
        ackTier === "full"
          ? "pending_verify_guidance"
          : "pending_verify_gentle_remind";
      const pvSemantic = pvReplyType;
      console.log("[UNEXPECTED_INPUT_HANDLED]", {
        userId,
        activeState: paymentState,
        inputText: text,
        normalizedIntent: "ack_continue_pending_verify",
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
        expectedInputType: "short_ack",
        text,
        chosenReplyType: pvReplyType,
        routeReason: "pending_verify_ack_human",
      });
      await sendNonScanReplyWithOptionalConvSurface({
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
        convSurface: buildConvSurfacePendingVerify(
          userId,
          text,
          pvReplyType,
          pendingText,
          ackTier,
          paymentRef,
        ),
      });
      return;
    }

    resetSameStateAckStreak(userId, "pending_verify");
    const streak = bumpGuidanceNoProgress(userId, "pending_verify");
    const tier = guidanceTierFromStreak(streak);
    logStateGuidanceLevel({
      userId,
      activeState: "pending_verify",
      noProgressCount: streak,
      guidanceLevel: tier,
    });
    logStateMicroIntent({
      userId,
      activeState: "pending_verify",
      inputText: text,
      normalizedIntent: "default_guidance",
      confidence: "unclear",
      chosenReplyType:
        tier === "full" ? "pending_verify_guidance" : "pending_verify_gentle_remind",
    });
    const pendingText =
      tier === "full"
        ? buildPendingVerifyHumanGuidanceText({ paymentRef })
        : buildPendingVerifyGentleRemindText({ paymentRef });
    const pvReplyType =
      tier === "full"
        ? "pending_verify_guidance"
        : "pending_verify_gentle_remind";
    const pvSemantic = pvReplyType;
    logHumanConversationMemory({
      event: "HUMAN_SURFACE_FALLBACK",
      userId,
      surface: "deterministic_pending_verify_default",
    });
    console.log("[UNEXPECTED_INPUT_HANDLED]", {
      userId,
      activeState: paymentState,
      inputText: text,
      normalizedIntent: "unexpected_pending_verify",
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
    await sendNonScanReplyWithOptionalConvSurface({
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
      convSurface: buildConvSurfacePendingVerify(
        userId,
        text,
        pvReplyType,
        pendingText,
        tier,
        paymentRef,
      ),
    });
    return;
    }
  }

  if (flowState === "waiting_birthdate" && paymentState === "none") {
    const trimmedEarly = String(text || "").trim();
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

      if (!parsedEarly.ok && /^\d{6,7}$/.test(trimmedEarly)) {
        const ambStreak = bumpGuidanceNoProgress(userId, "waiting_birthdate");
        const ambTier = guidanceTierFromStreak(ambStreak);
        const ambMsg =
          ambTier === "micro"
            ? "พิมพ์วันเกิดมาใหม่ได้เลยครับ"
            : BIRTHDATE_CHANGE_LOW_CONFIDENCE_TEXT;
        logStateMicroIntent({
          userId,
          activeState: "waiting_birthdate",
          inputText: text,
          normalizedIntent: "ambiguous_compact_date",
          confidence: "near_safe",
          chosenReplyType: "waiting_birthdate_ambiguous_compact",
        });
        await sendNonScanSequenceReply({
          client,
          userId,
          replyToken: event.replyToken,
          replyType: "waiting_birthdate_error",
          semanticKey: "birthdate_error_waiting_scan",
          messages: [ambMsg],
        });
        return;
      }

      if (isDateLike) {
        const errStreak = bumpGuidanceNoProgress(userId, "waiting_birthdate");
        const errTier = guidanceTierFromStreak(errStreak);
        const errLine = buildDeterministicBirthdateErrorText(
          errTier,
          parsedEarly.reason,
        );
        logStateMicroIntent({
          userId,
          activeState: "waiting_birthdate",
          inputText: text,
          normalizedIntent: "invalid_date_like",
          confidence: "near_safe",
          chosenReplyType:
            parsedEarly.reason === "invalid_format"
              ? "waiting_birthdate_invalid_format"
              : "waiting_birthdate_invalid_date",
        });
        console.log("[UNEXPECTED_INPUT_HANDLED]", {
          userId,
          activeState: flowState,
          inputText: text,
          normalizedIntent: "invalid_date_like",
          chosenReplyType: "waiting_birthdate_error",
        });
        console.log("[ACTIVE_STATE_ROUTING]", {
          userId,
          flowState,
          paymentState,
          accessState,
          expectedInputType: "birthdate_dd_mm_yyyy",
          text,
          chosenReplyType: "waiting_birthdate_error",
          routeReason: "unexpected_input_kept_in_state",
        });
        await sendNonScanSequenceReply({
          client,
          userId,
          replyToken: event.replyToken,
          replyType: "waiting_birthdate_error",
          semanticKey: "birthdate_error_waiting_scan",
          messages: [errLine],
        });
        return;
      }

      if (isWaitingBirthdatePackageOrPaymentWords(text)) {
        const streak = bumpGuidanceNoProgress(userId, "waiting_birthdate");
        const tier = guidanceTierFromStreak(streak);
        logStateGuidanceLevel({
          userId,
          activeState: "waiting_birthdate",
          noProgressCount: streak,
          guidanceLevel: tier,
        });
        logStateMicroIntent({
          userId,
          activeState: "waiting_birthdate",
          inputText: text,
          normalizedIntent: "package_payment_words_wrong_state",
          confidence: "near_safe",
          chosenReplyType: "waiting_birthdate_wrong_state_redirect",
        });
        const bdDeferPrimary = buildWaitingBirthdatePaymentDeferredRedirectText();
        await sendNonScanReplyWithOptionalConvSurface({
          client,
          userId,
          replyToken: event.replyToken,
          replyType: "waiting_birthdate_wrong_state_redirect",
          semanticKey: "waiting_birthdate_wrong_state_redirect",
          text: bdDeferPrimary,
          alternateTexts: [
            "ตอนนี้ขอวันเกิดก่อนนะครับ พิมพ์แบบ 19/08/1985 ได้เลย",
          ],
          convSurface: buildConvSurfaceBirthdate(
            userId,
            text,
            "waiting_birthdate_wrong_state_redirect",
            bdDeferPrimary,
            tier,
          ),
        });
        return;
      }

      const streak = bumpGuidanceNoProgress(userId, "waiting_birthdate");
      const tier = guidanceTierFromStreak(streak);
      logStateGuidanceLevel({
        userId,
        activeState: "waiting_birthdate",
        noProgressCount: streak,
        guidanceLevel: tier,
      });
      const guidanceMsgs = await buildWaitingBirthdateDateFirstGuidanceMessages(userId, {
        tier,
      });
      const ack = isGenericAckText(text) || isUnclearNoiseText(text);
      logStateMicroIntent({
        userId,
        activeState: "waiting_birthdate",
        inputText: text,
        normalizedIntent: ack ? "generic_ack_or_noise" : "non_date_like",
        confidence: "unclear",
        chosenReplyType: "waiting_birthdate_guidance",
      });
      console.log("[UNEXPECTED_INPUT_HANDLED]", {
        userId,
        activeState: flowState,
        inputText: text,
        normalizedIntent: "non_date_like",
        chosenReplyType: "waiting_birthdate_guidance",
      });
      console.log("[ACTIVE_STATE_ROUTING]", {
        userId,
        flowState,
        paymentState,
        accessState,
        expectedInputType: "birthdate_dd_mm_yyyy",
        text,
        chosenReplyType: "waiting_birthdate_guidance",
        routeReason: "unexpected_input_kept_in_state",
      });
      await sendNonScanSequenceReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "waiting_birthdate_guidance",
        semanticKey: "waiting_birthdate_guidance",
        messages: guidanceMsgs,
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
      !isBirthdateChangeCandidateText(text) &&
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
  // awaiting_slip text is handled earlier when paymentState === "awaiting_slip" (micro-intent + fatigue).
  // Legacy duplicate guard removed to avoid divergent copy / missing resend-QR handling.

  // 1) pending_verify — payment cmd / early micro-intent handled above; utility passthrough below
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
        await sendNonScanReplyWithOptionalConvSurface({
          client,
          userId,
          replyToken: event.replyToken,
          replyType: "pending_verify_reminder",
          semanticKey: "pending_verify_reminder",
          text: pvRem,
          alternateTexts: [
            "รอตรวจสลิปแป๊บนึงนะครับ แจ้งแอดมินถ้ารอนานเกินไป",
          ],
          convSurface: buildConvSurfacePendingVerify(
            userId,
            text,
            "pending_verify_reminder",
            pvRem,
            "full",
            paymentRef,
          ),
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
        if (isBirthdateChangeCandidateText(text)) {
          setBirthdateChangeFlowState(userId, BIRTHDATE_CHANGE_FLOW.CANDIDATE, null);
          await sendNonScanReply({
            client,
            userId,
            replyToken: event.replyToken,
            replyType: "birthdate_update_prompt_pending_verify",
            semanticKey: "birthdate_change_candidate",
            text: pickBirthdateFirstConfirmQuestion(userId),
            alternateTexts: [
              `${pickBirthdateFirstConfirmQuestion(userId)}\n\nพิมพ์ ใช่ หรือ โอเค เพื่อยืนยัน`,
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
          const payPick =
            formatPaywallPriceTokensForLine(loadActiveScanOffer()) ||
            "แพ็กจากเมนู";
          const usage = [
            "วิธีใช้งาน Ener Scan",
            "",
            "1) ส่งรูปวัตถุที่ต้องการสแกน",
            "2) ระบบให้พิมพ์วันเกิด (DD/MM/YYYY)",
            "3) ระบบจะส่งผลการสแกนกลับมาในแชทนี้",
            "",
            `หากหมดสิทธิ์ฟรี: พิมพ์ ${payPick} เลือกแพ็ก แล้วพิมพ์ จ่ายเงิน`,
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

  // 3) waiting_birthdate (pending scan image; includes awaiting_payment slip reminder branch)
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

      if (isBirthdateChangeCandidateText(text)) {
        setBirthdateChangeFlowState(userId, BIRTHDATE_CHANGE_FLOW.CANDIDATE, null);
        await sendNonScanReply({
          client,
          userId,
          replyToken: event.replyToken,
          replyType: "birthdate_update_prompt_waiting_bd",
          semanticKey: "birthdate_change_candidate",
          text: pickBirthdateFirstConfirmQuestion(userId),
          alternateTexts: [
            `${pickBirthdateFirstConfirmQuestion(userId)}\n\nพิมพ์ ใช่ หรือ โอเค เพื่อยืนยัน`,
          ],
        });
        return;
      }

      const trimmedLock = String(text || "").trim();
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

      if (!parsedLock.ok && /^\d{6,7}$/.test(trimmedLock)) {
        const ambStreak = bumpGuidanceNoProgress(userId, "waiting_birthdate");
        const ambTier = guidanceTierFromStreak(ambStreak);
        const ambMsg =
          ambTier === "micro"
            ? "พิมพ์วันเกิดมาใหม่ได้เลยครับ"
            : BIRTHDATE_CHANGE_LOW_CONFIDENCE_TEXT;
        await sendNonScanSequenceReply({
          client,
          userId,
          replyToken: event.replyToken,
          replyType: "waiting_birthdate_error",
          semanticKey: "birthdate_error_waiting_scan",
          messages: [ambMsg],
        });
        return;
      }

      const offerBd = loadActiveScanOffer();
      if (
        isSingleOfferPriceToken(text, offerBd) ||
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
        const payDeferStreak = bumpGuidanceNoProgress(userId, "waiting_birthdate");
        const payDeferTier = guidanceTierFromStreak(payDeferStreak);
        await sendNonScanSequenceReply({
          client,
          userId,
          replyToken: event.replyToken,
          replyType: "waiting_birthdate_guidance",
          semanticKey: "waiting_birthdate_guidance",
          messages: await buildWaitingBirthdateDateFirstGuidanceMessages(userId, {
            tier: payDeferTier,
          }),
        });
        return;
      }

      if (looksLikeBirthdateInput(text)) {
        logWaitingBirthdate("invalid_date_attempt", {
          gate: "waiting_birthdate",
          userId,
          reason: parsedLock.reason,
        });
        const errStreak = bumpGuidanceNoProgress(userId, "waiting_birthdate");
        const errTier = guidanceTierFromStreak(errStreak);
        const errLine = buildDeterministicBirthdateErrorText(
          errTier,
          parsedLock.reason,
        );
        await sendNonScanSequenceReply({
          client,
          userId,
          replyToken: event.replyToken,
          replyType: "waiting_birthdate_error",
          semanticKey: "birthdate_error_waiting_scan",
          messages: [errLine],
        });
        return;
      }

      if (isBlockedIntentDuringWaitingBirthdate(text, lowerText)) {
        logWaitingBirthdate("guidance", {
          gate: "waiting_birthdate",
          userId,
          hint: "blocked_intent",
        });
        const blkStreak = bumpGuidanceNoProgress(userId, "waiting_birthdate");
        const blkTier = guidanceTierFromStreak(blkStreak);
        await sendNonScanSequenceReply({
          client,
          userId,
          replyToken: event.replyToken,
          replyType: "waiting_birthdate_guidance_blocked",
          semanticKey: "waiting_birthdate_guidance",
          messages: await buildWaitingBirthdateDateFirstGuidanceMessages(userId, {
            tier: blkTier,
          }),
        });
        return;
      }

      logWaitingBirthdate("guidance", {
        gate: "waiting_birthdate",
        userId,
        hint: "default",
      });
      const defStreak = bumpGuidanceNoProgress(userId, "waiting_birthdate");
      const defTier = guidanceTierFromStreak(defStreak);
      await sendNonScanSequenceReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "waiting_birthdate_guidance",
        semanticKey: "waiting_birthdate_guidance",
        messages: await buildWaitingBirthdateDateFirstGuidanceMessages(userId, {
          tier: defTier,
        }),
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
  if (isBirthdateChangeCandidateText(text)) {
    console.log("[BIRTHDATE_UPDATE] requested", { userId });
    setBirthdateChangeFlowState(userId, BIRTHDATE_CHANGE_FLOW.CANDIDATE, null);
    await sendNonScanReply({
      client,
      userId,
      replyToken: event.replyToken,
      replyType: "birthdate_update_prompt_open",
      semanticKey: "birthdate_change_candidate",
            text: pickBirthdateFirstConfirmQuestion(userId),
      alternateTexts: [
        `${pickBirthdateFirstConfirmQuestion(userId)}\n\nพิมพ์ ใช่ หรือ โอเค เพื่อยืนยัน`,
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
  const idlePayHint =
    isSingleOfferPriceToken(text, offerPick) ||
    parsePackageSelectionFromText(text, offerPick);
  if (idlePayHint) {
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

    const pkg = getDefaultPackage(offerPick);
    if (pkg) {
      console.log(
        JSON.stringify({
          event: "PAYMENT_SINGLE_OFFER_HINT",
          lineUserId: userId,
          packageKey: pkg.key,
          priceThb: pkg.priceThb,
          source: "idle_text_route",
        }),
      );
      const ack = buildPaymentPackageSelectedAck(pkg);
      await sendNonScanReplyWithOptionalConvSurface({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "single_offer_paywall_ready_ack",
        semanticKey: "single_offer_paywall_ready_ack",
        text: ack,
        alternateTexts: [buildSingleOfferPaywallAltText(offerPick)],
        convSurface: buildConvSurfacePaywall(
          userId,
          text,
          "single_offer_paywall_ready_ack",
          ack,
          "full",
          pkg,
        ),
      });
      return;
    }
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
    const payPickMain =
      formatPaywallPriceTokensForLine(loadActiveScanOffer()) || "แพ็กจากเมนู";
    const usageMain = [
      "วิธีใช้งาน Ener Scan",
      "",
      "1) ส่งรูปวัตถุที่ต้องการสแกน",
      "2) ระบบให้พิมพ์วันเกิด (DD/MM/YYYY)",
      "3) ระบบจะส่งผลการสแกนกลับมาในแชทนี้",
      "",
      `หากหมดสิทธิ์ฟรี: พิมพ์ ${payPickMain} เพื่อเลือกแพ็ก แล้วพิมพ์ จ่ายเงิน`,
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
    const tMenu = String(text || "").trim();
    const ltMenu = String(lowerText || tMenu.toLowerCase()).trim();
    const menuExplicit =
      tMenu === "เมนู" ||
      tMenu === "เมนูหลัก" ||
      ltMenu === "menu" ||
      ltMenu === "help" ||
      ltMenu === "start" ||
      tMenu === "เริ่ม";
    await replyIdleTextNoDuplicate({
      client,
      replyToken: event.replyToken,
      userId,
      appendMenuFooter: menuExplicit,
    });
    return;
  }

  // True idle — generic fallback / recovery (show menu hint once).
  await replyIdleTextNoDuplicate({
    client,
    replyToken: event.replyToken,
    userId,
    appendMenuFooter: true,
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