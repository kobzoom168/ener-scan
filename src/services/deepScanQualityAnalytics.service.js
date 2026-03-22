/**
 * Serializable snapshot for DB + future learning (prompt evolution).
 *
 * @typedef {Object} DeepScanQualityAnalyticsV1
 * @property {1} version
 * @property {number | null} score_before
 * @property {number | null} score_after
 * @property {number | null} delta
 * @property {boolean} improve_attempted
 * @property {boolean} improve_applied
 * @property {string | null} improve_skipped_reason
 * @property {number | null} latency_ms
 * @property {boolean} [scoring_enabled]
 * @property {string | null} [quality_tier] — excellent | good | ok | poor
 * @property {{ has_signature_phrase: boolean, has_life_scenario: boolean, has_emotional_hook: boolean }} [signals]
 * @property {number | null} [improve_gain_ratio] — delta / score_before when defined
 * @property {string | null} [style_reference_mode] — off | on | sample
 * @property {boolean} [style_reference_enabled] — cohort attempted load (on, or sample hit)
 * @property {boolean | null} [style_reference_sample_selected] — sample mode only
 * @property {boolean} [style_reference_used] — pack applied to rewrite prompt
 * @property {number} [style_reference_fragment_count]
 * @property {string | null} [style_reference_source]
 * @property {boolean} [rewrite_with_style] — augmentation present on rewrite call
 */

/**
 * Dashboard-friendly label from final score (0–50 scale).
 * @param {unknown} score
 * @returns {"excellent"|"good"|"ok"|"poor"|null}
 */
export function getQualityTier(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return null;
  if (n >= 45) return "excellent";
  if (n >= 40) return "good";
  if (n >= 30) return "ok";
  return "poor";
}

/**
 * Lightweight pattern flags for clustering / prompt evolution (Thai copy).
 * @param {string} text
 */
export function extractSignals(text) {
  const t = String(text || "");
  return {
    has_signature_phrase: t.includes("ไม่ได้") || t.includes("แต่"),
    has_life_scenario: t.includes("เวลา") || t.includes("เมื่อ"),
    has_emotional_hook: t.includes("รู้สึก") || t.includes("จังหวะ"),
  };
}

/**
 * improve_gain_ratio = delta / score_before (null if not meaningful).
 * @param {unknown} scoreBefore
 * @param {unknown} delta
 * @returns {number | null}
 */
export function computeImproveGainRatio(scoreBefore, delta) {
  const b = Number(scoreBefore);
  const d = Number(delta);
  if (!Number.isFinite(b) || b === 0) return null;
  if (!Number.isFinite(d)) return null;
  return d / b;
}

/**
 * Merge tier, gain ratio, and text signals before DB persist (uses user-facing text after format).
 * @param {Record<string, unknown> | null} qa
 * @param {{ resultText: string }} opts
 * @returns {Record<string, unknown>}
 */
export function enrichQualityAnalyticsForPersist(qa, { resultText }) {
  const base =
    qa && typeof qa === "object"
      ? { ...qa }
      : { ...createEmptyQualityAnalytics() };

  return {
    ...base,
    version: Math.max(Number(base.version) || 1, 2),
    quality_tier: getQualityTier(base.score_after),
    signals: extractSignals(resultText),
    improve_gain_ratio: computeImproveGainRatio(base.score_before, base.delta),
  };
}

/** @returns {DeepScanQualityAnalyticsV1} */
export function createEmptyQualityAnalytics(overrides = {}) {
  return {
    version: 1,
    score_before: null,
    score_after: null,
    delta: null,
    improve_attempted: false,
    improve_applied: false,
    improve_skipped_reason: null,
    latency_ms: null,
    scoring_enabled: false,
    ...overrides,
  };
}

/** Reasons are stable strings for SQL / dashboards */
export const QUALITY_SKIP_REASONS = {
  DRAFT_FORMAT_INVALID: "draft_format_invalid",
  SCORING_DISABLED: "scoring_disabled",
  NOT_ELIGIBLE_NOT_POLISHED: "not_eligible_not_polished",
  SCORE_PARSE_FAILED: "score_parse_failed",
  HIGH_QUALITY_SKIP: "high_quality_skip",
  FLOOR_THROTTLE: "floor_throttle",
  IMPROVE_NOT_NEEDED: "improve_not_needed",
  AUTO_IMPROVE_OFF: "auto_improve_off",
  IMPROVE_VALIDATION_FAILED: "improve_validation_failed",
  NO_GAIN: "no_gain",
  RESCORE_UNTRUSTED: "rescore_untrusted",
  RESCORE_FAILED: "rescore_failed",
  QUALITY_LAYER_ERROR: "quality_layer_error",
  FROM_CACHE: "from_cache",
};
