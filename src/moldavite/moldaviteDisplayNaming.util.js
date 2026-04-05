/**
 * Confidence-based visible naming for Moldavite / green-transform lane (Flex + report).
 * Separates subtype label certainty from the transformation "lane" (main energy family).
 *
 * Thresholds (naming only; not shown to users):
 * - high: >= 0.80
 * - medium: 0.55 .. 0.79
 * - low: < 0.55
 *
 * @module
 */

/** @typedef {"high"|"medium"|"low"} MoldaviteDisplayNamingLevel */

const HIGH_MIN = 0.8;
const MEDIUM_MIN = 0.55;

const LABEL_HIGH = "มอลดาไวต์";
const LABEL_MEDIUM = "หิน/คริสตัลโทนเขียว";
const LABEL_LOW = "วัตถุชิ้นนี้อยู่ในกลุ่มหินและคริสตัล";

const MAIN_HIGH = "เร่งการเปลี่ยนแปลง";
const MAIN_MEDIUM = "เร่งการเปลี่ยนแปลง";
const MAIN_LOW = "เด่นในทางการขยับและเปลี่ยนแปลง";

/**
 * When Gemini did not supply a numeric confidence, infer a conservative effective
 * confidence from heuristic detection reason (internal naming signal only).
 *
 * @param {string} detectionReason
 * @returns {number} 0..1
 */
export function resolveEffectiveSubtypeConfidenceForNaming({
  moldaviteDecisionSource,
  geminiSubtypeConfidence,
  detectionReason,
}) {
  if (
    moldaviteDecisionSource === "gemini" &&
    Number.isFinite(Number(geminiSubtypeConfidence))
  ) {
    return Math.min(1, Math.max(0, Number(geminiSubtypeConfidence)));
  }

  const r = String(detectionReason || "");

  if (r === "literal_moldavite_label" || r === "gpt_subtype_inference_literal") {
    return 0.88;
  }
  if (r === "gpt_subtype_inference_strong_line") {
    return 0.72;
  }
  if (r === "tektite_with_color_signal") {
    return 0.62;
  }
  if (r === "gpt_subtype_inference_descriptive_prose") {
    return 0.52;
  }
  if (r === "gemini_crystal_subtype") {
    return Number.isFinite(Number(geminiSubtypeConfidence))
      ? Math.min(1, Math.max(0, Number(geminiSubtypeConfidence)))
      : 0.75;
  }

  return 0.6;
}

/**
 * Map effective confidence + transform lane to user-visible labels (no % shown).
 *
 * @param {object} p
 * @param {number|null|undefined} [p.geminiSubtypeConfidence]
 * @param {"gemini"|"gemini_error"|"gemini_not_moldavite"|"heuristic"} p.moldaviteDecisionSource
 * @param {string} p.detectionReason
 * @param {boolean} [p.isTransformLane] — always true when Moldavite v1 slice is attached; reserved for future use
 */
export function resolveMoldaviteDisplayNaming({
  geminiSubtypeConfidence = null,
  moldaviteDecisionSource,
  detectionReason,
  isTransformLane: _isTransformLane = true,
} = {}) {
  void _isTransformLane;
  const effective = resolveEffectiveSubtypeConfidenceForNaming({
    moldaviteDecisionSource,
    geminiSubtypeConfidence,
    detectionReason,
  });

  /** @type {MoldaviteDisplayNamingLevel} */
  let displayNamingConfidenceLevel = "medium";
  if (effective >= HIGH_MIN) {
    displayNamingConfidenceLevel = "high";
  } else if (effective < MEDIUM_MIN) {
    displayNamingConfidenceLevel = "low";
  }

  let displaySubtypeLabel = LABEL_MEDIUM;
  let displayMainEnergyLabel = MAIN_MEDIUM;

  if (displayNamingConfidenceLevel === "high") {
    displaySubtypeLabel = LABEL_HIGH;
    displayMainEnergyLabel = MAIN_HIGH;
  } else if (displayNamingConfidenceLevel === "low") {
    displaySubtypeLabel = LABEL_LOW;
    displayMainEnergyLabel = MAIN_LOW;
  }

  return {
    effectiveSubtypeConfidenceForNaming: effective,
    displayNamingConfidenceLevel,
    displaySubtypeLabel,
    displayMainEnergyLabel,
  };
}
