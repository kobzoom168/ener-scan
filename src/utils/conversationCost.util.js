/**
 * Structured observability for cost-saving architecture (grep: CONV_COST).
 * Does not change routing; logging only.
 *
 * Common fields (when applicable):
 * usedAi, aiPath, replyType, stateOwner, modelUsed, fallbackToDeterministic,
 * suppressedDuplicate, softVerifyTriggered, softVerifyPassed, edgeGateAction, fallbackReason
 */

/**
 * @param {Record<string, unknown>} payload
 */
export function logConversationCost(payload) {
  console.log(
    JSON.stringify({
      event: "CONV_COST",
      ...payload,
      ts: new Date().toISOString(),
    }),
  );
}
