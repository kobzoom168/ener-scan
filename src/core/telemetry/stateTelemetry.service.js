import { TelemetryEvents, logTelemetryEvent } from "./telemetryEvents.js";
import { getSelectedPaymentPackageKey } from "../../stores/session.store.js";

/**
 * @param {Record<string, unknown>} payload
 */
function stripUndefined(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, v]) => v !== undefined && v !== null),
  );
}

const BASE_FIELDS = [
  "userId",
  "stateOwner",
  "microIntent",
  "replyType",
  "expectedInputKind",
  "noProgressStreak",
  "usedAi",
  "fallbackReason",
  "resolutionReason",
];

/**
 * @param {Record<string, unknown>} raw
 */
function pickStructured(raw = {}) {
  const out = {};
  for (const k of BASE_FIELDS) {
    if (raw[k] !== undefined) out[k] = raw[k];
  }
  return out;
}

/**
 * @param {Record<string, unknown>} webhookShape
 */
export function emitActiveStateRouting(webhookShape = {}) {
  let derivedStateOwner = webhookShape.stateOwner;
  if (
    !derivedStateOwner &&
    webhookShape.paymentState === "paywall_offer_single" &&
    webhookShape.userId
  ) {
    derivedStateOwner = getSelectedPaymentPackageKey(webhookShape.userId)
      ? "payment_package_selected"
      : "paywall_selecting_package";
  }
  if (!derivedStateOwner) {
    derivedStateOwner = webhookShape.conversationOwner ?? null;
  }

  const structured = pickStructured({
    userId: webhookShape.userId,
    stateOwner: derivedStateOwner,
    microIntent:
      webhookShape.microIntent ??
      webhookShape.normalizedIntent ??
      null,
    replyType:
      webhookShape.replyType ?? webhookShape.chosenReplyType ?? null,
    expectedInputKind:
      webhookShape.expectedInputKind ??
      webhookShape.expectedInputType ??
      null,
    noProgressStreak:
      webhookShape.noProgressStreak ??
      webhookShape.noProgressCount ??
      null,
    usedAi: webhookShape.usedAi ?? null,
    fallbackReason: webhookShape.fallbackReason ?? null,
    resolutionReason:
      webhookShape.resolutionReason ?? webhookShape.routeReason ?? null,
  });
  logTelemetryEvent(
    TelemetryEvents.ACTIVE_STATE_ROUTING,
    stripUndefined({
      ...structured,
      flowState: webhookShape.flowState,
      paymentState: webhookShape.paymentState,
      accessState: webhookShape.accessState,
      replyFamily: webhookShape.replyFamily,
      conversationOwner: webhookShape.conversationOwner,
      text: webhookShape.text,
    }),
  );
}

/**
 * @param {Record<string, unknown>} payload
 */
export function emitStateMicroIntent(payload = {}) {
  const activeSt = payload.activeState;
  const uidForSt = payload.userId ?? payload.lineUserId;
  let derivedOwner = payload.stateOwner ?? activeSt ?? payload.conversationOwner;
  if (
    !payload.stateOwner &&
    activeSt === "paywall_offer_single" &&
    uidForSt
  ) {
    derivedOwner = getSelectedPaymentPackageKey(uidForSt)
      ? "payment_package_selected"
      : "paywall_selecting_package";
  }
  const structured = pickStructured({
    userId: uidForSt,
    stateOwner: derivedOwner,
    microIntent: payload.microIntent ?? payload.normalizedIntent,
    replyType: payload.replyType ?? payload.chosenReplyType,
    expectedInputKind: payload.expectedInputKind,
    noProgressStreak: payload.noProgressStreak,
    usedAi: payload.usedAi,
    fallbackReason: payload.fallbackReason,
    resolutionReason: payload.resolutionReason,
  });
  logTelemetryEvent(
    TelemetryEvents.STATE_MICRO_INTENT,
    stripUndefined({
      ...structured,
      inputText: payload.inputText,
      confidence: payload.confidence,
      activeState: payload.activeState,
    }),
  );
}

/**
 * @param {Record<string, unknown>} payload
 */
export function emitStateGuidanceLevel(payload = {}) {
  const activeSt = payload.activeState;
  const uidG = payload.userId;
  let derivedOwnerG = payload.stateOwner ?? activeSt;
  if (
    !payload.stateOwner &&
    activeSt === "paywall_offer_single" &&
    uidG
  ) {
    derivedOwnerG = getSelectedPaymentPackageKey(uidG)
      ? "payment_package_selected"
      : "paywall_selecting_package";
  }
  const structured = pickStructured({
    userId: uidG,
    stateOwner: derivedOwnerG,
    microIntent: payload.microIntent,
    replyType: payload.replyType,
    expectedInputKind: payload.expectedInputKind,
    noProgressStreak:
      payload.noProgressStreak ?? payload.noProgressCount ?? null,
    usedAi: payload.usedAi,
    fallbackReason: payload.fallbackReason,
    resolutionReason: payload.resolutionReason,
  });
  logTelemetryEvent(
    TelemetryEvents.STATE_GUIDANCE_LEVEL,
    stripUndefined({
      ...structured,
      guidanceLevel: payload.guidanceLevel,
      ladder: payload.ladder,
    }),
  );

  if (structured.noProgressStreak != null) {
    logTelemetryEvent(
      TelemetryEvents.STATE_NO_PROGRESS_STREAK,
      stripUndefined(structured),
    );
  }
}

/**
 * @param {Record<string, unknown>} payload
 */
export function emitStateFallbackReason(payload = {}) {
  logTelemetryEvent(
    TelemetryEvents.STATE_FALLBACK_REASON,
    stripUndefined(pickStructured(payload)),
  );
}
