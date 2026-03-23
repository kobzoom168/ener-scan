/**
 * Small timing helpers for human-like message pacing (LINE push/reply).
 */

/**
 * @param {number} min
 * @param {number} max
 * @returns {number} inclusive random integer in [min, max]
 */
export function randomBetween(min, max) {
  const lo = Math.ceil(Number(min));
  const hi = Math.floor(Number(max));
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) return 0;
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
