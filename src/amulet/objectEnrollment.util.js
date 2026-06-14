/**
 * Multi-angle enrollment (Phase 2E) — pure logic.
 *
 * An "object group" is one physical piece represented by multiple angle views. Each accepted
 * recognition adds a view; once a group has enough independent angles it becomes ENROLLED and its
 * six-axis scores are LOCKED to the consolidated (averaged) value. From then on every angle of that
 * piece returns the exact same graph — which is both the credibility fix (stable across angles) and
 * the anti-gaming guard (re-shooting cannot move the score).
 */

import { POWER_ORDER } from "./amuletScores.util.js";

/** Distinct angle views required before a group's scores lock. */
export const ENROLLMENT_LOCK_MIN_VIEWS = 2;

/**
 * @param {unknown} v
 * @returns {Record<string, number>}
 */
function coerceAxisScores(v) {
  /** @type {Record<string, number>} */
  const out = {};
  const obj = v && typeof v === "object" && !Array.isArray(v) ? /** @type {Record<string, unknown>} */ (v) : {};
  for (const k of POWER_ORDER) {
    const n = Number(obj[k]);
    out[k] = Number.isFinite(n) ? Math.round(Math.min(100, Math.max(0, n))) : 0;
  }
  return out;
}

/**
 * Consolidate multiple angle views into one locked six-axis score set (per-axis mean, rounded).
 * Stable regardless of view order.
 *
 * @param {Array<Record<string, number>|unknown>} views — each item is an axisScores map
 * @returns {Record<string, number>}
 */
export function consolidateEnrolledAxisScores(views) {
  const list = (Array.isArray(views) ? views : [])
    .map(coerceAxisScores)
    .filter((m) => POWER_ORDER.some((k) => m[k] > 0));
  if (!list.length) {
    /** @type {Record<string, number>} */
    const zero = {};
    for (const k of POWER_ORDER) zero[k] = 0;
    return zero;
  }
  /** @type {Record<string, number>} */
  const out = {};
  for (const k of POWER_ORDER) {
    const sum = list.reduce((acc, m) => acc + m[k], 0);
    out[k] = Math.round(sum / list.length);
  }
  return out;
}

/**
 * @param {number} viewCount
 * @returns {boolean}
 */
export function shouldLockEnrollment(viewCount) {
  return Number.isFinite(Number(viewCount)) && Number(viewCount) >= ENROLLMENT_LOCK_MIN_VIEWS;
}

/**
 * Peak axis key from a consolidated score map (tie-break follows POWER_ORDER).
 * @param {Record<string, number>} axisScores
 * @returns {import("./amuletScores.util.js").AmuletPowerKey}
 */
export function peakKeyFromAxisScores(axisScores) {
  const m = coerceAxisScores(axisScores);
  const sorted = [...POWER_ORDER].sort((a, b) => {
    const d = m[b] - m[a];
    if (d !== 0) return d;
    return POWER_ORDER.indexOf(a) - POWER_ORDER.indexOf(b);
  });
  return /** @type {import("./amuletScores.util.js").AmuletPowerKey} */ (sorted[0]);
}

/**
 * Decide the next enrollment state after adding one angle view.
 *
 * @param {object} p
 * @param {number} p.priorViewCount — views already in the group (0 if brand new)
 * @param {Array<Record<string, number>>} p.existingViews — prior per-view axis scores
 * @param {Record<string, number>} p.newView — axis scores for the angle being added
 * @returns {{ viewCount: number, isEnrolled: boolean, lockedAxisScores: Record<string, number>, peakPowerKey: import("./amuletScores.util.js").AmuletPowerKey }}
 */
export function planEnrollmentUpdate({ priorViewCount, existingViews, newView }) {
  const allViews = [...(Array.isArray(existingViews) ? existingViews : []), newView];
  const viewCount = Math.max(allViews.length, Number(priorViewCount || 0) + 1);
  const lockedAxisScores = consolidateEnrolledAxisScores(allViews);
  return {
    viewCount,
    isEnrolled: shouldLockEnrollment(viewCount),
    lockedAxisScores,
    peakPowerKey: peakKeyFromAxisScores(lockedAxisScores),
  };
}
