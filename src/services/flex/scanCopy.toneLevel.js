/**
 * Product scan result tone (separate from age-based tonePreset: youthful | warm | mystic).
 * Controls headline / summary / traits / goals / retention hook wording style.
 */

/** @typedef {'standard'|'mystic'|'mystic_sales'} ScanToneLevel */

export const SCAN_TONE_LEVEL = {
  STANDARD: "standard",
  MYSTIC: "mystic",
  MYSTIC_SALES: "mystic_sales",
};

/** Default: evocative but trustworthy; switch via `options.scanToneLevel` or env `SCAN_TONE_LEVEL`. */
export const DEFAULT_SCAN_TONE_LEVEL = SCAN_TONE_LEVEL.MYSTIC;

const VALID = new Set([
  SCAN_TONE_LEVEL.STANDARD,
  SCAN_TONE_LEVEL.MYSTIC,
  SCAN_TONE_LEVEL.MYSTIC_SALES,
]);

/**
 * @param {{ scanToneLevel?: string }} [options]
 * @returns {ScanToneLevel}
 */
export function resolveScanToneLevel(options = {}) {
  const raw = options.scanToneLevel;
  if (typeof raw === "string" && VALID.has(raw.trim())) {
    return /** @type {ScanToneLevel} */ (raw.trim());
  }
  try {
    const env =
      typeof process !== "undefined" && process.env && process.env.SCAN_TONE_LEVEL
        ? String(process.env.SCAN_TONE_LEVEL).trim()
        : "";
    if (env && VALID.has(env)) return /** @type {ScanToneLevel} */ (env);
  } catch {
    // ignore
  }
  return DEFAULT_SCAN_TONE_LEVEL;
}
