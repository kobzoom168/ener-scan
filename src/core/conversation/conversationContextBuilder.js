/**
 * @param {import("./contracts.types.js").ReplyContract} contract
 * @param {string} deterministicBaseline
 * @param {string} lastUserText
 * @returns {import("./contracts.types.js").LLMSurfaceInput}
 */
export function buildLLMSurfaceInput(contract, deterministicBaseline, lastUserText) {
  return {
    stateOwner: contract.stateOwner,
    replyType: contract.replyType,
    allowedFacts: contract.allowedFacts,
    nextStep: contract.nextStep,
    guidanceTier: contract.guidanceTier,
    lastUserText: String(lastUserText || "").slice(0, 600),
    microIntent: String(contract.microIntent || ""),
    fallbackMode: String(contract.fallbackMode || "strict"),
    deterministicBaseline: String(deterministicBaseline || "").slice(0, 1200),
  };
}
