/**
 * Report pipeline policy for visual-ish Object Energy inputs (`dominantColor`, `conditionClass`).
 *
 * **Truth model:** deterministic Object Energy must not treat LLM scan prose as ground truth.
 * The parser exposes `tone` (โทนพลัง) from {@link parseScanText} — that string is model-written
 * copy for Flex/HTML role text; it is intentionally NOT fed into {@link computeObjectEnergyV1}.
 *
 * **Dominant color:** {@link extractDominantColorSlugFromBuffer} (vision v1, deterministic pixels).
 * **Condition class:** still no non-LLM upstream; `checkSingleObject` is a gate only, not `excellent`…`damaged`.
 * Cache rows store `result_text` + hash keys — no `condition_class` column yet.
 *
 * **When a real stage exists**, thread a normalized slug via `buildReportPayloadFromScan({ dominantColor })`
 * / `{ conditionClass }` and extend {@link VISUAL_SIGNAL_SOURCE} with values such as `vision_v1` or
 * `persisted_column` — then map `source` in telemetry accordingly (implementation in callers).
 */

/** @typedef {"none"|"pipeline_opts"|"vision_v1"} DominantColorSignalSourceLabel */
/** @typedef {"none"|"pipeline_opts"} VisualSignalSourceLabel */

export const VISUAL_SIGNAL_SOURCE = /** @type {const} */ ({
  /** No wired upstream field; formula uses neutral layer for this signal */
  NONE: "none",
  /**
   * Value came through explicit `buildReportPayloadFromScan` options (unit tests, or a future
   * wired extractor that passes the slug here — not inferred from `resultText`).
   */
  PIPELINE_OPTS: "pipeline_opts",
  /** Deterministic pixel pipeline {@link ../reportPipelineDominantColor.util.js} */
  VISION_V1: "vision_v1",
});

/**
 * @param {string|undefined|null} explicitSlug — from report pipeline opts or vision v1 (never from parsed LLM `tone`)
 * @param {"vision_v1"|undefined} [sourceHint] — pass `"vision_v1"` when slug comes from {@link extractDominantColorSlugFromBuffer}
 * @returns {{ source: DominantColorSignalSourceLabel, normalized: string|undefined }}
 */
export function resolveDominantColorPipelineSource(explicitSlug, sourceHint) {
  const raw = String(explicitSlug ?? "").trim();
  if (!raw) {
    return { source: VISUAL_SIGNAL_SOURCE.NONE, normalized: undefined };
  }
  const lower = raw.toLowerCase();
  if (sourceHint === "vision_v1") {
    return { source: VISUAL_SIGNAL_SOURCE.VISION_V1, normalized: lower };
  }
  return {
    source: VISUAL_SIGNAL_SOURCE.PIPELINE_OPTS,
    normalized: lower,
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
