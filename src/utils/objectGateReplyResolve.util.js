/**
 * Deterministic routing for object-check outcomes → LINE replyType / semanticKey.
 * Gemini (if used) may only humanize copy built from these decisions — never override replyType.
 */

/**
 * True "unsupported" (hard reject): both passes agree unsupported with structured evidence
 * matching production pattern (e.g. vehicle/food) — not timeout/null/inconclusive.
 *
 * @param {object} p
 * @param {string} p.firstPass
 * @param {string|null} p.secondPass
 * @param {object|null} p.structured — permissive JSON row (objectCount, supportedFamilyGuess, …)
 * @param {boolean} p.secondPassDisabled
 * @returns {boolean}
 */
export function isTrueUnsupportedEvidence({
  firstPass,
  secondPass,
  structured,
  secondPassDisabled,
}) {
  if (secondPassDisabled) return false;
  if (firstPass !== "unsupported" || secondPass !== "unsupported") return false;
  if (!structured || typeof structured !== "object") return false;
  const oc = structured.objectCount;
  if (oc !== 0) return false;
  const fam = String(structured.supportedFamilyGuess || "").trim();
  if (fam !== "other_unknown") return false;
  return true;
}

/**
 * @param {object} gated — return shape from checkSingleObjectGated
 * @param {string} gated.result
 * @param {string} gated.firstPass
 * @param {string|null} gated.secondPass
 * @param {object} [gated.gateMeta]
 * @returns {{
 *   kind: "allow_scan"|"multiple_objects"|"image_retake_required"|"object_inconclusive"|"unsupported_object",
 *   replyType: string|null,
 *   semanticKey: string|null,
 *   reason: string,
 * }}
 */
export function resolveObjectGateReplyRouting(gated) {
  const result = String(gated?.result || "").trim();

  if (result === "single_supported") {
    return {
      kind: "allow_scan",
      replyType: null,
      semanticKey: null,
      reason: "single_supported",
    };
  }

  if (result === "multiple") {
    return {
      kind: "multiple_objects",
      replyType: "multiple_objects",
      semanticKey: "multiple_objects",
      reason: "multiple",
    };
  }

  if (result === "unclear") {
    return {
      kind: "image_retake_required",
      replyType: "image_retake_required",
      semanticKey: "image_retake_required",
      reason: "unclear_image",
    };
  }

  if (result === "inconclusive") {
    return {
      kind: "object_inconclusive",
      replyType: "object_inconclusive",
      semanticKey: "object_inconclusive",
      reason: "inconclusive_or_timeout_or_weak_signal",
    };
  }

  if (result === "unsupported") {
    return {
      kind: "unsupported_object",
      replyType: "unsupported_object",
      semanticKey: "unsupported_object",
      reason: "true_unsupported_evidence",
    };
  }

  return {
    kind: "object_inconclusive",
    replyType: "object_inconclusive",
    semanticKey: "object_inconclusive",
    reason: "unknown_result_fallback",
  };
}
