/**
 * Per-webhook-turn timing logs (LINE text/image handlers).
 * elapsedMs is measured from the first TURN_START for this perf instance.
 */

/**
 * @param {string} userId
 * @param {"text"|"image"|"event"} kind
 */
export function createTurnPerf(userId, kind) {
  const t0 = Date.now();
  return {
    t0,
    userId,
    kind,
    /**
     * @param {string} event
     * @param {Record<string, unknown>} [extra]
     */
    log(event, extra = {}) {
      console.log(
        JSON.stringify({
          event,
          userId,
          kind,
          elapsedMs: Date.now() - t0,
          ...extra,
        }),
      );
    },
  };
}
