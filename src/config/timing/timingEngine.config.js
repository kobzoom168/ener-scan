/**
 * Timing Engine v1.1 — global formula constants (deterministic, versioned).
 */

export const TIMING_ENGINE_VERSION = "timing_v1_1";

/** @type {readonly [number, number, number, number, number]} */
export const TIMING_WEIGHTS = Object.freeze([0.3, 0.3, 0.2, 0.1, 0.1]);
// ownerRootAffinity, lanePowerAffinity, weekdayAffinity, compatibilityBoost, fitBoost

/** Total score delta cap after v1.1 calibration stack (per slot). */
export const TIMING_CALIBRATION_TOTAL_CAP = 8;

/** Standard reason codes — every slot must use one of these (derived text only). */
export const TIMING_REASON_CODES = Object.freeze([
  "OWNER_ROOT_MATCH",
  "OWNER_ROOT_NEAR_MATCH",
  "LANE_PRIMARY_SUPPORT",
  "LANE_SECONDARY_SUPPORT",
  "WEEKDAY_AFFINITY",
  "DATE_ROOT_RESONANCE",
  "COMPATIBILITY_BOOST",
  "OWNER_FIT_BOOST",
  "LOW_RESONANCE",
  "STABILITY_ANCHOR",
]);
