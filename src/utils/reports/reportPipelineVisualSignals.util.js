/**
 * Report pipeline policy for visual-ish Object Energy inputs (`dominantColor`, `conditionClass`).
 *
 * **Truth model:** deterministic Object Energy must not treat LLM scan prose as ground truth.
 * The parser exposes `tone` (โทนพลัง) from {@link parseScanText} — that string is model-written
 * copy for Flex/HTML role text; it is intentionally NOT fed into {@link computeObjectEnergyV1}.
 *
 * **Current upstream reality (repo inspection):**
 * - No pixel histogram / palette / CV color extraction service exists.
 * - `checkSingleObject` returns a coarse gate enum only (`single_supported`, `unclear`, …), not
 *   physical condition (`excellent`…`damaged`) and not a color slug.
 * - Cache rows (`scan_result_cache`) store `result_text` + hash keys — no color/condition columns.
 *
 * **When a real stage exists**, thread a normalized slug via `buildReportPayloadFromScan({ dominantColor })`
 * / `{ conditionClass }` and extend {@link VISUAL_SIGNAL_SOURCE} with values such as `vision_v1` or
 * `persisted_column` — then map `source` in telemetry accordingly (implementation in callers).
 */

/** @typedef {"none"|"pipeline_opts"} VisualSignalSourceLabel */

export const VISUAL_SIGNAL_SOURCE = /** @type {const} */ ({
  /** No wired upstream field; formula uses neutral layer for this signal */
  NONE: "none",
  /**
   * Value came through explicit `buildReportPayloadFromScan` options (unit tests, or a future
   * wired extractor that passes the slug here — not inferred from `resultText`).
   */
  PIPELINE_OPTS: "pipeline_opts",
});

/**
 * @param {string|undefined|null} explicitSlug — from report pipeline opts only (never from raw LLM line parse for color)
 * @returns {{ source: VisualSignalSourceLabel, normalized: string|undefined }}
 */
export function resolveDominantColorPipelineSource(explicitSlug) {
  const raw = String(explicitSlug ?? "").trim();
  if (!raw) {
    return { source: VISUAL_SIGNAL_SOURCE.NONE, normalized: undefined };
  }
  return {
    source: VISUAL_SIGNAL_SOURCE.PIPELINE_OPTS,
    normalized: raw.toLowerCase(),
  };
}

/**
 * @param {string|undefined|null} explicitSlug — from report pipeline opts only
 * @returns {{ source: VisualSignalSourceLabel, normalized: string|undefined }}
 */
export function resolveConditionClassPipelineSource(explicitSlug) {
  const raw = String(explicitSlug ?? "").trim();
  if (!raw) {
    return { source: VISUAL_SIGNAL_SOURCE.NONE, normalized: undefined };
  }
  return {
    source: VISUAL_SIGNAL_SOURCE.PIPELINE_OPTS,
    normalized: raw.toLowerCase(),
  };
}
