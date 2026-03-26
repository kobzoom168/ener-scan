/**
 * Fail-closed slip acceptance gate. Only this module returns decision === "accept".
 */
import { env } from "../../../config/env.js";
import { deterministicSlipPreCheck } from "./slipDeterministic.js";
import {
  classifySlipWithVision,
  isSlipVisionEnabled,
} from "./slipVisionClassifier.js";
import {
  logSlipCheckAccepted,
  logSlipCheckRejected,
  logSlipCheckRequested,
  logSlipCheckResolved,
  logSlipCheckUnclear,
} from "./slipCheck.telemetry.js";

/** Per-token penalty on evidenceScore for likely_slip (same vision call; no extra LLM). */
const HARD_NEGATIVE_WEIGHTS = {
  chat_bubbles: 0.38,
  messaging_chrome: 0.38,
  line_ui: 0.42,
  whatsapp_ui: 0.42,
  telegram_ui: 0.4,
  conversation_thread: 0.36,
  physical_product: 0.4,
  single_object_focus: 0.36,
  portrait_product: 0.34,
  catalog_shot: 0.3,
  weak_blur: 0.14,
  low_contrast: 0.12,
};

/** If likely_slip lists any of these, reject regardless of raw evidenceScore. */
const INSTANT_REJECT_LIKELY_SLIP = new Set([
  "chat_bubbles",
  "line_ui",
  "whatsapp_ui",
  "messaging_chrome",
  "conversation_thread",
  "telegram_ui",
  "physical_product",
  "single_object_focus",
  "portrait_product",
]);

/**
 * @param {Buffer} buf
 */
function toB64(buf) {
  return Buffer.isBuffer(buf) ? buf.toString("base64") : Buffer.from(buf).toString("base64");
}

/**
 * @param {import('./slipCheck.types.js').SlipEvidenceSignals} signals
 */
function countTrueSignals(signals) {
  return [
    signals.amountVisible,
    signals.dateTimeVisible,
    signals.bankOrWalletUi,
    signals.referenceLikeText,
  ].filter(Boolean).length;
}

/**
 * @param {string[]} hardNegatives
 */
function penaltyFromHardNegatives(hardNegatives) {
  let p = 0;
  for (const n of hardNegatives) {
    p += HARD_NEGATIVE_WEIGHTS[n] ?? 0.09;
  }
  return Math.min(1, p);
}

/**
 * @param {string[]} hardNegatives
 */
function hasInstantRejectLikelySlip(hardNegatives) {
  return hardNegatives.some((n) => INSTANT_REJECT_LIKELY_SLIP.has(n));
}

/**
 * @param {string} lineUserId
 * @param {string} paymentId
 * @param {string} stateOwner
 * @param {import('./slipCheck.types.js').SlipGateResult} result
 * @param {{
 *   classifierMode: string,
 *   hardNegatives?: string[],
 *   signalCount?: number | null,
 *   minScore?: number | null,
 *   minSignals?: number | null,
 *   adjustedEvidenceScore?: number | null,
 * }} meta
 */
/**
 * @param {number | null | undefined} n
 */
function roundScore(n) {
  if (n == null || !Number.isFinite(n)) return n ?? null;
  return Math.round(n * 10000) / 10000;
}

function emitResolved(lineUserId, paymentId, stateOwner, result, meta) {
  logSlipCheckResolved({
    lineUserId,
    paymentId,
    stateOwner,
    label: result.slipLabel,
    evidenceScore: roundScore(result.slipEvidenceScore),
    hardNegatives: meta.hardNegatives ?? [],
    classifierMode: meta.classifierMode,
    finalDecision: result.decision,
    rejectReason: result.rejectReason ?? null,
    signalCount: meta.signalCount ?? null,
    minScore: meta.minScore ?? null,
    minSignals: meta.minSignals ?? null,
    adjustedEvidenceScore: roundScore(meta.adjustedEvidenceScore),
  });
  return result;
}

/**
 * @param {{
 *   imageBuffer: Buffer,
 *   lineUserId: string,
 *   paymentId: string | number | null | undefined,
 *   stateOwner?: string,
 * }} ctx
 * @param {{
 *   visionClassifyOverride?: (b64: string) => Promise<{
 *     slipLabel: import('./slipCheck.types.js').SlipLabel,
 *     evidenceScore: number,
 *     hardNegatives: string[],
 *     signals: import('./slipCheck.types.js').SlipEvidenceSignals,
 *   } | null>,
 * }} [options] — `visionClassifyOverride` for tests only (same contract as classifySlipWithVision).
 * @returns {Promise<import('./slipCheck.types.js').SlipGateResult>}
 */
export async function evaluateSlipGate(ctx, options = {}) {
  const lineUserId = String(ctx.lineUserId || "").trim();
  const paymentId = ctx.paymentId != null ? String(ctx.paymentId) : "";
  const stateOwner = String(ctx.stateOwner || "awaiting_slip").trim();
  const imageBuffer = ctx.imageBuffer;
  /** @type {(b64: string) => ReturnType<typeof classifySlipWithVision>} */
  const classifyVision =
    typeof options.visionClassifyOverride === "function"
      ? options.visionClassifyOverride
      : classifySlipWithVision;

  logSlipCheckRequested({
    lineUserId,
    paymentId,
    stateOwner,
  });

  const pre = deterministicSlipPreCheck(imageBuffer);

  if (pre.kind === "fast_reject_chat") {
    const result = {
      decision: "reject",
      slipLabel: "chat_screenshot",
      slipEvidenceScore: 0,
      rejectReason: "deterministic_aspect_chat_screenshot",
      path: "deterministic",
    };
    logSlipCheckRejected({
      lineUserId,
      paymentId,
      stateOwner,
      slipLabel: result.slipLabel,
      slipEvidenceScore: result.slipEvidenceScore,
      rejectReason: result.rejectReason,
    });
    return emitResolved(lineUserId, paymentId, stateOwner, result, {
      classifierMode: "deterministic",
      hardNegatives: [],
    });
  }

  if (pre.kind === "too_small") {
    const result = {
      decision: "unclear",
      slipLabel: "other_image",
      slipEvidenceScore: 0,
      rejectReason: "deterministic_too_small",
      path: "deterministic",
    };
    logSlipCheckUnclear({
      lineUserId,
      paymentId,
      stateOwner,
      slipLabel: result.slipLabel,
      slipEvidenceScore: result.slipEvidenceScore,
      rejectReason: result.rejectReason,
    });
    return emitResolved(lineUserId, paymentId, stateOwner, result, {
      classifierMode: "deterministic",
      hardNegatives: [],
    });
  }

  if (!isSlipVisionEnabled()) {
    const result = {
      decision: "unclear",
      slipLabel: "other_image",
      slipEvidenceScore: 0,
      rejectReason: "vision_disabled",
      path: "vision_disabled",
    };
    logSlipCheckUnclear({
      lineUserId,
      paymentId,
      stateOwner,
      slipLabel: result.slipLabel,
      slipEvidenceScore: 0,
      rejectReason: result.rejectReason,
    });
    return emitResolved(lineUserId, paymentId, stateOwner, result, {
      classifierMode: "vision_disabled",
      hardNegatives: [],
    });
  }

  const base64 = toB64(imageBuffer);
  const vision = await classifyVision(base64);

  if (!vision) {
    const result = {
      decision: "unclear",
      slipLabel: "other_image",
      slipEvidenceScore: 0,
      rejectReason: "vision_error_or_parse",
      path: "vision",
    };
    logSlipCheckUnclear({
      lineUserId,
      paymentId,
      stateOwner,
      slipLabel: result.slipLabel,
      slipEvidenceScore: 0,
      rejectReason: result.rejectReason,
    });
    return emitResolved(lineUserId, paymentId, stateOwner, result, {
      classifierMode: "vision",
      hardNegatives: [],
    });
  }

  const { slipLabel, evidenceScore, signals } = vision;
  const hardNegatives = Array.isArray(vision.hardNegatives)
    ? vision.hardNegatives
    : [];
  const minScore = env.SLIP_ACCEPT_MIN_SCORE;
  const minSignals = env.SLIP_EVIDENCE_MIN_SIGNALS;
  const signalCount = countTrueSignals(signals);
  const penalty = penaltyFromHardNegatives(hardNegatives);
  const adjustedEvidenceScore = Math.max(0, evidenceScore - penalty);

  if (slipLabel === "chat_screenshot" || slipLabel === "object_photo") {
    const result = {
      decision: "reject",
      slipLabel,
      slipEvidenceScore: evidenceScore,
      rejectReason: `vision_label_${slipLabel}`,
      path: "vision",
    };
    logSlipCheckRejected({
      lineUserId,
      paymentId,
      stateOwner,
      slipLabel,
      slipEvidenceScore: evidenceScore,
      rejectReason: result.rejectReason,
    });
    return emitResolved(lineUserId, paymentId, stateOwner, result, {
      classifierMode: "vision",
      hardNegatives,
      signalCount,
      minScore,
      minSignals,
      adjustedEvidenceScore,
    });
  }

  if (slipLabel === "other_image") {
    const result = {
      decision: "reject",
      slipLabel: "other_image",
      slipEvidenceScore: evidenceScore,
      rejectReason: "vision_label_other_image",
      path: "vision",
    };
    logSlipCheckRejected({
      lineUserId,
      paymentId,
      stateOwner,
      slipLabel,
      slipEvidenceScore: evidenceScore,
      rejectReason: result.rejectReason,
    });
    return emitResolved(lineUserId, paymentId, stateOwner, result, {
      classifierMode: "vision",
      hardNegatives,
      signalCount,
      minScore,
      minSignals,
      adjustedEvidenceScore,
    });
  }

  if (slipLabel === "likely_slip") {
    if (hasInstantRejectLikelySlip(hardNegatives)) {
      const result = {
        decision: "reject",
        slipLabel: "likely_slip",
        slipEvidenceScore: evidenceScore,
        rejectReason: "vision_hard_negative_instant",
        path: "vision",
      };
      logSlipCheckRejected({
        lineUserId,
        paymentId,
        stateOwner,
        slipLabel,
        slipEvidenceScore: evidenceScore,
        rejectReason: result.rejectReason,
      });
      return emitResolved(lineUserId, paymentId, stateOwner, result, {
        classifierMode: "vision",
        hardNegatives,
        signalCount,
        minScore,
        minSignals,
        adjustedEvidenceScore,
      });
    }

    const strongEnough =
      adjustedEvidenceScore >= minScore && signalCount >= minSignals;
    if (strongEnough) {
      const result = {
        decision: "accept",
        slipLabel: "likely_slip",
        slipEvidenceScore: evidenceScore,
        path: "vision",
      };
      logSlipCheckAccepted({
        lineUserId,
        paymentId,
        stateOwner,
        slipLabel,
        slipEvidenceScore: evidenceScore,
        signalCount,
        minScore,
        minSignals,
        hardNegatives,
        adjustedEvidenceScore,
      });
      return emitResolved(lineUserId, paymentId, stateOwner, result, {
        classifierMode: "vision",
        hardNegatives,
        signalCount,
        minScore,
        minSignals,
        adjustedEvidenceScore,
      });
    }
    const result = {
      decision: "unclear",
      slipLabel: "likely_slip",
      slipEvidenceScore: evidenceScore,
      rejectReason: "weak_evidence",
      path: "vision",
    };
    logSlipCheckUnclear({
      lineUserId,
      paymentId,
      stateOwner,
      slipLabel,
      slipEvidenceScore: evidenceScore,
      signalCount,
      minScore,
      minSignals,
      rejectReason: result.rejectReason,
      hardNegatives,
      adjustedEvidenceScore,
    });
    return emitResolved(lineUserId, paymentId, stateOwner, result, {
      classifierMode: "vision",
      hardNegatives,
      signalCount,
      minScore,
      minSignals,
      adjustedEvidenceScore,
    });
  }

  const result = {
    decision: "unclear",
    slipLabel: "other_image",
    slipEvidenceScore: 0,
    rejectReason: "vision_unknown_label",
    path: "vision",
  };
  logSlipCheckUnclear({
    lineUserId,
    paymentId,
    stateOwner,
    slipLabel: slipLabel || "other_image",
    slipEvidenceScore: 0,
    rejectReason: result.rejectReason,
  });
  return emitResolved(lineUserId, paymentId, stateOwner, result, {
    classifierMode: "vision",
    hardNegatives,
    signalCount,
    adjustedEvidenceScore,
  });
}
