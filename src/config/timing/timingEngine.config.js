/**
 * Timing Engine v1 — global formula constants (deterministic, versioned).
 */

export const TIMING_ENGINE_VERSION = "timing_v1";

/** @type {readonly [number, number, number, number, number]} */
export const TIMING_WEIGHTS = Object.freeze([0.3, 0.3, 0.2, 0.1, 0.1]);
// ownerRootAffinity, lanePowerAffinity, weekdayAffinity, compatibilityBoost, fitBoost
