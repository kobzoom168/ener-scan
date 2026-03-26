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
  logSlipCheckUnclear,
} from "./slipCheck.telemetry.js";

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
 * @param {{
 *   imageBuffer: Buffer,
 *   lineUserId: string,
 *   paymentId: string | number | null | undefined,
 *   stateOwner?: string,
 * }} ctx
 * @returns {Promise<import('./slipCheck.types.js').SlipGateResult>}
 */
export async function evaluateSlipGate(ctx) {
  const lineUserId = String(ctx.lineUserId || "").trim();
  const paymentId = ctx.paymentId != null ? String(ctx.paymentId) : "";
  const stateOwner = String(ctx.stateOwner || "awaiting_slip").trim();
  const imageBuffer = ctx.imageBuffer;

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
    return result;
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
    return result;
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
    return result;
  }

  const base64 = toB64(imageBuffer);
  const vision = await classifySlipWithVision(base64);

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
    return result;
  }

  const { slipLabel, evidenceScore, signals } = vision;
  const minScore = env.SLIP_ACCEPT_MIN_SCORE;
  const minSignals = env.SLIP_EVIDENCE_MIN_SIGNALS;
  const signalCount = countTrueSignals(signals);

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
    return result;
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
    return result;
  }

  if (slipLabel === "likely_slip") {
    const strongEnough =
      evidenceScore >= minScore && signalCount >= minSignals;
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
      });
      return result;
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
    });
    return result;
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
  return result;
}
