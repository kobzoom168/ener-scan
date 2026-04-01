import line from "@line/bot-sdk";

import { maybeFlushPendingApprovedIntroCompensation } from "../utils/adminApproveIntroCompensation.util.js";
import {
  getSession,
  setPendingImage,
  setBirthdate,
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
  setSelectedPaymentPackageKey,
  getSelectedPaymentPackageKey,
  clearSelectedPaymentPackageKey,
  resetScanFlowReplyTokenSpent,
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
  scanV2TraceTs,
  lineUserIdPrefix8,
  idPrefix8,
} from "../utils/scanV2Trace.util.js";
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
  findPackageByKey,
} from "../services/scanOffer.packages.js";
import {
  getPromptPayQrPublicUrl,
  isPromptPayQrUrlHttpsForLine,
} from "../utils/promptpayQrPublicUrl.util.js";
import { ensureUserByLineUserId, touchUserLastActive } from "../stores/users.db.js";
import { mergeConversationStateFromDbIntoSession } from "../services/conversationStateDualWrite.service.js";
import {
  createPaymentPending,
  ensurePaymentRefForPaymentId,
  getLatestAwaitingPaymentForLineUserId,
  setPaymentSlipPendingVerify,
} from "../stores/payments.db.js";

import { uploadSlipImageToStorage } from "../services/slipUpload.service.js";
import {
  evaluateAwaitingPaymentSlipImage,
  buildSlipNotTransferReceiptText,
  logSlipPendingVerifyRouted,
} from "../services/lineWebhook/slipImageValidation.service.js";
import { runGeminiFrontOrchestrator } from "../core/conversation/geminiFront/geminiFrontOrchestrator.service.js";
import { resolveGeminiPhase1StateKey } from "../core/conversation/geminiFront/geminiFront.featureFlags.js";
import { invokePhase1GeminiShadow } from "../core/conversation/geminiFront/geminiFrontShadow.service.js";

import { replyText } from "../services/lineReply.service.js";
import {
  sendNonScanReply,
  sendNonScanReplyWithOptionalConvSurface,
  sendNonScanSequenceReply,
  sendNonScanPaymentQrInstructions,
  sendNonScanPushMessage,
} from "../services/nonScanReply.gateway.js";
import {
  logMultiImageGroupRejected,
  sendMultiImageRejectionViaGateway,
} from "../services/lineWebhook/multiImageRejectionReply.service.js";
import { sendUnsupportedObjectRejectionViaGateway } from "../services/lineWebhook/unsupportedObjectReply.service.js";
import { sendFreeQuotaExhaustedPaywallViaGateway } from "../services/lineWebhook/freeQuotaPaywallReply.service.js";
import { serializeLineErrorSafe } from "../utils/lineErrorLog.util.js";
import {
  emitActiveStateRouting,
  emitStateMicroIntent,
  emitStateGuidanceLevel,
} from "../core/telemetry/stateTelemetry.service.js";
import { TelemetryEvents, logTelemetryEvent } from "../core/telemetry/telemetryEvents.js";
import {
  mapWebhookContextToStateOwner,
  resolveStateMicroIntent,
} from "../core/conversation/stateMicroIntentRouter.js";
import {
  emitAwaitingPaymentEntered,
  emitPackageSelectedEntered,
  emitPendingVerifyEntered,
  emitSlipPhaseEntered,
  FunnelPhase,
} from "../core/telemetry/paymentLifecycleTelemetry.service.js";
import {
  AuditExemptReason,
  auditExemptEnter,
  auditExemptExit,
} from "../services/lineReplyAudit.context.js";
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
  isPendingVerifyReassuranceIntent,
  isSlipClaimWithoutImageIntent,
  isWaitForTomorrowIntent,
  isSingleOfferPriceToken,
  shouldPackageSelectedShortcutToQr,
  isPackageSelectedProceedIntentText,
  isPackageSelectedSamePackageConfirmText,
} from "../utils/stateMicroIntent.util.js";
import {
  computeWebhookTextActiveState,
  toGeminiConversationOwner,
} from "../utils/webhookTextActiveState.util.js";
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
  matchesExplicitBirthdateChangeCommand,
} from "../utils/birthdateChangeFlow.util.js";
import {
  birthdateSavedAfterUpdate,
} from "../utils/replyCopy.util.js";
import { sleep } from "../utils/timing.util.js";
import { createTurnPerf } from "../utils/webhookTurnPerf.util.js";
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
  buildMultipleObjectsText,
  buildUnclearImageText,
  buildDuplicateImageText,
  getDuplicateImageReplyCandidates,
  getMultipleObjectsReplyCandidates,
  getUnclearImageReplyCandidates,
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
  buildPayNotNeededIntentPayload,
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
  buildDeterministicPaywallSoftCloseText,
  matchesDeterministicPaywallPurchaseIntent,
  matchesDeterministicPaywallSoftDeclineIntent,
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
import { insertLineConversationMessage } from "../stores/conversationMessages.db.js";
import { checkScanAccess } from "../services/paymentAccess.service.js";
import {
  isActiveSlipPaymentRow,
  isAwaitingPaymentActionableForTextRouting,
  paymentRowOwnsImageRouting,
  shouldEmitPayNotNeededForPaymentIntent,
} from "../utils/paymentConversationRouting.util.js";

import { runScanFlow } from "../handlers/scanFlow.handler.js";
import { ingestScanImageAsyncV2 } from "../services/scanV2/webhookImageIngestion.service.js";

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
  emitStateMicroIntent(payload);
}

function logStateGuidanceLevel(payload) {
  emitStateGuidanceLevel(payload);
}

function logSafeIntentConsumed(payload) {
  logTelemetryEvent(TelemetryEvents.SAFE_INTENT_CONSUMED, payload);
}

function logSafeIntentResolved(userId, stateOwner, text, lowerText, extra = {}) {
  const r = resolveStateMicroIntent(stateOwner, text, { lowerText });
  logTelemetryEvent(TelemetryEvents.SAFE_INTENT_CONSUMED, {
    userId,
    stateOwner,
    microIntent: r.microIntent,
    confidence: r.confidence,
    reason: r.reason,
    safeToConsume: r.safeToConsume,
    ...extra,
  });
  return r;
}

function logHumanConversationMemory(payload) {
  console.log(JSON.stringify(payload));
}

function mapPaywallSurfaceReplyType(legacyReplyType, userId) {
  if (!getSelectedPaymentPackageKey(userId)) return legacyReplyType;
  const m = {
    single_offer_paywall_ready_ack: "package_selected_ack_full",
    single_offer_paywall_hesitation: "package_selected_hesitation",
    single_offer_paywall_no_package_change: "package_selected_package_change",
    single_offer_paywall_wait_tomorrow: "package_selected_wait_tomorrow",
    single_offer_paywall_date_wrong_state: "package_selected_date_wrong_state",
    single_offer_paywall_ack_full: "package_selected_ack_full",
    single_offer_paywall_ack_short: "package_selected_ack_short",
    single_offer_paywall_ack_micro: "package_selected_ack_micro",
    single_offer_paywall_unclear_full: "package_selected_unclear_full",
    single_offer_paywall_unclear_short: "package_selected_unclear_short",
    single_offer_paywall_unclear_micro: "package_selected_unclear_micro",
  };
  return m[legacyReplyType] || legacyReplyType;
}

function buildConvSurfacePaywall(userId, text, legacyReplyType, primaryText, tier, defaultPkg) {
  const legacy = mapPaywallSurfaceReplyType(legacyReplyType, userId);
  return {
    userId,
    legacyReplyType: legacy,
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

function buildNoopGeminiDelegates() {
  return {
    sendQrBundle: async () => false,
    createOrReusePayment: async () => false,
    getPaymentStatusReply: async () => false,
    selectPackageFromText: async () => false,
    sendHelpDeterministic: async () => false,
  };
}

/**
 * @typedef {{ accessDecision?: unknown, pendingPaymentRow?: unknown }} WebhookTurnCache
 */

async function loadGeminiRoutingSnapshot({
  userId,
  session,
  text,
  lowerText,
  now,
  /** @type {WebhookTurnCache|undefined} */
  turnCache = undefined,
  turnPerf = undefined,
}) {
  let activeAccessDecision = null;
  let activePendingPaymentRow = null;
  let accessLookupSource = "fetch";
  let paymentLookupSource = "fetch";
  try {
    if (turnCache && Object.prototype.hasOwnProperty.call(turnCache, "accessDecision")) {
      activeAccessDecision = turnCache.accessDecision;
      accessLookupSource = "cache";
    } else {
      activeAccessDecision = await checkScanAccess({ userId });
      if (turnCache) turnCache.accessDecision = activeAccessDecision;
    }
  } catch (err) {
    console.error("[GEMINI_ROUTING] checkScanAccess failed (ignored):", {
      userId,
      message: err?.message,
      code: err?.code,
    });
  }
  if (turnPerf) {
    turnPerf.log("ACCESS_SNAPSHOT_READY", { source: accessLookupSource });
  }
  try {
    if (turnCache && Object.prototype.hasOwnProperty.call(turnCache, "pendingPaymentRow")) {
      activePendingPaymentRow = turnCache.pendingPaymentRow;
      paymentLookupSource = "cache";
    } else {
      activePendingPaymentRow = await getLatestAwaitingPaymentForLineUserId(userId);
      if (turnCache) turnCache.pendingPaymentRow = activePendingPaymentRow;
    }
  } catch (err) {
    console.error("[GEMINI_ROUTING] pending payment lookup failed (ignored):", {
      userId,
      message: err?.message,
      code: err?.code,
    });
  }
  if (turnPerf) {
    turnPerf.log("AWAITING_PAYMENT_LOOKUP_READY", { source: paymentLookupSource });
  }
  const paymentMemoryState = getPaymentState(userId).state;
  const scanAbuseStatus = checkScanAbuseStatus(userId, now);
  const wsActive = computeWebhookTextActiveState({
    userId,
    session,
    text,
    lowerText,
    activeAccessDecision,
    activePendingPaymentRow,
    paymentMemoryState,
    scanAbuseStatus,
  });
  const {
    resolved: activeResolved,
    paymentState,
    flowState,
    accessState,
    isPaywallGateWithPendingScan,
    pendingStatus,
    hasPendingVerify,
    hasAwaitingSlip,
  } = wsActive;
  return {
    activeAccessDecision,
    activePendingPaymentRow,
    paymentMemoryState,
    wsActive,
    activeResolved,
    paymentState,
    flowState,
    accessState,
    isPaywallGateWithPendingScan,
    pendingStatus,
    hasPendingVerify,
    hasAwaitingSlip,
    canonicalStateOwner: activeResolved.stateOwner,
    geminiConversationOwner: toGeminiConversationOwner(activeResolved.stateOwner),
  };
}

async function invokePhase1GeminiFromSnapshot({
  snapshot,
  userId,
  text,
  lowerText,
  client,
  event,
  session,
  delegates,
}) {
  const phase1GeminiKey = resolveGeminiPhase1StateKey({
    session,
    paymentState: snapshot.paymentState,
    flowState: snapshot.flowState,
    hasPendingVerify: snapshot.hasPendingVerify,
    hasAwaitingSlip: snapshot.hasAwaitingSlip,
    paymentMemoryState: snapshot.paymentMemoryState,
    selectedPackageKey: getSelectedPaymentPackageKey(userId) || null,
    canonicalStateOwner: snapshot.canonicalStateOwner,
  });
  if (!phase1GeminiKey) return { handled: false };
  return runGeminiFrontOrchestrator({
    userId,
    text,
    lowerText,
    phase1State: phase1GeminiKey,
    conversationOwner: snapshot.geminiConversationOwner,
    paymentState: snapshot.paymentState,
    flowState: snapshot.flowState,
    accessState: snapshot.accessState,
    pendingPaymentStatus: snapshot.pendingStatus || null,
    selectedPackageKey: getSelectedPaymentPackageKey(userId) || null,
    noProgressStreak: snapshot.activeResolved.noProgressStreak ?? 0,
    sendGatewayReply: async ({ replyType, semanticKey, text, alternateTexts }) => {
      await sendNonScanReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType,
        semanticKey,
        text,
        alternateTexts: alternateTexts || [],
      });
    },
    delegates,
  });
}

async function invokePhase1FreshNoop({
  userId,
  client,
  event,
  session,
  text = "",
  lowerText = "",
  turnCache = undefined,
  turnPerf = undefined,
}) {
  const snapshot = await loadGeminiRoutingSnapshot({
    userId,
    session,
    text,
    lowerText,
    now: Date.now(),
    turnCache,
    turnPerf,
  });
  return invokePhase1GeminiFromSnapshot({
    snapshot,
    userId,
    text,
    lowerText,
    client,
    event,
    session,
    delegates: buildNoopGeminiDelegates(),
  });
}

async function sendScanLockReplyAfterPhase1(client, opts, invokePhase1GeminiOrchestrator) {
  const gf = await invokePhase1GeminiOrchestrator();
  if (gf.handled) return;
  await sendScanLockReply(client, opts);
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
  invokePhase1GeminiOrchestrator = null,
  turnPerf = undefined,
}) {
  void session;
  const flowState = getBirthdateChangeFlowState(userId);
  if (!flowState) return false;

  if (flowState === BIRTHDATE_CHANGE_FLOW.CANDIDATE) {
    if (matchesExplicitBirthdateChangeCommand(text)) {
      setBirthdateChangeFlowState(userId, BIRTHDATE_CHANGE_FLOW.WAITING_DATE, null);
      console.log(
        JSON.stringify({
          event: "BIRTHDATE_CHANGE_STATE_ENTERED",
          userId,
          birthdateChangeState: "awaiting_new_birthdate",
          sessionState: BIRTHDATE_CHANGE_FLOW.WAITING_DATE,
          fromCandidate: true,
        }),
      );
      const ask = pickBirthdateAskDateLine(userId);
      await sendNonScanReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "birthdate_change_ask_date_direct",
        semanticKey: "waiting_birthdate_change",
        text: ask,
        alternateTexts: [ask],
      });
      return true;
    }
    if (isBirthdateFlowConfirmYes(text)) {
      setBirthdateChangeFlowState(userId, BIRTHDATE_CHANGE_FLOW.WAITING_DATE, null);
      const ask = pickBirthdateAskDateLine(userId);
      if (
        invokePhase1GeminiOrchestrator &&
        (await invokePhase1GeminiOrchestrator()).handled
      )
        return true;
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
      console.log(
        JSON.stringify({
          event: "BIRTHDATE_CHANGE_STATE_CLEARED",
          userId,
          reason: "user_cancelled_candidate",
        }),
      );
      if (
        invokePhase1GeminiOrchestrator &&
        (await invokePhase1GeminiOrchestrator()).handled
      )
        return true;
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
      if (
        invokePhase1GeminiOrchestrator &&
        (await invokePhase1GeminiOrchestrator()).handled
      )
        return true;
      await sendNonScanReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "birthdate_change_please_confirm_first",
        semanticKey: "birthdate_change_candidate",
        text: "ขอคอนเฟิร์มก่อนนะครับ จะเปลี่ยนวันเกิดในระบบใช่ไหม\nถ้าใช่ ตอบว่าใช่ หรือโอเค มาก็ได้ครับ",
      });
      return true;
    }
    if (
        invokePhase1GeminiOrchestrator &&
        (await invokePhase1GeminiOrchestrator()).handled
      )
        return true;
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
      console.log(
        JSON.stringify({
          event: "BIRTHDATE_CHANGE_DATE_ACCEPTED",
          userId,
          birthdateChangeState: "awaiting_new_birthdate",
          isoDate: parsedBd.isoDate ?? null,
          yearCE: parsedBd.yearCE ?? null,
          nextSessionState: BIRTHDATE_CHANGE_FLOW.WAITING_FINAL_CONFIRM,
        }),
      );
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
      console.log(
        JSON.stringify({
          event: "BIRTHDATE_CHANGE_DATE_REJECTED",
          userId,
          birthdateChangeState: "awaiting_new_birthdate",
          reason: "low_confidence_digits",
        }),
      );
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
      console.log(
        JSON.stringify({
          event: "BIRTHDATE_CHANGE_DATE_REJECTED",
          userId,
          birthdateChangeState: "awaiting_new_birthdate",
          reason: "invalid_format_or_date",
        }),
      );
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
    const confirmYes = isBirthdateFlowConfirmYes(text);
    const confirmNo = isBirthdateFlowConfirmNo(text);
    console.log(
      JSON.stringify({
        event: "BIRTHDATE_FLOW_FINAL_CONFIRM_DEBUG",
        userId,
        flowState: BIRTHDATE_CHANGE_FLOW.WAITING_FINAL_CONFIRM,
        inputText: String(text ?? ""),
        isBirthdateFlowConfirmYes: confirmYes,
        isBirthdateFlowConfirmNo: confirmNo,
        hasPendingNormalizedBirthdate: Boolean(pending?.normalizedBirthdate),
      }),
    );
    if (confirmYes) {
      if (!pending?.normalizedBirthdate) {
        clearBirthdateChangeFlow(userId);
        console.log(
          JSON.stringify({
            event: "BIRTHDATE_CHANGE_STATE_CLEARED",
            userId,
            reason: "final_confirm_yes_missing_pending",
          }),
        );
        console.log(
          JSON.stringify({
            event: "BIRTHDATE_FLOW_FINAL_CONFIRM_OUTCOME",
            userId,
            outcome: "yes_ack_but_missing_pending_cleared",
            turnConsumedByHandler: true,
          }),
        );
        return true;
      }
      await saveBirthdate(userId, pending.normalizedBirthdate, {
        rawBirthdateInput: pending.rawBirthdateInput,
      });
      clearBirthdateChangeFlow(userId);
      console.log(
        JSON.stringify({
          event: "BIRTHDATE_CHANGE_STATE_CLEARED",
          userId,
          reason: "birthdate_saved",
          isoDate: pending.isoDate ?? null,
        }),
      );
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
        turnPerf,
      });
      return true;
    }
    if (confirmNo) {
      setBirthdateChangeFlowState(userId, BIRTHDATE_CHANGE_FLOW.WAITING_DATE, null);
      const ask = pickBirthdateAskDateLine(userId);
      if (
        invokePhase1GeminiOrchestrator &&
        (await invokePhase1GeminiOrchestrator()).handled
      )
        return true;
      await sendNonScanReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "birthdate_change_ask_date_again",
        semanticKey: "waiting_birthdate_change",
        text: `โอเคครับ บอกวันเกิดมาใหม่ได้เลยครับ\n\n${ask}`,
      });
      return true;
    }
    if (looksLikeBirthdateInput(text)) {
      if (
        invokePhase1GeminiOrchestrator &&
        (await invokePhase1GeminiOrchestrator()).handled
      )
        return true;
      await sendNonScanReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "birthdate_change_please_confirm_first_final",
        semanticKey: "waiting_birthdate_change_confirm",
        text: "ถ้าถูก ตอบว่าใช่ หรือโอเค มาก็ได้ครับ",
      });
      return true;
    }
    const pe = pending?.echoDisplay || "";
    if (
        invokePhase1GeminiOrchestrator &&
        (await invokePhase1GeminiOrchestrator()).handled
      )
        return true;
    await sendNonScanReply({
      client,
      userId,
      replyToken: event.replyToken,
      replyType: "birthdate_change_ask_final_again",
      semanticKey: "waiting_birthdate_change_confirm",
      text: pickBirthdateFinalConfirmText(userId, pe),
    });
    console.log(
      JSON.stringify({
        event: "BIRTHDATE_FLOW_FINAL_CONFIRM_OUTCOME",
        userId,
        outcome: "reask_final_confirm",
        turnConsumedByHandler: true,
      }),
    );
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
  turnCache = undefined,
  turnPerf = undefined,
}) {
  if (!forcePaymentIntent && !isPaymentCommand(text, lowerText)) {
    return false;
  }

  const payRouteSnapshot = await loadGeminiRoutingSnapshot({
    userId,
    session,
    text,
    lowerText,
    now: Date.now(),
    turnCache,
    turnPerf,
  });
  const invokePhase1PaymentRoute = async () =>
    invokePhase1GeminiFromSnapshot({
      snapshot: payRouteSnapshot,
      userId,
      text,
      lowerText,
      client,
      event,
      session,
      delegates: buildNoopGeminiDelegates(),
    });

  try {
    const ps = getPaymentState(userId).state;
    const row = payRouteSnapshot.activePendingPaymentRow;
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
      if ((await invokePhase1PaymentRoute()).handled) return true;
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
    if ((await invokePhase1PaymentRoute()).handled) return true;
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
    if ((await invokePhase1PaymentRoute()).handled) return true;
    await sendScanLockReply(client, {
      userId,
      replyToken: event.replyToken,
      lockType: "hard",
      semanticKey: "scan_locked_hard:payment_command",
    });
    return true;
  }

  let accessForPayIntent = payRouteSnapshot.activeAccessDecision;
  try {
    if (accessForPayIntent == null) {
      accessForPayIntent = await checkScanAccess({ userId });
    }
  } catch (e) {
    console.error("[WEBHOOK] checkScanAccess (payment command guard) failed:", {
      userId,
      message: e?.message,
    });
  }

  let rowForPayIntent = payRouteSnapshot.activePendingPaymentRow;
  try {
    if (rowForPayIntent == null) {
      rowForPayIntent = await getLatestAwaitingPaymentForLineUserId(userId);
    }
  } catch (_) {}

  if (shouldEmitPayNotNeededForPaymentIntent(accessForPayIntent, rowForPayIntent)) {
    const payload = buildPayNotNeededIntentPayload({
      accessDecision: accessForPayIntent,
      session,
    });
    console.log(
      JSON.stringify({
        event: "PAYMENT_INTENT_BLOCKED_ACCESS_ALLOWED",
        userId,
        accessReason: accessForPayIntent?.reason ?? null,
        replyType: payload.replyType,
      }),
    );
    if ((await invokePhase1PaymentRoute()).handled) return true;
    await sendNonScanReply({
      client,
      userId,
      replyToken: event.replyToken,
      replyType: payload.replyType,
      semanticKey: payload.semanticKey,
      text: payload.primaryText,
      alternateTexts: payload.alternateTexts,
    });
    return true;
  }

  if (
    accessForPayIntent?.allowed === true &&
    rowForPayIntent &&
    isActiveSlipPaymentRow(rowForPayIntent)
  ) {
    if (String(rowForPayIntent.status) === "pending_verify") {
      let paymentRefPv = null;
      try {
        paymentRefPv =
          rowForPayIntent.payment_ref ||
          (await ensurePaymentRefForPaymentId(rowForPayIntent.id));
      } catch (_) {
        paymentRefPv = null;
      }
      if ((await invokePhase1PaymentRoute()).handled) return true;
      await sendNonScanReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "pending_verify_payment_cmd",
        semanticKey: "pending_verify_payment_cmd_inflight",
        text: buildPendingVerifyPaymentCommandText({ userId, paymentRef: paymentRefPv }),
        alternateTexts: [
          "รอแอดมินตรวจสลิปก่อนนะครับ ถ้ายังไม่ได้แนบสลิป แนบในแชตนี้ได้เลยครับ",
        ],
      });
      return true;
    }
    if (String(rowForPayIntent.status) === "awaiting_payment") {
      const offerInflight = loadActiveScanOffer();
      const pkgInflight = rowForPayIntent.package_code
        ? findPackageByKey(offerInflight, String(rowForPayIntent.package_code))
        : null;
      const paidPackageInflight = pkgInflight || getDefaultPackage(offerInflight);
      let paymentRefInflight = null;
      try {
        paymentRefInflight =
          rowForPayIntent.payment_ref ||
          (await ensurePaymentRefForPaymentId(rowForPayIntent.id));
      } catch (_) {
        paymentRefInflight = null;
      }
      if (!paidPackageInflight) {
        const humanNoPkgInflight = buildPaymentPayIntentNoPackageHumanText({
          offer: offerInflight,
          userId,
        });
        if ((await invokePhase1PaymentRoute()).handled) return true;
        await sendNonScanReply({
          client,
          userId,
          replyToken: event.replyToken,
          replyType: "payment_pay_intent_no_package",
          semanticKey: "payment_pay_intent_no_package_inflight",
          text: humanNoPkgInflight,
          alternateTexts: [],
        });
        return true;
      }
      const qrUrlInflight = getPromptPayQrPublicUrl();
      const introInflight = buildPaymentQrIntroText({
        paymentRef: paymentRefInflight,
        paidPackage: paidPackageInflight,
      });
      const slipTextInflight = buildPaymentQrSlipText();
      if (isPromptPayQrUrlHttpsForLine(qrUrlInflight)) {
        try {
          await sendNonScanPaymentQrInstructions({
            client,
            userId,
            replyToken: event.replyToken,
            introText: introInflight,
            qrImageUrl: qrUrlInflight,
            slipText: slipTextInflight,
            replyType: "payment_qr_instructions_bundle",
            semanticKey: paymentRefInflight
              ? `payment_qr_bundle_resend:${paymentRefInflight}`
              : "payment_qr_bundle_resend",
            paymentId: rowForPayIntent.id,
            paymentRef: paymentRefInflight,
            packageKey: paidPackageInflight?.key,
          });
          return true;
        } catch (qrErr) {
          console.error("[WEBHOOK] payment QR resend (inflight) failed:", {
            userId,
            message: qrErr?.message,
          });
        }
      }
      const payCmdBodyInflight = buildPaymentInstructionText({
        amount: paidPackageInflight.priceThb,
        currency: env.PAYMENT_UNLOCK_CURRENCY || "THB",
        paymentRef: paymentRefInflight,
        paidPackage: paidPackageInflight,
      });
      if ((await invokePhase1PaymentRoute()).handled) return true;
      await sendNonScanReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "payment_instruction_text",
        semanticKey: "payment_command_text_resend_inflight",
        text: payCmdBodyInflight,
        alternateTexts: [payCmdBodyInflight],
      });
      return true;
    }
  }

  const offerPay = loadActiveScanOffer();
  const selectedPayKey = getSelectedPaymentPackageKey(userId);
  const paidPackage =
    (selectedPayKey && findPackageByKey(offerPay, selectedPayKey)) ||
    getDefaultPackage(offerPay);

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
    if ((await invokePhase1PaymentRoute()).handled) return true;
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
    const hadPackageKey = Boolean(getSelectedPaymentPackageKey(userId));
    emitAwaitingPaymentEntered({
      userId,
      paymentId: cmdPaymentId,
      paymentRef: cmdPaymentRef,
      packageKey: paidPackage?.key,
      source: "payment_command_text_route",
      hadPackageSelected: hadPackageKey,
    });
    setAwaitingPayment(userId);
    emitSlipPhaseEntered({
      userId,
      paymentId: cmdPaymentId,
      paymentRef: cmdPaymentRef,
      packageKey: paidPackage?.key,
      source: "payment_command_text_route",
    });
    clearSelectedPaymentPackageKey(userId);
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
      await sendNonScanPaymentQrInstructions({
        client,
        userId,
        replyToken: event.replyToken,
        introText: intro,
        qrImageUrl: qrUrl,
        slipText,
        replyType: "payment_qr_instructions_bundle",
        semanticKey: cmdPaymentRef
          ? `payment_qr_bundle:${cmdPaymentRef}`
          : "payment_qr_bundle",
        paymentId: cmdPaymentId,
        paymentRef: cmdPaymentRef,
        packageKey: paidPackage?.key,
      });
      await logPaywallShown(userId, {
        patternUsed: "qr_intro_image_slip",
        bubbleCount: 3,
        source: "payment_command",
        ...(cmdPaymentId ? { paymentId: cmdPaymentId } : {}),
      });
      return true;
    } catch (qrErr) {
      console.error("[WEBHOOK] payment QR gateway send failed, fallback text:", {
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
  if ((await invokePhase1PaymentRoute()).handled) return true;
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
  invokePhase1GeminiOrchestrator = null,
}) {
  if (
    invokePhase1GeminiOrchestrator &&
    (await invokePhase1GeminiOrchestrator()).handled
  )
    return;
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

async function handleHistoryCommand({
  client,
  replyToken,
  userId,
  invokePhase1GeminiOrchestrator = null,
}) {
  const history = getScanHistory(userId);

  if (!history.length) {
    if (
      invokePhase1GeminiOrchestrator &&
      (await invokePhase1GeminiOrchestrator()).handled
    )
      return;
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
  if (
    invokePhase1GeminiOrchestrator &&
    (await invokePhase1GeminiOrchestrator()).handled
  )
    return;
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

async function handleStatsCommand({
  client,
  replyToken,
  userId,
  invokePhase1GeminiOrchestrator = null,
}) {
  const stats = getUserStats(userId);

  if (!stats) {
    if (
      invokePhase1GeminiOrchestrator &&
      (await invokePhase1GeminiOrchestrator()).handled
    )
      return;
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

  if (
    invokePhase1GeminiOrchestrator &&
    (await invokePhase1GeminiOrchestrator()).handled
  )
    return;
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
  turnCache = undefined,
  turnPerf = undefined,
}) {
  console.log("[WEBHOOK] finalize accepted image", {
    userId,
    flowVersion,
    eventTimestamp,
    imageBufferLength: imageBuffer?.length || 0,
  });

  // Access truth + DB payment row together: active slip rows win over object-scan even if scan access is allowed.
  let accessDecision;
  const accessFromParent =
    turnCache &&
    Object.prototype.hasOwnProperty.call(turnCache, "accessDecision");
  if (accessFromParent) {
    accessDecision = turnCache.accessDecision;
  } else {
    try {
      accessDecision = await checkScanAccess({ userId });
      if (turnCache) turnCache.accessDecision = accessDecision;
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
  }

  const hasPaidAccess =
    accessDecision?.allowed === true && accessDecision?.reason === "paid";

  let pendingPayment = null;
  const paymentFromParent =
    turnCache &&
    Object.prototype.hasOwnProperty.call(turnCache, "pendingPaymentRow");
  if (paymentFromParent) {
    pendingPayment = turnCache.pendingPaymentRow;
    if (turnPerf) {
      turnPerf.log("AWAITING_PAYMENT_LOOKUP_READY", {
        source: "cache",
        gate: "finalize_image",
      });
    }
  } else {
    try {
      console.log("[SLIP_VERIFY_LOOKUP] start", {
        userId,
        source: "finalizeAcceptedImage",
        messageId: event?.message?.id || null,
      });
      pendingPayment = await getLatestAwaitingPaymentForLineUserId(userId);
      if (turnCache) turnCache.pendingPaymentRow = pendingPayment;
    } catch (err) {
      console.error("[PAYMENT_SLIP_VERIFY] lookup pending payment failed:", {
        userId,
        message: err?.message,
        code: err?.code,
        hint: err?.hint,
      });
    }
  }

  const paymentOwnsImage = paymentRowOwnsImageRouting(pendingPayment);

  const chosenPath =
    paymentOwnsImage && pendingPayment
      ? "slip"
      : !accessDecision?.allowed &&
          accessDecision?.reason === "payment_required" &&
          !paymentOwnsImage
        ? "payment_gate"
        : "scan";
  console.log("[IMAGE_ROUTING_DECISION]", {
    userId,
    hasPaidAccess,
    accessReason: accessDecision?.reason ?? null,
    hasAwaitingPayment: Boolean(pendingPayment),
    paymentOwnsImage,
    chosenPath,
  });
  if (turnPerf) {
    turnPerf.log("ROUTE_DECIDED", {
      chosenPath,
      accessReason: accessDecision?.reason ?? null,
    });
  }

  const imgPhase1Invoke = async () =>
    invokePhase1FreshNoop({
      userId,
      client,
      event,
      session: getSession(userId),
      turnCache,
      turnPerf,
    });

  // Access denied (quota / paywall): end in non-scan gateway only — never duplicate/object/AI scan.
  if (chosenPath === "payment_gate") {
    console.log(
      JSON.stringify({
        event: "ACCESS_GATE_PAYWALL_NON_SCAN_ONLY",
        userId,
        flowVersion,
        messageId: event?.message?.id ?? null,
        chosenPath,
        accessReason: accessDecision?.reason ?? null,
      }),
    );
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
      if ((await imgPhase1Invoke()).handled) return;
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

    console.log("[PAYMENT_GATE_REPLY_SELECTION]", {
      userId,
      chosenPath,
      accessAllowed: Boolean(accessDecision?.allowed),
      accessReason: accessDecision?.reason ?? null,
      replyType: "free_quota_exhausted_deterministic",
      copyKey: "scan_offer:free_quota_exhausted_deterministic",
      templateKey: "free_quota_exhausted_deterministic",
    });
    await sendFreeQuotaExhaustedPaywallViaGateway({
      client,
      userId,
      replyToken: event.replyToken,
      flowVersion,
      messageId: event?.message?.id ?? null,
      accessDecision,
      pathSegment: "access_gate",
      turnPerf,
    });
    await logPaywallShown(userId, {
      patternUsed: "finalize_image_free_quota_exhausted_deterministic",
      bubbleCount: 1,
      source: "finalize_image_payment_required_text_only",
    });
    return;
  }

  if (chosenPath === "scan") {
    console.log(
      JSON.stringify({
        event: "SCAN_V2_PATH_ENTER",
        path: "web",
        lineUserIdPrefix: lineUserIdPrefix8(userId),
        messageId: event?.message?.id ?? null,
        flowVersion,
        timestamp: scanV2TraceTs(),
      }),
    );
  }

  if (paymentOwnsImage && pendingPayment) {
    console.log(
      JSON.stringify({
        event: "PAYMENT_STATE_WON_IMAGE_ROUTING",
        userId,
        paymentId: pendingPayment.id ?? null,
        status: pendingPayment.status ?? null,
        accessAllowed: Boolean(accessDecision?.allowed),
      }),
    );
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
      if ((await imgPhase1Invoke()).handled) return;
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
      console.log(
        JSON.stringify({
          event: "PENDING_VERIFY_STATE_ENFORCED",
          userId,
          paymentId: pendingPayment.id ?? null,
          replyType: "pending_verify_block_scan",
        }),
      );
      if ((await imgPhase1Invoke()).handled) return;
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

    const slipVal = await evaluateAwaitingPaymentSlipImage({
      imageBuffer,
      userId,
      paymentId,
      messageId: slipMessageId ?? null,
      flowState: "awaiting_payment",
    });

    if (!slipVal.proceed) {
      await sendNonScanReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "slip_not_transfer_receipt",
        semanticKey: "deterministic_slip_not_transfer_receipt",
        text: buildSlipNotTransferReceiptText(),
        alternateTexts: [
          "ลองส่งสลิปโอนที่เห็นยอดและเวลาชัด ๆ ในแชตนี้ได้เลยครับ",
        ],
      });
      return;
    }

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

      logSlipPendingVerifyRouted({
        userId,
        paymentId,
        messageId: slipMessageId ?? null,
        flowState: "awaiting_payment",
      });

      await setPaymentSlipPendingVerify({
        paymentId,
        slipUrl,
        slipMessageId,
      });

      console.log(
        JSON.stringify({
          event: "SLIP_RECEIVED_STATE_TRANSITION",
          userId,
          paymentId,
          nextStatus: "pending_verify",
        }),
      );

      let slipPaymentRef = null;
      try {
        slipPaymentRef =
          pendingPayment.payment_ref ||
          (await ensurePaymentRefForPaymentId(paymentId));
      } catch (_) {
        slipPaymentRef = null;
      }

      emitPendingVerifyEntered({
        userId,
        paymentId,
        paymentRef: slipPaymentRef,
        packageKey: pendingPayment?.package_code
          ? String(pendingPayment.package_code).trim()
          : undefined,
        reason: "slip_uploaded_set_pending_verify",
      });

      clearPaymentState(userId);
      markAcceptedImageEvent(userId, eventTimestamp);
      clearLatestScanJob(userId);

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

      if ((await imgPhase1Invoke()).handled) return;
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
    if ((await imgPhase1Invoke()).handled) return;
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
  if (turnPerf) {
    turnPerf.log("OBJECT_CHECK_DONE", { objectCheckResult: objectCheck });
  }

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

    await sendUnsupportedObjectRejectionViaGateway({
      client,
      userId,
      replyToken: event.replyToken,
      flowVersion,
      messageId: event?.message?.id ?? null,
      objectCheckResult: "unsupported",
      replyType: "unsupported_object",
    });
    return;
  }

  if (objectCheck !== "single_supported") {
    markAcceptedImageEvent(userId, eventTimestamp);
    clearLatestScanJob(userId);
    clearSessionIfFlowVersionMatches(userId, flowVersion);

    await sendUnsupportedObjectRejectionViaGateway({
      client,
      userId,
      replyToken: event.replyToken,
      flowVersion,
      messageId: event?.message?.id ?? null,
      objectCheckResult: String(objectCheck),
      replyType: "unsupported_object_fallback",
    });
    return;
  }

  console.log(
    JSON.stringify({
      event: "SCAN_V2_OBJECT_CHECK_OK",
      path: "web",
      lineUserIdPrefix: lineUserIdPrefix8(userId),
      messageId: event?.message?.id ?? null,
      flowVersion,
      objectCheckResult: objectCheck,
      timestamp: scanV2TraceTs(),
    }),
  );

  markAcceptedImageEvent(userId, eventTimestamp);

  // Quota / access denied is handled only at `chosenPath === "payment_gate"` above (before duplicate/object/scan).

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
    console.log(
      JSON.stringify({
        event: "SCAN_V2_BIRTHDATE_READY",
        path: "web",
        lineUserIdPrefix: lineUserIdPrefix8(userId),
        messageId: event?.message?.id ?? null,
        flowVersion,
        hasSavedBirthdate: true,
        source: "finalize_accepted_image",
        timestamp: scanV2TraceTs(),
      }),
    );

    if (!env.ENABLE_ASYNC_SCAN_V2 && env.ENABLE_LEGACY_WEB_INLINE_SCAN) {
      console.log(
        JSON.stringify({
          event: "LEGACY_WEB_INLINE_SCAN_ENTER",
          path: "web",
          lineUserIdPrefix: lineUserIdPrefix8(userId),
          messageId: event?.message?.id ?? null,
          flowVersion,
          reason: "async_v2_off_legacy_inline",
          timestamp: scanV2TraceTs(),
        }),
      );
      await runScanFlow({
        client,
        replyToken: event.replyToken,
        userId,
        imageBuffer,
        birthdate: savedBirthdate,
        flowVersion,
        skipBirthdateSave: true,
        reportPipelineContext: { objectCheckResult: objectCheck },
      });
      return;
    }

    if (!env.ENABLE_ASYNC_SCAN_V2) {
      console.error(
        JSON.stringify({
          event: "SCAN_V2_WEB_DISABLED",
          path: "web",
          lineUserIdPrefix: lineUserIdPrefix8(userId),
          messageId: event?.message?.id ?? null,
          flowVersion,
          reason: "ENABLE_ASYNC_SCAN_V2_not_true",
          timestamp: scanV2TraceTs(),
        }),
      );
      try {
        await replyText(
          client,
          event.replyToken,
          "ขออภัยครับ ระบบสแกนชั่วคราวไม่พร้อม ลองใหม่อีกครั้งในภายหลังนะครับ",
        );
      } catch (replyErr) {
        console.error(
          JSON.stringify({
            event: "SCAN_V2_WEB_DISABLED_REPLY_ERROR",
            path: "web",
            lineUserIdPrefix: lineUserIdPrefix8(userId),
            messageId: event?.message?.id ?? null,
            message: replyErr?.message,
            timestamp: scanV2TraceTs(),
          }),
        );
      }
      return;
    }

    let ingestFailed = false;
    let ingestReason = "unknown";
    let ingestErrorMessage = /** @type {string | null} */ (null);
    try {
      const ing = await ingestScanImageAsyncV2({
        userId,
        lineMessageId: event.message.id,
        imageBuffer,
        birthdateSnapshot: savedBirthdate,
        accessDecision,
        flowVersion,
      });
      if (ing?.ok) {
        console.log(
          JSON.stringify({
            event: "SCAN_V2_INGEST_OK",
            path: "web",
            lineUserIdPrefix: lineUserIdPrefix8(userId),
            messageId: event?.message?.id ?? null,
            flowVersion,
            uploadIdPrefix: idPrefix8(ing.uploadId ?? null),
            jobIdPrefix: idPrefix8(ing.jobId ?? null),
            outboundIdPrefix: idPrefix8(ing.outboundId ?? null),
            duplicate: Boolean(ing.duplicate),
            timestamp: scanV2TraceTs(),
          }),
        );
        turnPerf?.log("SCAN_JOB_ENQUEUED", {
          path: "web",
          flowVersion,
          uploadIdPrefix: idPrefix8(ing.uploadId ?? null),
          jobIdPrefix: idPrefix8(ing.jobId ?? null),
          outboundIdPrefix: idPrefix8(ing.outboundId ?? null),
          duplicate: Boolean(ing.duplicate),
        });
        return;
      }
      ingestFailed = true;
      ingestReason = ing?.error ?? "unknown";
      ingestErrorMessage =
        ing?.errorMessage != null ? String(ing.errorMessage) : null;
    } catch (ingErr) {
      ingestFailed = true;
      ingestReason = "exception";
      ingestErrorMessage = String(ingErr?.message || ingErr || "exception");
      console.error(
        JSON.stringify({
          event: "SCAN_V2_INGEST_FAIL",
          path: "web",
          lineUserIdPrefix: lineUserIdPrefix8(userId),
          messageId: event?.message?.id ?? null,
          flowVersion,
          reason: ingestReason,
          errorMessage: ingestErrorMessage,
          timestamp: scanV2TraceTs(),
        }),
      );
    }

    if (ingestFailed) {
      if (
        env.ENABLE_SYNC_SCAN_FALLBACK &&
        env.ENABLE_LEGACY_WEB_INLINE_SCAN
      ) {
        console.warn(
          JSON.stringify({
            event: "SCAN_V2_INGEST_FALLBACK_SYNC",
            path: "web",
            lineUserIdPrefix: lineUserIdPrefix8(userId),
            messageId: event?.message?.id ?? null,
            flowVersion,
            reason: ingestReason,
            timestamp: scanV2TraceTs(),
          }),
        );
        console.log(
          JSON.stringify({
            event: "LEGACY_WEB_INLINE_SCAN_ENTER",
            path: "web",
            lineUserIdPrefix: lineUserIdPrefix8(userId),
            messageId: event?.message?.id ?? null,
            flowVersion,
            reason: "ingest_failed_sync_fallback_with_legacy",
            timestamp: scanV2TraceTs(),
          }),
        );
        await runScanFlow({
          client,
          replyToken: event.replyToken,
          userId,
          imageBuffer,
          birthdate: savedBirthdate,
          flowVersion,
          skipBirthdateSave: true,
          reportPipelineContext: { objectCheckResult: objectCheck },
        });
        return;
      }
      if (ingestReason !== "exception") {
        console.error(
          JSON.stringify({
            event: "SCAN_V2_INGEST_FAIL",
            path: "web",
            lineUserIdPrefix: lineUserIdPrefix8(userId),
            messageId: event?.message?.id ?? null,
            flowVersion,
            reason: ingestReason,
            errorMessage: ingestErrorMessage,
            timestamp: scanV2TraceTs(),
          }),
        );
      }
      if (env.ENABLE_SYNC_SCAN_FALLBACK) {
        console.warn(
          JSON.stringify({
            event: "SCAN_V2_SYNC_FALLBACK_SKIPPED_REQUIRES_LEGACY_FLAG",
            path: "web",
            lineUserIdPrefix: lineUserIdPrefix8(userId),
            messageId: event?.message?.id ?? null,
            flowVersion,
            reason: ingestReason,
            timestamp: scanV2TraceTs(),
          }),
        );
      }
      try {
        await replyText(
          client,
          event.replyToken,
          "ขออภัยครับ ระบบรับรูปชั่วคราวไม่สำเร็จ ลองส่งรูปใหม่อีกครั้งนะครับ",
        );
      } catch (replyErr) {
        console.error(
          JSON.stringify({
            event: "SCAN_V2_INGEST_FAIL_REPLY_ERROR",
            path: "web",
            lineUserIdPrefix: lineUserIdPrefix8(userId),
            messageId: event?.message?.id ?? null,
            message: replyErr?.message,
            timestamp: scanV2TraceTs(),
          }),
        );
      }
      return;
    }
  }

  setPendingImage(
    userId,
    {
      messageId: event.message.id,
      imageBuffer,
      /** From `checkSingleObject` — forwarded when user sends birthdate later (waiting_birthdate). */
      objectCheckResult: objectCheck,
    },
    flowVersion
  );

  if ((await imgPhase1Invoke()).handled) return;
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
  resetScanFlowReplyTokenSpent(userId);

  const turnPerf = createTurnPerf(userId, "image", {
    messageId: event.message?.id ?? null,
  });
  const turnCache = {};
  turnPerf.log("TURN_START", {});

  const imagePhase1Invoke = async () =>
    invokePhase1FreshNoop({
      userId,
      client,
      event,
      session,
      turnCache,
      turnPerf,
    });

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
    if ((await imagePhase1Invoke()).handled) return;
    await sendScanLockReply(client, {
      userId,
      replyToken: event.replyToken,
      lockType: "hard",
      semanticKey: "scan_locked_hard:handle_image_after_locked_activity",
    });
    return;
  }

  let routeAccessDecision;
  let routePendingPayment = null;
  try {
    const [accResult, payResult] = await Promise.all([
      checkScanAccess({ userId }).catch((routeErr) => {
        console.error("[ABUSE_GUARD] checkScanAccess (image route) failed:", {
          userId,
          message: routeErr?.message,
        });
        return { allowed: false };
      }),
      getLatestAwaitingPaymentForLineUserId(userId).catch(() => null),
    ]);
    routeAccessDecision = accResult;
    routePendingPayment = payResult;
    turnCache.accessDecision = routeAccessDecision;
    turnCache.pendingPaymentRow = routePendingPayment;
    turnPerf.log("ACCESS_SNAPSHOT_READY", { source: "parallel_fetch" });
    turnPerf.log("AWAITING_PAYMENT_LOOKUP_READY", { source: "parallel_fetch" });
  } catch (bundleErr) {
    console.error("[WEBHOOK] image route access+payment parallel fetch failed:", {
      userId,
      message: bundleErr?.message,
    });
    routeAccessDecision = { allowed: false };
    routePendingPayment = null;
    turnCache.accessDecision = routeAccessDecision;
    turnCache.pendingPaymentRow = null;
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
      if ((await imagePhase1Invoke()).handled) return;
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
      if ((await imagePhase1Invoke()).handled) return;
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
      "รบกวนตอบกลับเป็นข้อความก่อนนะครับ ถ้าถูก ตอบว่าใช่ หรือโอเค มาก็ได้";
    if (st === BIRTHDATE_CHANGE_FLOW.WAITING_DATE) {
      const askLine = pickBirthdateAskDateLine(userId);
      hint = `ตอนนี้กำลังรอวันเกิดใหม่อยู่ครับ รบกวนพิมพ์วันเกิดเป็นข้อความก่อนนะครับ\n\n${askLine}`;
    } else if (st === BIRTHDATE_CHANGE_FLOW.WAITING_FINAL_CONFIRM) {
      hint =
        "รบกวนตอบกลับเป็นข้อความยืนยันก่อนนะครับ ถ้าถูก ตอบว่าใช่ หรือโอเค มาก็ได้";
    }
    await sendNonScanReply({
      client,
      userId,
      replyToken: event.replyToken,
      replyType: "birthdate_update_prompt_image",
      semanticKey: "birthdate_update_prompt",
      text: hint,
      alternateTexts: [
        `${hint}\n\nลองบอกวันเกิดใหม่ตามรูปแบบ DD/MM/YYYY ได้เลยครับ`,
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
    const pendingPaymentExists = Boolean(turnCache.pendingPaymentRow);

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
        if ((await imagePhase1Invoke()).handled) return;
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

    logMultiImageGroupRejected({
      userId,
      flowVersion,
      firstMessageId: latestCandidate.firstMessageId,
      latestMessageId: latestCandidate.latestMessageId,
      count: latestCandidate.count,
      reason: "candidate_window",
    });
    await sendMultiImageRejectionViaGateway({
      client,
      userId,
      replyToken: event.replyToken,
      reason: "candidate_window",
      flowVersion,
      firstMessageId: latestCandidate.firstMessageId,
      latestMessageId: latestCandidate.latestMessageId,
      count: latestCandidate.count,
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

    logMultiImageGroupRejected({
      userId,
      flowVersion,
      firstMessageId: latestCandidate.firstMessageId,
      latestMessageId: latestCandidate.latestMessageId,
      count: latestCandidate.count,
      reason: "burst_window",
    });
    await sendMultiImageRejectionViaGateway({
      client,
      userId,
      replyToken: event.replyToken,
      reason: "burst_window",
      flowVersion,
      firstMessageId: latestCandidate.firstMessageId,
      latestMessageId: latestCandidate.latestMessageId,
      count: latestCandidate.count,
    });
    return;
  }

  setUserProcessingImage(userId);

  try {
    const imageBuffer = await getImageBufferFromLineMessage(
      client,
      event.message.id
    );
    turnPerf.log("IMAGE_FETCH_DONE", {
      imageBytes: imageBuffer?.length ?? 0,
    });

    clearPendingImageCandidate(userId);

    await finalizeAcceptedImage({
      client,
      event,
      userId,
      flowVersion,
      eventTimestamp,
      imageBuffer,
      turnCache,
      turnPerf,
    });
  } finally {
    clearUserProcessingImage(userId);
  }
}

async function handleTextMessage({ client, event, userId, session }) {
  const text = String(event.message.text || "").trim();
  const lowerText = text.toLowerCase();
  const now = Date.now();

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

  const turnPerf = createTurnPerf(userId, "text", {
    messageId: event.message?.id ?? null,
  });
  const turnCache = {};
  turnPerf.log("TURN_START", {});

  const geminiSnapshot = await loadGeminiRoutingSnapshot({
    userId,
    session,
    text,
    lowerText,
    now,
    turnCache,
    turnPerf,
  });

  turnPerf.log("ROUTE_DECIDED", {
    paymentState: geminiSnapshot.paymentState,
    flowState: geminiSnapshot.flowState,
    canonicalStateOwner: geminiSnapshot.canonicalStateOwner,
  });

  const textSpam = registerTextEvent(userId, text, now);

  if (textSpam.state.isHardBlocked) {
    console.warn("[ABUSE_GUARD_HARD_BLOCK]", { userId, source: "text_register" });
    const invokeP1TextHard = async () =>
      invokePhase1GeminiFromSnapshot({
        snapshot: geminiSnapshot,
        userId,
        text,
        lowerText,
        client,
        event,
        session,
        delegates: buildNoopGeminiDelegates(),
      });
    const gfHard = await invokeP1TextHard();
    if (gfHard.handled) return;
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
   * 4) approved_intro / explicit commands (history, stats, menu — resolveActiveState ranks menu before scan-ready idle)
   * 5) Generic non-scan fallback (idle persona) — must not run while 2) or 3) owns the turn
   *
   * PAYMENT_WINS: when flowState is waiting_birthdate but paymentState is active, payment branches run first;
   * see STATE_CONFLICT_RESOLVED log.
   */
  // Active-state routing hardening:
  // Deterministic state ownership decides the turn (replyType / semanticKey).
  // Persona / content pools must not choose branches — only soften wording (e.g. idle alternates).
  // Generic menu/idle runs only when no interactive session still owns the turn.
  const {
    activeAccessDecision,
    activePendingPaymentRow,
    paymentMemoryState,
    wsActive,
    activeResolved,
    paymentState,
    flowState,
    accessState,
    isPaywallGateWithPendingScan,
    pendingStatus,
    hasPendingVerify,
    hasAwaitingSlip,
    canonicalStateOwner,
    geminiConversationOwner,
  } = geminiSnapshot;

  console.log(
    JSON.stringify({
      event: "TEXT_TURN_ROUTING_SNAPSHOT",
      lineUserId: userId,
      lastUserText: text.slice(0, 200),
      checkScanAccess: activeAccessDecision
        ? {
            allowed: activeAccessDecision.allowed,
            reason: activeAccessDecision.reason ?? null,
            paidRemainingScans: activeAccessDecision.paidRemainingScans ?? null,
          }
        : null,
      latestPaymentRow: activePendingPaymentRow
        ? {
            id: activePendingPaymentRow.id ?? null,
            status: activePendingPaymentRow.status ?? null,
            created_at: activePendingPaymentRow.created_at ?? null,
          }
        : null,
      manualPaymentStore: { state: paymentMemoryState || "none" },
      wsActive: {
        paymentState,
        flowState,
        accessState,
        pendingStatus,
        hasAwaitingSlip,
        hasPendingVerify,
        canonicalStateOwner,
        resolutionReason: activeResolved.resolutionReason,
      },
      chosenBranch: canonicalStateOwner,
      replyType: null,
    }),
  );

  void insertLineConversationMessage(userId, "user", text);

  emitActiveStateRouting({
    userId,
    stateOwner: activeResolved.stateOwner,
    resolutionReason: activeResolved.resolutionReason,
    expectedInputKind: activeResolved.expectedInputKind,
    noProgressStreak: activeResolved.noProgressStreak,
    flowState,
    paymentState,
    accessState,
    text: text.slice(0, 120),
    primarySnapshot: true,
  });

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

  /** Phase-1 Gemini runs only after deterministic shortcuts / micro-intents above each insertion point. */
  const invokePhase1GeminiOrchestrator = async () => {
    const phase1GeminiKey = resolveGeminiPhase1StateKey({
      session,
      paymentState,
      flowState,
      hasPendingVerify,
      hasAwaitingSlip,
      paymentMemoryState,
      selectedPackageKey: getSelectedPaymentPackageKey(userId) || null,
      canonicalStateOwner,
    });
    if (!phase1GeminiKey) return { handled: false };
    return runGeminiFrontOrchestrator({
      userId,
      text,
      lowerText,
      phase1State: phase1GeminiKey,
      conversationOwner: geminiConversationOwner,
      paymentState,
      flowState,
      accessState,
      pendingPaymentStatus: pendingStatus || null,
      selectedPackageKey: getSelectedPaymentPackageKey(userId) || null,
      noProgressStreak: activeResolved.noProgressStreak ?? 0,
      sendGatewayReply: async ({ replyType, semanticKey, text, alternateTexts }) => {
        await sendNonScanReply({
          client,
          userId,
          replyToken: event.replyToken,
          replyType,
          semanticKey,
          text,
          alternateTexts: alternateTexts || [],
        });
      },
      delegates: {
        sendQrBundle: async () => {
          const ok = await handlePaymentCommandTextRoute({
            client,
            event,
            userId,
            session,
            text,
            lowerText,
            isPaywallGateWithPendingScan,
            forcePaymentIntent: true,
            turnCache,
            turnPerf,
          });
          return Boolean(ok);
        },
        createOrReusePayment: async () => {
          const ok = await handlePaymentCommandTextRoute({
            client,
            event,
            userId,
            session,
            text,
            lowerText,
            isPaywallGateWithPendingScan,
            forcePaymentIntent: true,
            turnCache,
            turnPerf,
          });
          return Boolean(ok);
        },
        getPaymentStatusReply: async () => {
          const offer = loadActiveScanOffer();
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
            resetSameStateAckStreak(userId, "pending_verify");
            const streak = bumpGuidanceNoProgress(userId, "pending_verify");
            const tier = guidanceTierFromStreak(streak);
            const pendingText =
              tier === "full"
                ? buildPendingVerifyHumanGuidanceText({ paymentRef })
                : buildPendingVerifyStatusShortText({ paymentRef });
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
            return true;
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
            resetSameStateAckStreak(userId, "awaiting_slip");
            const hintText = buildAwaitingSlipStatusHintText({ paymentRef });
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
                "short",
                paymentRef,
              ),
            });
            return true;
          }
          if (paymentState === "paywall_offer_single") {
            const defaultPkg = getDefaultPackage(offer);
            const selectedKey = getSelectedPaymentPackageKey(userId);
            const selectedPkg =
              selectedKey && offer
                ? findPackageByKey(offer, selectedKey)
                : null;
            const primary = selectedPkg
              ? buildPaymentPackageSelectedGentleRemindText()
              : buildSingleOfferPaywallAltText(offer);
            const menuAlt = defaultPkg
              ? buildSingleOfferPaywallAltText(offer)
              : primary;
            await sendNonScanReplyWithOptionalConvSurface({
              client,
              userId,
              replyToken: event.replyToken,
              replyType: "paywall_payment_status_delegate",
              semanticKey: "paywall_payment_status_delegate",
              text: primary,
              alternateTexts: [menuAlt],
              convSurface: buildConvSurfacePaywall(
                userId,
                text,
                "paywall_payment_status_delegate",
                primary,
                "short",
                defaultPkg,
              ),
            });
            return true;
          }
          return false;
        },
        selectPackageFromText: async () => {
          if (paymentState !== "paywall_offer_single") return false;
          const offer = loadActiveScanOffer();
          const defaultPkg = getDefaultPackage(offer);
          if (!defaultPkg) return false;
          const priceOrPackAck =
            defaultPkg &&
            (isSingleOfferPriceToken(text, offer) ||
              parsePackageSelectionFromText(text, offer, {
                thaiRelativeAliases: true,
                allowEoaPricePhrase: true,
              }));
          if (!priceOrPackAck) return false;
          const pkg = defaultPkg;
          resetGuidanceNoProgress(userId, "paywall_offer_single");
          resetSameStateAckStreak(userId, "paywall_offer_single");
          setSelectedPaymentPackageKey(userId, pkg.key);
          emitPackageSelectedEntered({
            userId,
            packageKey: pkg.key,
            source: "gemini_delegate_select_package",
          });
          const outboundRt = "package_selected_ack_full";
          const ack = buildPaymentPackageSelectedAck(pkg);
          await sendNonScanReplyWithOptionalConvSurface({
            client,
            userId,
            replyToken: event.replyToken,
            replyType: outboundRt,
            semanticKey: outboundRt,
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
          return true;
        },
        sendHelpDeterministic: async () => {
          await sendNonScanReply({
            client,
            userId,
            replyToken: event.replyToken,
            replyType: "gemini_front_help_deterministic",
            semanticKey: "gemini_front_help_deterministic:phase1",
            text: "ช่วยสั้นๆ: ต้องการชำระแจ้งว่าจ่ายเงินได้ หรือส่งรูปสลิปในแชตนี้หลังโอน รอแอดมินตรวจสลิปก่อนใช้ครับ",
            alternateTexts: [
              "ถ้าส่งสลิปแล้ว รอแจ้งผลในแชตนี้ได้เลยครับ",
            ],
          });
          return true;
        },
      },
    });
  };

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
      if ((await invokePhase1GeminiOrchestrator()).handled) return;
      await sendNonScanReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "soft_verify_prompt",
        semanticKey: "soft_verify_prompt",
        text: "ก่อนคุยต่อ ตอบว่ายืนยันมาก็ได้ครับ",
        alternateTexts: [
          "ถ้าต้องการใช้งานต่อ บอกว่าเริ่มมาก็ได้ครับ",
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

  if (
    !getBirthdateChangeFlowState(userId) &&
    matchesExplicitBirthdateChangeCommand(text)
  ) {
    console.log(
      JSON.stringify({
        event: "BIRTHDATE_CHANGE_INTENT_MATCHED",
        userId,
        inputText: text,
        matchKind: "explicit_command",
      }),
    );
    setBirthdateChangeFlowState(userId, BIRTHDATE_CHANGE_FLOW.WAITING_DATE, null);
    console.log(
      JSON.stringify({
        event: "BIRTHDATE_CHANGE_STATE_ENTERED",
        userId,
        birthdateChangeState: "awaiting_new_birthdate",
        sessionState: BIRTHDATE_CHANGE_FLOW.WAITING_DATE,
      }),
    );
    const askDirect = pickBirthdateAskDateLine(userId);
    await sendNonScanReply({
      client,
      userId,
      replyToken: event.replyToken,
      replyType: "birthdate_change_ask_date_direct",
      semanticKey: "waiting_birthdate_change",
      text: askDirect,
      alternateTexts: [askDirect],
      turnPerf,
    });
    return;
  }

  if (getBirthdateChangeFlowState(userId)) {
    const bdDone = await handleBirthdateChangeFlowTurn({
      client,
      event,
      userId,
      session,
      text,
      invokePhase1GeminiOrchestrator,
      turnPerf,
    });
    if (bdDone) return;
  }

  if (paymentState === "paywall_offer_single") {
    const offer = loadActiveScanOffer();
    const defaultPkg = getDefaultPackage(offer);

    const paywallOwner =
      canonicalStateOwner === "paywall_selecting_package" ||
      canonicalStateOwner === "payment_package_selected"
        ? canonicalStateOwner
        : mapWebhookContextToStateOwner({
            userId,
            paymentState: "paywall_offer_single",
            paymentMemoryState,
          });
    if (paywallOwner) {
      logSafeIntentResolved(userId, paywallOwner, text, lowerText, {
        routeReason: "paywall_text_guard",
      });
    }

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
      if ((await invokePhase1GeminiOrchestrator()).handled) return;
      await sendNonScanReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "birthdate_update_prompt_paywall",
        semanticKey: "birthdate_change_candidate",
        text: pickBirthdateFirstConfirmQuestion(userId),
        alternateTexts: [
          `${pickBirthdateFirstConfirmQuestion(userId)}\nยืนยันได้ด้วยคำว่าใช่ หรือโอเคนะครับ`,
        ],
      });
      return;
    }

    const selectedKeyPaywall = getSelectedPaymentPackageKey(userId);
    const selectedPkgPaywall =
      selectedKeyPaywall && offer
        ? findPackageByKey(offer, selectedKeyPaywall)
        : null;

    if (selectedPkgPaywall && shouldPackageSelectedShortcutToQr(text, selectedPkgPaywall, offer)) {
      let normalizedIntent = "package_selected_proceed";
      if (isPaymentCommand(text, lowerText)) {
        normalizedIntent = "pay_intent";
      } else if (isGenericAckText(text)) {
        normalizedIntent = "generic_proceed";
      } else if (
        isPackageSelectedSamePackageConfirmText(text, selectedPkgPaywall, offer)
      ) {
        normalizedIntent = "same_package_confirm";
      } else if (isResendQrIntentText(text)) {
        normalizedIntent = "resend_qr";
      } else if (isPackageSelectedProceedIntentText(text)) {
        normalizedIntent = "pay_now_proceed";
      }

      resetGuidanceNoProgress(userId, "paywall_offer_single");
      resetSameStateAckStreak(userId, "paywall_offer_single");
      console.log(
        JSON.stringify({
          event: "PAYMENT_PAY_INTENT_CONSUMED",
          userId,
          paymentState,
          inputText: text,
          action: "create_or_show_payment_qr",
          source: "package_selected_shortcut",
        }),
      );
      logSafeIntentConsumed({
        userId,
        activeState: "payment_package_selected",
        inputText: text,
        normalizedIntent,
        action: "create_or_show_payment_qr",
      });
      logStateMicroIntent({
        userId,
        activeState: "payment_package_selected",
        inputText: text,
        normalizedIntent,
        confidence: "exact",
        chosenReplyType: "package_selected_pay_now",
      });
      emitActiveStateRouting({
        userId,
        flowState,
        paymentState,
        accessState,
        canonicalStateOwner,
        stateOwner: "payment_package_selected",
        replyFamily: "paywall_single_offer",
        expectedInputType: "payment_command",
        text,
        chosenReplyType: "package_selected_pay_now",
        routeReason: "package_selected_to_qr_shortcut",
      });
      await handlePaymentCommandTextRoute({
        client,
        event,
        userId,
        session,
        text,
        lowerText,
        isPaywallGateWithPendingScan,
        forcePaymentIntent: true,
        turnCache,
        turnPerf,
      });
      return;
    }

    if (matchesDeterministicPaywallPurchaseIntent(text, lowerText)) {
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
      console.log(
        JSON.stringify({
          event: "PAYWALL_AFFIRM_INTENT_MATCHED",
          userId,
          paymentState,
          inputText: text,
        }),
      );
      console.log(
        JSON.stringify({
          event: "PAYMENT_DETAILS_ROUTED_FROM_PAYWALL_ACK",
          userId,
          inputText: text,
        }),
      );
      logSafeIntentConsumed({
        userId,
        activeState: "paywall_offer_single",
        inputText: text,
        normalizedIntent: "pay_intent",
        action: "create_or_show_payment_qr",
      });
      const payIntentReplyType = getSelectedPaymentPackageKey(userId)
        ? "package_selected_pay_now"
        : "single_offer_paywall_pay_intent";
      logStateMicroIntent({
        userId,
        activeState: "paywall_offer_single",
        inputText: text,
        normalizedIntent: "pay_intent",
        confidence: "exact",
        chosenReplyType: payIntentReplyType,
      });
      emitActiveStateRouting({
        userId,
        flowState,
        paymentState,
        accessState,
        canonicalStateOwner,
        stateOwner: canonicalStateOwner,
        replyFamily: "paywall_single_offer",
        expectedInputType: "payment_command",
        text,
        chosenReplyType: payIntentReplyType,
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
        forcePaymentIntent: true,
        turnCache,
        turnPerf,
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
      setSelectedPaymentPackageKey(userId, pkg.key);
      emitPackageSelectedEntered({
        userId,
        packageKey: pkg.key,
        source: "paywall_offer_single_price_or_pack_ack",
      });
      const outboundRt = "package_selected_ack_full";
      logStateMicroIntent({
        userId,
        activeState: "paywall_offer_single",
        inputText: text,
        normalizedIntent: "single_offer_ack_price_or_pack",
        confidence: "near_safe",
        chosenReplyType: outboundRt,
      });
      emitActiveStateRouting({
        userId,
        flowState,
        paymentState,
        accessState,
        canonicalStateOwner,
        replyFamily: "paywall_single_offer",
        routeReason: "single_offer_price_or_token_ack",
        text,
        chosenReplyType: outboundRt,
      });
      const ack = buildPaymentPackageSelectedAck(pkg);
      if ((await invokePhase1GeminiOrchestrator()).handled) return;
      await sendNonScanReplyWithOptionalConvSurface({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: outboundRt,
        semanticKey: outboundRt,
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

    if (matchesDeterministicPaywallSoftDeclineIntent(text)) {
      console.log(
        JSON.stringify({
          event: "PAYWALL_DECLINE_INTENT_MATCHED",
          userId,
          paymentState,
          inputText: text,
        }),
      );
      resetGuidanceNoProgress(userId, "paywall_offer_single");
      resetSameStateAckStreak(userId, "paywall_offer_single");
      emitActiveStateRouting({
        userId,
        flowState,
        paymentState,
        accessState,
        canonicalStateOwner,
        replyFamily: "paywall_single_offer",
        routeReason: "deterministic_paywall_soft_close",
        text,
        chosenReplyType: "paywall_soft_decline_ack",
      });
      await sendNonScanReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "paywall_soft_decline_ack",
        semanticKey: "deterministic_paywall_soft_close",
        text: buildDeterministicPaywallSoftCloseText(),
        alternateTexts: [
          "โอเคครับ พรุ่งนี้ค่อยส่งรูปมาใหม่ได้เลยนะครับ",
        ],
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
      const waitOutboundRt = mapPaywallSurfaceReplyType(
        "single_offer_paywall_wait_tomorrow",
        userId,
      );
      logStateMicroIntent({
        userId,
        activeState: "paywall_offer_single",
        inputText: text,
        normalizedIntent: "wait_for_free_tomorrow",
        confidence: "near_safe",
        chosenReplyType: waitOutboundRt,
      });
      const primaryText = buildPaywallFatiguePromptText({
        offer,
        userId,
        tier,
        branch: "wait_tomorrow",
      });
      console.log(
        JSON.stringify({
          event: "PAYMENT_SINGLE_OFFER_PROMPT",
          userId,
          paymentState,
          canonicalStateOwner,
          inputText: text,
          reason: "wait_tomorrow_path",
        }),
      );
      emitActiveStateRouting({
        userId,
        flowState,
        paymentState,
        accessState,
        canonicalStateOwner,
        replyFamily: "paywall_single_offer",
        guidanceReason: "wait_tomorrow",
        text,
        chosenReplyType: waitOutboundRt,
        routeReason: "same_state_wait_tomorrow",
      });
      if ((await invokePhase1GeminiOrchestrator()).handled) return;
      await sendNonScanReplyWithOptionalConvSurface({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: waitOutboundRt,
        semanticKey: waitOutboundRt,
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
      const hesRt = mapPaywallSurfaceReplyType(
        "single_offer_paywall_hesitation",
        userId,
      );
      logStateMicroIntent({
        userId,
        activeState: "paywall_offer_single",
        inputText: text,
        normalizedIntent: "hesitation",
        confidence: "near_safe",
        chosenReplyType: hesRt,
      });
      if ((await invokePhase1GeminiOrchestrator()).handled) return;
      await sendNonScanReplyWithOptionalConvSurface({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: hesRt,
        semanticKey: hesRt,
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
      const pcRt = mapPaywallSurfaceReplyType(
        "single_offer_paywall_no_package_change",
        userId,
      );
      logStateMicroIntent({
        userId,
        activeState: "paywall_offer_single",
        inputText: text,
        normalizedIntent: "package_change_not_available_single_offer",
        confidence: "unclear",
        chosenReplyType: pcRt,
      });
      const primaryText = buildPaymentPackageSelectedUnclearText({ tier });
      if ((await invokePhase1GeminiOrchestrator()).handled) return;
      await sendNonScanReplyWithOptionalConvSurface({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: pcRt,
        semanticKey: pcRt,
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
      const ackOutboundRt = mapPaywallSurfaceReplyType(chosenReplyType, userId);
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
        chosenReplyType: ackOutboundRt,
      });
      emitActiveStateRouting({
        userId,
        flowState,
        paymentState,
        accessState,
        canonicalStateOwner,
        replyFamily: "paywall_single_offer",
        guidanceReason: "ack_continue",
        text,
        chosenReplyType: ackOutboundRt,
        routeReason: "same_state_ack_human",
      });
      const menuAlt = buildSingleOfferPaywallAltText(offer);
      if ((await invokePhase1GeminiOrchestrator()).handled) return;
      await sendNonScanReplyWithOptionalConvSurface({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: ackOutboundRt,
        semanticKey: ackOutboundRt,
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

    /** Phase-1 shadow scope here: `phase1KeyPaywall` is paywall_selecting_package or payment_package_selected (single paywall block). */
    const phase1KeyPaywall = resolveGeminiPhase1StateKey({
      session,
      paymentState,
      flowState,
      hasPendingVerify,
      hasAwaitingSlip,
      paymentMemoryState,
      selectedPackageKey: getSelectedPaymentPackageKey(userId) || null,
      canonicalStateOwner,
    });
    const paywallShadowDeterministicBranch =
      branch === "date_wrong"
        ? selectedPkgPaywall
          ? "payment_package_selected_date_wrong"
          : "paywall_selecting_date_wrong"
        : selectedPkgPaywall
          ? "payment_package_selected_unclear"
          : "paywall_selecting_unclear";
    void invokePhase1GeminiShadow({
      userId,
      text,
      deterministicBranch: paywallShadowDeterministicBranch,
      phase1State: phase1KeyPaywall,
      conversationOwner: geminiConversationOwner,
      paymentState,
      flowState,
      accessState,
      pendingPaymentStatus: pendingStatus || null,
      selectedPackageKey: getSelectedPaymentPackageKey(userId) || null,
    });

    resetSameStateAckStreak(userId, "paywall_offer_single");
    const streak = bumpGuidanceNoProgress(userId, "paywall_offer_single");
    const tier = guidanceTierFromStreak(streak);
    logStateGuidanceLevel({
      userId,
      activeState: selectedPkgPaywall
        ? "payment_package_selected"
        : "paywall_offer_single",
      noProgressCount: streak,
      guidanceLevel: tier,
    });
    const primaryText =
      branch === "date_wrong"
        ? buildPaywallFatiguePromptText({
            offer,
            userId,
            tier,
            branch: "date_wrong",
          })
        : selectedPkgPaywall
          ? buildPaymentPackageSelectedUnclearText({ tier })
          : buildPaywallFatiguePromptText({
              offer,
              userId,
              tier,
              branch: "unclear",
            });
    const chosenReplyType = resolvePaywallPromptReplyType(
      branch === "date_wrong" ? "date_wrong" : "unclear",
      tier,
    );
    const convLegacyKey =
      branch === "date_wrong"
        ? "single_offer_paywall_date_wrong_state"
        : chosenReplyType;
    const unclearOutboundRt = mapPaywallSurfaceReplyType(convLegacyKey, userId);
    logStateMicroIntent({
      userId,
      activeState: selectedPkgPaywall
        ? "payment_package_selected"
        : "paywall_offer_single",
      inputText: text,
      normalizedIntent:
        branch === "date_wrong"
          ? "wrong_state_date_like"
          : isUnclearNoiseText(text)
            ? "unrelated_noise"
            : "unclear",
      confidence: branch === "date_wrong" ? "near_safe" : "unclear",
      chosenReplyType: unclearOutboundRt,
    });
    console.log(
      JSON.stringify({
        event: "PAYMENT_SINGLE_OFFER_PROMPT",
        userId,
        paymentState,
        canonicalStateOwner,
        inputText: text,
        reason:
          branch === "date_wrong"
            ? "birthdate_like_while_paywall"
            : "unexpected_input_same_state",
      }),
    );
    emitActiveStateRouting({
      userId,
      flowState,
      paymentState,
      accessState,
      canonicalStateOwner,
      stateOwner: selectedPkgPaywall
        ? "payment_package_selected"
        : canonicalStateOwner,
      replyFamily: "paywall_single_offer",
      guidanceReason: branch,
      expectedInputType: "payment_or_wait_or_ack",
      text,
      chosenReplyType: unclearOutboundRt,
      routeReason: "unexpected_input_kept_in_state",
    });
    console.log("[UNEXPECTED_INPUT_HANDLED]", {
      userId,
      activeState: selectedPkgPaywall
        ? "payment_package_selected"
        : "paywall_offer_single",
      inputText: text,
      normalizedIntent: branch,
      chosenReplyType: unclearOutboundRt,
    });
    logHumanConversationMemory({
      event: "HUMAN_SURFACE_FALLBACK",
      userId,
      surface: "deterministic_paywall_unclear",
    });
    const menuAlt = selectedPkgPaywall
      ? buildPaymentPackageSelectedGentleRemindText()
      : buildSingleOfferPaywallAltText(offer);
    if ((await invokePhase1GeminiOrchestrator()).handled) return;
    await sendNonScanReplyWithOptionalConvSurface({
      client,
      userId,
      replyToken: event.replyToken,
      replyType: unclearOutboundRt,
      semanticKey: unclearOutboundRt,
      text: primaryText,
      alternateTexts: [menuAlt],
      convSurface: buildConvSurfacePaywall(
        userId,
        text,
        convLegacyKey,
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

    logSafeIntentResolved(userId, "awaiting_slip", text, lowerText, {
      routeReason: "awaiting_slip_text_guard",
    });

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
      if ((await invokePhase1GeminiOrchestrator()).handled) return;
      await sendNonScanReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "birthdate_update_prompt_awaiting_slip",
        semanticKey: "birthdate_change_candidate",
        text: pickBirthdateFirstConfirmQuestion(userId),
        alternateTexts: [
          `${pickBirthdateFirstConfirmQuestion(userId)}\n\nยืนยันได้ด้วยคำว่าใช่ หรือโอเคนะครับ`,
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
        turnCache,
        turnPerf,
      });
      return;
    }

    if (isSlipClaimWithoutImageIntent(text)) {
      resetSameStateAckStreak(userId, "awaiting_slip");
      const streakClaim = bumpGuidanceNoProgress(userId, "awaiting_slip");
      const tierClaim = guidanceTierFromStreak(streakClaim);
      logStateGuidanceLevel({
        userId,
        activeState: "awaiting_slip",
        noProgressCount: streakClaim,
        guidanceLevel: tierClaim,
      });
      const slipRtClaim =
        tierClaim === "full" ? "awaiting_slip_guidance" : "awaiting_slip_gentle_remind";
      emitStateMicroIntent({
        userId,
        activeState: "awaiting_slip",
        stateOwner: "awaiting_slip",
        microIntent: "slip_claim_but_no_image",
        inputText: text,
        confidence: "near_safe",
        chosenReplyType: slipRtClaim,
      });
      const slipReminderClaim = buildAwaitingSlipFatigueGuidanceText({
        paymentRef,
        tier: tierClaim,
        kind: "default",
      });
      if ((await invokePhase1GeminiOrchestrator()).handled) return;
      await sendNonScanReplyWithOptionalConvSurface({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: slipRtClaim,
        semanticKey: slipRtClaim,
        text: slipReminderClaim,
        alternateTexts: [
          "ส่งรูปสลิปในแชตนี้ได้เลยครับ",
          "ถ้าโอนแล้ว แนบสลิปมาในแชตนี้ได้เลยครับ",
        ],
        convSurface: buildConvSurfaceAwaitingSlip(
          userId,
          text,
          slipRtClaim,
          slipReminderClaim,
          tierClaim,
          paymentRef,
        ),
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
      emitActiveStateRouting({
        userId,
        flowState,
        paymentState,
        accessState,
        canonicalStateOwner,
        stateOwner: canonicalStateOwner,
        replyFamily: "awaiting_slip",
        expectedInputType: "slip_status",
        text,
        chosenReplyType: "awaiting_slip_status_hint",
        routeReason: "awaiting_slip_status_micro",
      });
      if ((await invokePhase1GeminiOrchestrator()).handled) return;
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
      if ((await invokePhase1GeminiOrchestrator()).handled) return;
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

    const phase1KeyAwaitingSlip = resolveGeminiPhase1StateKey({
      session,
      paymentState,
      flowState,
      hasPendingVerify,
      hasAwaitingSlip,
      paymentMemoryState,
      selectedPackageKey: getSelectedPaymentPackageKey(userId) || null,
      canonicalStateOwner,
    });
    void invokePhase1GeminiShadow({
      userId,
      text,
      deterministicBranch: "awaiting_slip_default",
      phase1State: phase1KeyAwaitingSlip,
      conversationOwner: geminiConversationOwner,
      paymentState,
      flowState,
      accessState,
      pendingPaymentStatus: pendingStatus || null,
      selectedPackageKey: getSelectedPaymentPackageKey(userId) || null,
    });

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
    emitActiveStateRouting({
      userId,
      flowState,
      paymentState,
      accessState,
      canonicalStateOwner,
      stateOwner: canonicalStateOwner,
      replyFamily: "awaiting_slip",
      expectedInputType: "slip_image_or_slip_status",
      text,
      chosenReplyType:
        tier === "full" ? "awaiting_slip_guidance" : "awaiting_slip_gentle_remind",
      routeReason: "awaiting_slip_text_guard",
    });
    const slipRemReplyType =
      tier === "full" ? "awaiting_slip_guidance" : "awaiting_slip_gentle_remind";
    if ((await invokePhase1GeminiOrchestrator()).handled) return;
    await sendNonScanReplyWithOptionalConvSurface({
      client,
      userId,
      replyToken: event.replyToken,
      replyType: slipRemReplyType,
      semanticKey: slipRemReplyType,
      text: slipReminder,
      alternateTexts: [
        "ส่งรูปสลิปในแชตนี้ได้เลยครับ",
        "อยากดูคิวอาร์อีกครั้ง แจ้งว่าจ่ายเงินมาก็ได้ครับ",
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

    logSafeIntentResolved(userId, "pending_verify", text, lowerText, {
      routeReason: "pending_verify_text_guard",
    });

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
      if ((await invokePhase1GeminiOrchestrator()).handled) return;
      await sendNonScanReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "birthdate_update_prompt_pending_verify",
        semanticKey: "birthdate_change_candidate",
        text: pickBirthdateFirstConfirmQuestion(userId),
        alternateTexts: [
          `${pickBirthdateFirstConfirmQuestion(userId)}\n\nยืนยันได้ด้วยคำว่าใช่ หรือโอเคนะครับ`,
        ],
      });
      return;
    }

    if (isPaymentCommand(text, lowerText)) {
      resetSameStateAckStreak(userId, "pending_verify");
      if ((await invokePhase1GeminiOrchestrator()).handled) return;
      await sendNonScanReply({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: "pending_verify_payment_cmd",
        semanticKey: "pending_verify_payment_cmd",
        text: buildPendingVerifyPaymentCommandText({ userId, paymentRef }),
        alternateTexts: [
          "รอแอดมินตรวจสลิปก่อนนะครับ ถ้ายังไม่ได้แนบสลิป แนบในแชตนี้ได้เลยครับ",
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
      emitActiveStateRouting({
        userId,
        flowState,
        paymentState,
        accessState,
        canonicalStateOwner,
        stateOwner: canonicalStateOwner,
        replyFamily: "pending_verify",
        expectedInputType: "status_like",
        text,
        chosenReplyType: "pending_verify_status",
        routeReason: "pending_verify_status_micro",
      });
      if ((await invokePhase1GeminiOrchestrator()).handled) return;
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

      if (isPendingVerifyReassuranceIntent(text)) {
        resetSameStateAckStreak(userId, "pending_verify");
        const streakPvRe = bumpGuidanceNoProgress(userId, "pending_verify");
        const tierPvRe = guidanceTierFromStreak(streakPvRe);
        logStateGuidanceLevel({
          userId,
          activeState: "pending_verify",
          noProgressCount: streakPvRe,
          guidanceLevel: tierPvRe,
        });
        emitStateMicroIntent({
          userId,
          activeState: "pending_verify",
          stateOwner: "pending_verify",
          microIntent: "reassurance_needed",
          inputText: text,
          confidence: "near_safe",
          chosenReplyType:
            tierPvRe === "full"
              ? "pending_verify_guidance"
              : "pending_verify_gentle_remind",
        });
        const pendingTextRe = buildPendingVerifyGentleRemindText({ paymentRef });
        const pvReplyTypeRe =
          tierPvRe === "full"
            ? "pending_verify_guidance"
            : "pending_verify_gentle_remind";
        if ((await invokePhase1GeminiOrchestrator()).handled) return;
        await sendNonScanReplyWithOptionalConvSurface({
          client,
          userId,
          replyToken: event.replyToken,
          replyType: pvReplyTypeRe,
          semanticKey: pvReplyTypeRe,
          text: pendingTextRe,
          alternateTexts: [
            "รอแจ้งผลในแชตนี้ได้เลยครับ",
            buildPendingVerifyReminderText({ paymentRef }),
          ],
          convSurface: buildConvSurfacePendingVerify(
            userId,
            text,
            pvReplyTypeRe,
            pendingTextRe,
            tierPvRe,
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
      emitActiveStateRouting({
        userId,
        flowState,
        paymentState,
        accessState,
        canonicalStateOwner,
        stateOwner: canonicalStateOwner,
        replyFamily: "pending_verify",
        expectedInputType: "short_ack",
        text,
        chosenReplyType: pvReplyType,
        routeReason: "pending_verify_ack_human",
      });
      if ((await invokePhase1GeminiOrchestrator()).handled) return;
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

    const phase1KeyPendingVerify = resolveGeminiPhase1StateKey({
      session,
      paymentState,
      flowState,
      hasPendingVerify,
      hasAwaitingSlip,
      paymentMemoryState,
      selectedPackageKey: getSelectedPaymentPackageKey(userId) || null,
      canonicalStateOwner,
    });
    void invokePhase1GeminiShadow({
      userId,
      text,
      deterministicBranch: "pending_verify_default",
      phase1State: phase1KeyPendingVerify,
      conversationOwner: geminiConversationOwner,
      paymentState,
      flowState,
      accessState,
      pendingPaymentStatus: pendingStatus || null,
      selectedPackageKey: getSelectedPaymentPackageKey(userId) || null,
    });

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
    emitActiveStateRouting({
      userId,
      flowState,
      paymentState,
      accessState,
      canonicalStateOwner,
      stateOwner: canonicalStateOwner,
      replyFamily: "pending_verify",
      expectedInputType: "status_like",
      text,
      chosenReplyType: pvReplyType,
      routeReason: "pending_verify_text_guard",
    });
    if ((await invokePhase1GeminiOrchestrator()).handled) return;
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
      emitActiveStateRouting({
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
      logSafeIntentResolved(userId, "waiting_birthdate", text, lowerText, {
        routeReason: "waiting_birthdate_early_non_parse",
      });

      const isDateLike = looksLikeBirthdateInput(text);

      if (!parsedEarly.ok && /^\d{6,7}$/.test(trimmedEarly)) {
        const ambStreak = bumpGuidanceNoProgress(userId, "waiting_birthdate");
        const ambTier = guidanceTierFromStreak(ambStreak);
        const ambMsg =
          ambTier === "micro"
            ? "ลองบอกวันเกิดมาใหม่ได้เลยครับ"
            : BIRTHDATE_CHANGE_LOW_CONFIDENCE_TEXT;
        emitStateMicroIntent({
          userId,
          activeState: "waiting_birthdate",
          stateOwner: "waiting_birthdate",
          microIntent: "invalid_date",
          inputText: text,
          confidence: "near_safe",
          chosenReplyType: "waiting_birthdate_ambiguous_compact",
        });
        if ((await invokePhase1GeminiOrchestrator()).handled) return;
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
        emitStateMicroIntent({
          userId,
          activeState: "waiting_birthdate",
          stateOwner: "waiting_birthdate",
          microIntent: "invalid_date",
          inputText: text,
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
        emitActiveStateRouting({
          userId,
          flowState,
          paymentState,
          accessState,
          expectedInputType: "birthdate_dd_mm_yyyy",
          text,
          chosenReplyType: "waiting_birthdate_error",
          routeReason: "unexpected_input_kept_in_state",
        });
        if ((await invokePhase1GeminiOrchestrator()).handled) return;
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
        emitStateMicroIntent({
          userId,
          activeState: "waiting_birthdate",
          stateOwner: "waiting_birthdate",
          microIntent: "paymentish_text",
          inputText: text,
          confidence: "near_safe",
          chosenReplyType: "waiting_birthdate_wrong_state_redirect",
        });
        const bdDeferPrimary = buildWaitingBirthdatePaymentDeferredRedirectText();
        if ((await invokePhase1GeminiOrchestrator()).handled) return;
        await sendNonScanReplyWithOptionalConvSurface({
          client,
          userId,
          replyToken: event.replyToken,
          replyType: "waiting_birthdate_wrong_state_redirect",
          semanticKey: "waiting_birthdate_wrong_state_redirect",
          text: bdDeferPrimary,
          alternateTexts: [
            "ตอนนี้ขอวันเกิดก่อนนะครับ เช่น 19/08/1985 บอกอาจารย์ได้เลยครับ",
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

      if ((await invokePhase1GeminiOrchestrator()).handled) return;

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
      emitStateMicroIntent({
        userId,
        activeState: "waiting_birthdate",
        stateOwner: "waiting_birthdate",
        microIntent: ack ? "ack" : "unrelated_noise",
        inputText: text,
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
      emitActiveStateRouting({
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
      if ((await invokePhase1GeminiOrchestrator()).handled) return;
      const scanReadyText = buildPaidActiveScanReadyHumanText(userId);
      emitActiveStateRouting({
        userId,
        flowState,
        paymentState,
        accessState,
        canonicalStateOwner,
        stateOwner: canonicalStateOwner,
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
          "ส่งรูปมา 1 รูป เดี๋ยวอาจารย์อ่านให้",
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
        if ((await invokePhase1GeminiOrchestrator()).handled) return;
        await sendNonScanReply({
          client,
          userId,
          replyToken: event.replyToken,
          replyType: "pending_verify_payment_cmd",
          semanticKey: "pending_verify_payment_cmd",
          text: buildPendingVerifyPaymentCommandText({ userId, paymentRef }),
          alternateTexts: [
            "รอแอดมินตรวจสลิปก่อนนะครับ ถ้ายังไม่ได้แนบสลิป แนบในแชตนี้ได้เลยครับ",
          ],
        });
        return;
      }
      if (!allowsUtilityCommandsDuringPendingVerify(text, lowerText)) {
        const pvRem = buildPendingVerifyReminderText({
          userId,
          paymentRef,
        });
        if ((await invokePhase1GeminiOrchestrator()).handled) return;
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
            invokePhase1GeminiOrchestrator,
          });
          return;
        }
        if (isStatsCommand(text, lowerText)) {
          await handleStatsCommand({
            client,
            replyToken: event.replyToken,
            userId,
            invokePhase1GeminiOrchestrator,
          });
          return;
        }
        if (isBirthdateChangeCandidateText(text)) {
          setBirthdateChangeFlowState(userId, BIRTHDATE_CHANGE_FLOW.CANDIDATE, null);
          if ((await invokePhase1GeminiOrchestrator()).handled) return;
          await sendNonScanReply({
            client,
            userId,
            replyToken: event.replyToken,
            replyType: "birthdate_update_prompt_pending_verify",
            semanticKey: "birthdate_change_candidate",
            text: pickBirthdateFirstConfirmQuestion(userId),
            alternateTexts: [
              `${pickBirthdateFirstConfirmQuestion(userId)}\n\nยืนยันได้ด้วยคำว่าใช่ หรือโอเคนะครับ`,
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
              : "ถ้ายังไม่มีวันเกิดที่บันทึกไว้ ระบบจะขอวันเกิดก่อนสแกน",
            "",
            "ส่งรูปถัดไปมาได้เลยครับ",
          ].join("\n");
          if ((await invokePhase1GeminiOrchestrator()).handled) return;
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
            "2) ระบบจะขอวันเกิด (DD/MM/YYYY)",
            "3) ระบบจะส่งผลการสแกนกลับมาในแชทนี้",
            "",
            `หากหมดสิทธิ์ฟรี: เลือกแพ็กด้วย ${payPick} แล้วแจ้งว่าจ่ายเงินมาได้ครับ`,
          ].join("\n");
          if ((await invokePhase1GeminiOrchestrator()).handled) return;
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
                "ส่งรูป 1 รูป → บอกวันเกิด DD/MM/YYYY → รอผลในแชท",
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
            invokePhase1GeminiOrchestrator,
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
    const memoryPaymentStateForBd = getPaymentState(userId).state;
    const pendingPayRow = await getLatestAwaitingPaymentForLineUserId(userId);
    const hasAwaitingPaymentRow =
      pendingPayRow && String(pendingPayRow.status) === "awaiting_payment";
    const slipReminderActionable =
      hasAwaitingPaymentRow &&
      isAwaitingPaymentActionableForTextRouting({
        accessDecision: activeAccessDecision,
        latestPaymentRow: pendingPayRow,
        paymentMemoryState: memoryPaymentStateForBd,
      });

    if (
      session.pendingImage &&
      memoryPaymentStateForBd !== "awaiting_slip" &&
      !isPaywallGateWithPendingScan
    ) {
      if (slipReminderActionable) {
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
        if ((await invokePhase1GeminiOrchestrator()).handled) return;
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
        if ((await invokePhase1GeminiOrchestrator()).handled) return;
        await sendNonScanReply({
          client,
          userId,
          replyToken: event.replyToken,
          replyType: "birthdate_update_prompt_waiting_bd",
          semanticKey: "birthdate_change_candidate",
          text: pickBirthdateFirstConfirmQuestion(userId),
          alternateTexts: [
            `${pickBirthdateFirstConfirmQuestion(userId)}\n\nยืนยันได้ด้วยคำว่าใช่ หรือโอเคนะครับ`,
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
          if ((await invokePhase1GeminiOrchestrator()).handled) return;
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
        {
          const pendingMsgId = session.pendingImage?.messageId ?? null;
          console.log(
            JSON.stringify({
              event: "SCAN_V2_BIRTHDATE_READY",
              path: "web",
              lineUserIdPrefix: lineUserIdPrefix8(userId),
              messageId: pendingMsgId,
              flowVersion,
              hasSavedBirthdate: true,
              source: "waiting_birthdate_text",
              timestamp: scanV2TraceTs(),
            }),
          );
        }
        if (!env.SEND_PRE_SCAN_ACK_PUSH_ONLY) {
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
            console.error("[LINE] before_scan sequence failed (ignored):", {
              userId,
              message: beforeScanErr?.message,
            });
          }
        }

        const pendingMsgIdForV2 = session.pendingImage?.messageId ?? null;

        if (!env.ENABLE_ASYNC_SCAN_V2 && env.ENABLE_LEGACY_WEB_INLINE_SCAN) {
          console.log(
            JSON.stringify({
              event: "LEGACY_WEB_INLINE_SCAN_ENTER",
              path: "web",
              lineUserIdPrefix: lineUserIdPrefix8(userId),
              messageId: pendingMsgIdForV2,
              flowVersion,
              reason: "async_v2_off_legacy_inline",
              source: "waiting_birthdate_text",
              timestamp: scanV2TraceTs(),
            }),
          );
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

        if (!env.ENABLE_ASYNC_SCAN_V2) {
          console.error(
            JSON.stringify({
              event: "SCAN_V2_WEB_DISABLED",
              path: "web",
              lineUserIdPrefix: lineUserIdPrefix8(userId),
              messageId: pendingMsgIdForV2,
              flowVersion,
              reason: "ENABLE_ASYNC_SCAN_V2_not_true",
              source: "waiting_birthdate_text",
              timestamp: scanV2TraceTs(),
            }),
          );
          try {
            await replyText(
              client,
              event.replyToken,
              "ขออภัยครับ ระบบสแกนชั่วคราวไม่พร้อม ลองใหม่อีกครั้งในภายหลังนะครับ",
            );
          } catch (replyErr) {
            console.error(
              JSON.stringify({
                event: "SCAN_V2_WEB_DISABLED_REPLY_ERROR",
                path: "web",
                lineUserIdPrefix: lineUserIdPrefix8(userId),
                messageId: pendingMsgIdForV2,
                source: "waiting_birthdate_text",
                message: replyErr?.message,
                timestamp: scanV2TraceTs(),
              }),
            );
          }
          return;
        }

        try {
          await saveBirthdate(userId, normalizedBirthdate, {
            rawBirthdateInput: trimmedLock,
          });
        } catch (bdErr) {
          console.error(
            "[WEBHOOK] saveBirthdate before V2 ingest failed (continue):",
            {
              userId,
              message: bdErr?.message,
            },
          );
        }
        setBirthdate(userId, normalizedBirthdate, flowVersion);

        let ingestFailed = false;
        let ingestReason = "unknown";
        let ingestErrorMessage = /** @type {string | null} */ (null);
        try {
          const ing = await ingestScanImageAsyncV2({
            userId,
            lineMessageId: session.pendingImage.messageId,
            imageBuffer: session.pendingImage.imageBuffer,
            birthdateSnapshot: normalizedBirthdate,
            accessDecision: activeAccessDecision,
            flowVersion,
          });
          if (ing?.ok) {
            console.log(
              JSON.stringify({
                event: "SCAN_V2_INGEST_OK",
                path: "web",
                lineUserIdPrefix: lineUserIdPrefix8(userId),
                messageId: pendingMsgIdForV2,
                flowVersion,
                uploadIdPrefix: idPrefix8(ing.uploadId ?? null),
                jobIdPrefix: idPrefix8(ing.jobId ?? null),
                outboundIdPrefix: idPrefix8(ing.outboundId ?? null),
                duplicate: Boolean(ing.duplicate),
                source: "waiting_birthdate_text",
                timestamp: scanV2TraceTs(),
              }),
            );
            clearSessionIfFlowVersionMatches(userId, flowVersion);
            return;
          }
          ingestFailed = true;
          ingestReason = ing?.error ?? "unknown";
          ingestErrorMessage =
            ing?.errorMessage != null ? String(ing.errorMessage) : null;
        } catch (ingErr) {
          ingestFailed = true;
          ingestReason = "exception";
          ingestErrorMessage = String(ingErr?.message || ingErr || "exception");
          console.error(
            JSON.stringify({
              event: "SCAN_V2_INGEST_FAIL",
              path: "web",
              lineUserIdPrefix: lineUserIdPrefix8(userId),
              messageId: pendingMsgIdForV2,
              flowVersion,
              reason: ingestReason,
              errorMessage: ingestErrorMessage,
              source: "waiting_birthdate_text",
              timestamp: scanV2TraceTs(),
            }),
          );
        }

        if (ingestFailed) {
          if (
            env.ENABLE_SYNC_SCAN_FALLBACK &&
            env.ENABLE_LEGACY_WEB_INLINE_SCAN
          ) {
            console.warn(
              JSON.stringify({
                event: "SCAN_V2_INGEST_FALLBACK_SYNC",
                path: "web",
                lineUserIdPrefix: lineUserIdPrefix8(userId),
                messageId: pendingMsgIdForV2,
                flowVersion,
                reason: ingestReason,
                source: "waiting_birthdate_text",
                timestamp: scanV2TraceTs(),
              }),
            );
            console.log(
              JSON.stringify({
                event: "LEGACY_WEB_INLINE_SCAN_ENTER",
                path: "web",
                lineUserIdPrefix: lineUserIdPrefix8(userId),
                messageId: pendingMsgIdForV2,
                flowVersion,
                reason: "ingest_failed_sync_fallback_with_legacy",
                source: "waiting_birthdate_text",
                timestamp: scanV2TraceTs(),
              }),
            );
            await runScanFlow({
              client,
              replyToken: event.replyToken,
              userId,
              imageBuffer: session.pendingImage.imageBuffer,
              birthdate: normalizedBirthdate,
              flowVersion,
              reportPipelineContext:
                session.pendingImage?.objectCheckResult != null &&
                String(session.pendingImage.objectCheckResult).trim() !== ""
                  ? {
                      objectCheckResult: String(
                        session.pendingImage.objectCheckResult,
                      ).trim(),
                    }
                  : null,
            });
            return;
          }
          if (ingestReason !== "exception") {
            console.error(
              JSON.stringify({
                event: "SCAN_V2_INGEST_FAIL",
                path: "web",
                lineUserIdPrefix: lineUserIdPrefix8(userId),
                messageId: pendingMsgIdForV2,
                flowVersion,
                reason: ingestReason,
                errorMessage: ingestErrorMessage,
                source: "waiting_birthdate_text",
                timestamp: scanV2TraceTs(),
              }),
            );
          }
          if (env.ENABLE_SYNC_SCAN_FALLBACK) {
            console.warn(
              JSON.stringify({
                event: "SCAN_V2_SYNC_FALLBACK_SKIPPED_REQUIRES_LEGACY_FLAG",
                path: "web",
                lineUserIdPrefix: lineUserIdPrefix8(userId),
                messageId: pendingMsgIdForV2,
                flowVersion,
                reason: ingestReason,
                source: "waiting_birthdate_text",
                timestamp: scanV2TraceTs(),
              }),
            );
          }
          try {
            await replyText(
              client,
              event.replyToken,
              "ขออภัยครับ ระบบรับรูปชั่วคราวไม่สำเร็จ ลองส่งรูปใหม่อีกครั้งนะครับ",
            );
          } catch (replyErr) {
            console.error(
              JSON.stringify({
                event: "SCAN_V2_INGEST_FAIL_REPLY_ERROR",
                path: "web",
                lineUserIdPrefix: lineUserIdPrefix8(userId),
                messageId: pendingMsgIdForV2,
                message: replyErr?.message,
                source: "waiting_birthdate_text",
                timestamp: scanV2TraceTs(),
              }),
            );
          }
          return;
        }
      }

      if (!parsedLock.ok && /^\d{6,7}$/.test(trimmedLock)) {
        const ambStreak = bumpGuidanceNoProgress(userId, "waiting_birthdate");
        const ambTier = guidanceTierFromStreak(ambStreak);
        const ambMsg =
          ambTier === "micro"
            ? "ลองบอกวันเกิดมาใหม่ได้เลยครับ"
            : BIRTHDATE_CHANGE_LOW_CONFIDENCE_TEXT;
        if ((await invokePhase1GeminiOrchestrator()).handled) return;
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
        emitActiveStateRouting({
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
        if ((await invokePhase1GeminiOrchestrator()).handled) return;
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
        if ((await invokePhase1GeminiOrchestrator()).handled) return;
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
        if ((await invokePhase1GeminiOrchestrator()).handled) return;
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
      if ((await invokePhase1GeminiOrchestrator()).handled) return;
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
        emitActiveStateRouting({
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
        if ((await invokePhase1GeminiOrchestrator()).handled) return;
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
    if ((await invokePhase1GeminiOrchestrator()).handled) return;
    await sendNonScanReply({
      client,
      userId,
      replyToken: event.replyToken,
      replyType: "birthdate_update_prompt_open",
      semanticKey: "birthdate_change_candidate",
      text: pickBirthdateFirstConfirmQuestion(userId),
      alternateTexts: [
        `${pickBirthdateFirstConfirmQuestion(userId)}\n\nยืนยันได้ด้วยคำว่าใช่ หรือโอเคนะครับ`,
      ],
    });
    return;
  }

  if (isHistoryCommand(text, lowerText)) {
    await handleHistoryCommand({
      client,
      replyToken: event.replyToken,
      userId,
      invokePhase1GeminiOrchestrator,
    });
    return;
  }

  if (isStatsCommand(text, lowerText)) {
    await handleStatsCommand({
      client,
      replyToken: event.replyToken,
      userId,
      invokePhase1GeminiOrchestrator,
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
        if ((await invokePhase1GeminiOrchestrator()).handled) return;
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
      setSelectedPaymentPackageKey(userId, pkg.key);
      emitPackageSelectedEntered({
        userId,
        packageKey: pkg.key,
        source: "idle_text_package_hint",
        fromState: FunnelPhase.IDLE,
      });
      const idlePackRt = "package_selected_ack_full";
      const ack = buildPaymentPackageSelectedAck(pkg);
      if ((await invokePhase1GeminiOrchestrator()).handled) return;
      await sendNonScanReplyWithOptionalConvSurface({
        client,
        userId,
        replyToken: event.replyToken,
        replyType: idlePackRt,
        semanticKey: "package_selected_idle_package_pick",
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
      turnCache,
      turnPerf,
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
    emitActiveStateRouting({
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
    if ((await invokePhase1GeminiOrchestrator()).handled) return;
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
        : "ถ้ายังไม่มีวันเกิดที่บันทึกไว้ ระบบจะขอวันเกิดก่อนสแกน",
      "",
      "ส่งรูปถัดไปมาได้เลยครับ",
    ].join("\n");

    if ((await invokePhase1GeminiOrchestrator()).handled) return;
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
      "2) ระบบจะขอวันเกิด (DD/MM/YYYY)",
      "3) ระบบจะส่งผลการสแกนกลับมาในแชทนี้",
      "",
      `หากหมดสิทธิ์ฟรี: เลือกแพ็กด้วย ${payPickMain} แล้วแจ้งว่าจ่ายเงินมาได้ครับ`,
    ].join("\n");
    if ((await invokePhase1GeminiOrchestrator()).handled) return;
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
          "ส่งรูป 1 รูป → บอกวันเกิด DD/MM/YYYY → รอผลในแชท",
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
      invokePhase1GeminiOrchestrator,
    });
    return;
  }

  // True idle — generic fallback / recovery.
  await replyIdleTextNoDuplicate({
    client,
    replyToken: event.replyToken,
    userId,
    invokePhase1GeminiOrchestrator,
  });
}

async function handleEvent({ client, event }) {
  if (event.type !== "message") return;
  if (!event.replyToken) return;

  const userId = event.source?.userId;

  if (!userId) {
    auditExemptEnter(AuditExemptReason.LINE_WEBHOOK_MISSING_USER_ID);
    try {
      await replyText(client, event.replyToken, "ยังไม่พบข้อมูลผู้ใช้ครับ");
    } finally {
      auditExemptExit();
    }
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

  const session = getSession(userId);
  const eventPhase1Invoke = async () =>
    invokePhase1FreshNoop({
      userId,
      client,
      event,
      session,
    });

  if (globalStatus.isHardBlocked) {
    console.warn("[ABUSE_GUARD_HARD_BLOCK]", {
      userId,
      gate: "handleEvent",
      hardBlockReason: gateDiag.hardBlockReason,
    });
    if ((await eventPhase1Invoke()).handled) return;
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
    await mergeConversationStateFromDbIntoSession(userId);
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

  try {
    await maybeFlushPendingApprovedIntroCompensation({
      client,
      userId,
    });
  } catch (flushErr) {
    console.error(
      JSON.stringify({
        event: "APPROVE_PENDING_INTRO_FLUSH_OUTER",
        lineUserIdPrefix: String(userId || "").slice(0, 8),
        message:
          flushErr && typeof flushErr === "object" && "message" in flushErr
            ? String(/** @type {{ message?: unknown }} */ (flushErr).message)
            : String(flushErr),
      }),
    );
  }

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

export { handleTextMessage, handleEvent };

/**
 * Image message ids for one user within a single webhook batch (same-request multi-image).
 * @param {unknown[]} events
 * @param {string} userId
 * @returns {{ count: number, firstMessageId: string|null, latestMessageId: string|null }}
 */
function collectImageMessageMetaForUser(events, userId) {
  const uid = String(userId || "").trim();
  const ids = [];
  for (const ev of events) {
    if (ev?.type !== "message") continue;
    if (ev?.message?.type !== "image") continue;
    if (String(ev?.source?.userId || "").trim() !== uid) continue;
    const mid = ev?.message?.id;
    if (mid != null && mid !== "") ids.push(String(mid));
  }
  return {
    count: ids.length,
    firstMessageId: ids.length ? ids[0] : null,
    latestMessageId: ids.length ? ids[ids.length - 1] : null,
  };
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
            const batchMeta = collectImageMessageMetaForUser(events, userId);

            blockUserForRequest(userId);
            clearLatestScanJob(userId);
            clearSession(userId);
            clearPendingImageCandidate(userId);

            if (!multiImageUsersReplied.has(userId)) {
              multiImageUsersReplied.add(userId);

              console.log("[WEBHOOK] multi image request rejected", {
                userId,
                flowVersion,
                count: batchMeta.count,
                firstMessageId: batchMeta.firstMessageId,
                latestMessageId: batchMeta.latestMessageId,
              });

              logMultiImageGroupRejected({
                userId,
                flowVersion,
                firstMessageId: batchMeta.firstMessageId,
                latestMessageId: batchMeta.latestMessageId,
                count: batchMeta.count,
                reason: "same_webhook_batch",
              });
              await sendMultiImageRejectionViaGateway({
                client,
                userId,
                replyToken: event.replyToken || "",
                reason: "same_webhook_batch",
                flowVersion,
                firstMessageId: batchMeta.firstMessageId,
                latestMessageId: batchMeta.latestMessageId,
                count: batchMeta.count,
              });
            }

            console.log(
              "[WEBHOOK] skip image because multiple image events in same request",
              userId,
            );
            continue;
          }

          await handleEvent({ client, event });
        } catch (err) {
          console.error(
            `[WEBHOOK] event #${index + 1} error:`,
            JSON.stringify(serializeLineErrorSafe(err)),
          );

          if (event.replyToken) {
            try {
              const errUid = event.source?.userId || "";
              if (errUid) {
                const gfErr = await invokePhase1FreshNoop({
                  userId: errUid,
                  client,
                  event,
                  session: getSession(errUid),
                  text: "",
                  lowerText: "",
                });
                if (!gfErr.handled) {
                  console.log(
                    JSON.stringify({
                      event: "WEBHOOK_FALLBACK_PUSH_NOT_REPLY",
                      reason:
                        "handler_error_reply_token_may_be_consumed_by_long_running_flow",
                      userIdPrefix: errUid.slice(0, 8),
                    }),
                  );
                  await sendNonScanPushMessage({
                    client,
                    userId: errUid,
                    replyType: "webhook_event_error",
                    semanticKey: "system_error",
                    text: buildSystemErrorText(),
                    alternateTexts: [
                      "ขออภัยครับ มีข้อผิดพลาดชั่วคราว ลองส่งใหม่อีกครั้งได้เลย",
                    ],
                  });
                }
              } else {
                auditExemptEnter(AuditExemptReason.LINE_WEBHOOK_EVENT_ERROR_NO_USER);
                try {
                  await replyText(
                    client,
                    event.replyToken,
                    buildSystemErrorText(),
                  );
                } finally {
                  auditExemptExit();
                }
              }
            } catch (replyErr) {
              console.error(
                "[WEBHOOK] fallback error reply failed:",
                JSON.stringify(serializeLineErrorSafe(replyErr)),
              );
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