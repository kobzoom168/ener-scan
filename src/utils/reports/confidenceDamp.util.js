/**
 * คืน multiplier (0–1) ตาม objectCheckConfidence
 * ใช้คูณ score ก่อนส่งไปแสดงผล
 * @param {number|undefined|null} confidence
 * @returns {number}
 */
export function resolveConfidenceDampMultiplier(confidence) {
  const c =
    typeof confidence === "number" && Number.isFinite(confidence)
      ? confidence
      : 1;
  if (c >= 0.8) return 1.0;
  if (c >= 0.65) return 0.75;
  return 0.55;
}

/**
 * @param {number} rawScore
 * @param {number} damp
 */
export function dampAndClampAxisScore(rawScore, damp) {
  const d =
    damp != null && Number.isFinite(Number(damp))
      ? Math.min(1, Math.max(0, Number(damp)))
      : 1;
  return Math.min(99, Math.max(20, Math.round(Number(rawScore) * d)));
}
