/**
 * Timing Engine v1.1 — post-score calibration (small bounded deltas; does not replace core formula).
 */

/**
 * @param {number} n
 * @param {number} lo
 * @param {number} hi
 */
function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Compatibility high → slight lift for slots that are already somewhat strong (believable nudge).
 * @param {number} score — 0–100 after core combine
 * @param {number} compat01 — 0–1
 * @param {number} [maxDelta] default 6
 */
export function applyCompatibilityCalibration(score, compat01, maxDelta = 6) {
  const c = clamp(Number(compat01) || 0, 0, 1);
  const skew = (c - 0.5) * 12;
  const slotBias = 0.38 + 0.62 * (clamp(score, 0, 100) / 100);
  const d = clamp(Math.round(skew * slotBias), -maxDelta, maxDelta);
  return clamp(score + d, 0, 100);
}

/**
 * Owner fit high → sharper emphasis on stronger windows (same curve family as compat; separate knob).
 * @param {number} score
 * @param {number} fit01 — 0–1
 * @param {number} [maxDelta] default 6
 */
export function applyOwnerFitCalibration(score, fit01, maxDelta = 6) {
  const f = clamp(Number(fit01) || 0, 0, 1);
  const skew = (f - 0.5) * 11;
  const slotBias = 0.32 + 0.68 * (clamp(score, 0, 100) / 100);
  const d = clamp(Math.round(skew * slotBias), -maxDelta, maxDelta);
  return clamp(score + d, 0, 100);
}

/**
 * Primary axis / lane weight for this slot — strong axis → tiny extra separation vs baseline curve.
 * @param {number} score
 * @param {number} primaryWeight01 — lane table weight 0–1 for this hour/root context
 * @param {number} [maxDelta] default 6
 */
export function applyPrimaryAxisStrengthCalibration(score, primaryWeight01, maxDelta = 6) {
  const w = clamp(Number(primaryWeight01) || 0, 0, 1);
  const skew = (w - 0.7) * 20;
  const d = clamp(Math.round(skew), -maxDelta, maxDelta);
  return clamp(score + d, 0, 100);
}

/**
 * Apply calibration stack with a hard total cap so rankings rarely flip from noise.
 * @param {number} baseScore
 * @param {{ compat01: number, fit01: number, primaryWeight01: number }} ctx
 * @param {{ totalCap?: number, stepCap?: number }} [opts]
 */
export function applyTimingCalibrationStack(
  baseScore,
  { compat01, fit01, primaryWeight01 },
  opts = {},
) {
  const totalCap = opts.totalCap ?? 8;
  const stepCap = opts.stepCap ?? 6;
  const b = clamp(Math.round(baseScore), 0, 100);
  let s = applyCompatibilityCalibration(b, compat01, stepCap);
  s = applyOwnerFitCalibration(s, fit01, stepCap);
  s = applyPrimaryAxisStrengthCalibration(s, primaryWeight01, stepCap);
  let delta = s - b;
  if (delta > totalCap) s = b + totalCap;
  else if (delta < -totalCap) s = b - totalCap;
  return clamp(Math.round(s), 0, 100);
}
