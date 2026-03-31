/**
 * Per-webhook-turn timing logs (LINE text/image handlers).
 * elapsedMs is measured from the first TURN_START for this perf instance.
 *
 * **Railway / log aggregation:** all lines use the literal prefix `[ENER_SCAN_PERF]`
 * followed by a single JSON object so grep/search finds markers reliably (not buried
 * inside unparsed multi-line output).
 */

/** @type {string} Grep-friendly token; keep stable for dashboards */
export const ENER_SCAN_PERF_PREFIX = "[ENER_SCAN_PERF]";

/**
 * @param {string} userId
 * @param {"text"|"image"|"event"} kind
 * @param {{ messageId?: string | null }} [meta]
 */
export function createTurnPerf(userId, kind, meta = {}) {
  const t0 = Date.now();
  const messageId = meta.messageId ?? null;
  const lineUserIdPrefix =
    String(userId || "").length >= 8
      ? String(userId).slice(0, 8)
      : String(userId || "") || null;

  return {
    t0,
    userId,
    kind,
    messageId,
    /**
     * @param {string} event
     * @param {Record<string, unknown>} [extra]
     */
    log(event, extra = {}) {
      const payload = {
        event,
        userId,
        lineUserIdPrefix,
        messageId,
        kind,
        elapsedMs: Date.now() - t0,
        ...extra,
      };
      console.log(`${ENER_SCAN_PERF_PREFIX} ${JSON.stringify(payload)}`);
    },
  };
}

/**
 * Same single-line contract as {@link createTurnPerf}, for worker / pipeline code
 * that is not tied to a webhook turn timer (use `elapsedMs` from caller when needed).
 *
 * @param {string} event
 * @param {Record<string, unknown>} fields
 */
export function logScanPipelinePerf(event, fields = {}) {
  const payload = { event, ...fields };
  console.log(`${ENER_SCAN_PERF_PREFIX} ${JSON.stringify(payload)}`);
}
