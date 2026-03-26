import { PHASE_A_STATE_OWNERS } from "./stateModel.js";

/**
 * @param {object} input
 * @param {import("./contracts.types.js").StateOwner} input.stateOwner
 * @param {string} input.replyType
 * @param {import("./contracts.types.js").AllowedFact[]} input.allowedFacts
 * @param {string} input.nextStep
 * @param {import("./contracts.types.js").GuidanceTierNumeric} input.guidanceTier
 * @param {string} [input.microIntent]
 * @param {string} [input.fallbackMode]
 * @returns {import("./contracts.types.js").ReplyContract}
 */
export function buildReplyContract({
  stateOwner,
  replyType,
  allowedFacts,
  nextStep,
  guidanceTier,
  microIntent = "",
  fallbackMode = "strict",
}) {
  const llmEnabled = PHASE_A_STATE_OWNERS.has(stateOwner);
  return {
    stateOwner,
    replyType,
    allowedFacts: Array.isArray(allowedFacts) ? allowedFacts : [],
    nextStep,
    guidanceTier,
    llmEnabled,
    validatorProfile: "phase_a_v1",
    fallbackMode,
    microIntent: String(microIntent || ""),
  };
}
