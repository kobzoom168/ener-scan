/**
 * Shared presentation-angle ids for crystal `confidence` visible wording (LINE + Flex + DB hydrate).
 * Keep in sync with `LINE_BANKS.crystal.confidence` and `VARIANT_BANKS.crystal.confidence`.
 */
import { normalizeObjectFamilyForEnergyCopy } from "../energyCategoryResolve.util.js";

/** @type {readonly string[]} */
export const CRYSTAL_CONFIDENCE_PRESENTATION_ANGLES = Object.freeze([
  "voice",
  "presence",
  "stance",
  "gravitas",
  "forum",
]);

/**
 * Stable index from seed (same algorithm as other wording picks in this codebase).
 * @param {string} seed
 * @param {number} modulo
 */
function stableIndexMod(seed, modulo) {
  const s = String(seed || "s");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return modulo > 0 ? h % modulo : 0;
}

/**
 * Deterministic angle for crystal confidence surfaces.
 * @param {string} seed — e.g. scanResultId, publicToken, reportId
 * @returns {string}
 */
export function deriveCrystalConfidencePresentationAngle(seed) {
  const list = CRYSTAL_CONFIDENCE_PRESENTATION_ANGLES;
  return list[stableIndexMod(seed, list.length)] ?? list[0];
}

/**
 * DB hydration for {@link resolveVisibleWordingBundleFromDb}: pass a preferred angle for crystal+confidence
 * so angle-tagged rows rank correctly; rows with null `presentation_angle` remain eligible (safe fallback).
 * Other families/categories keep `""` to preserve existing filter behavior (Thai / talisman unchanged).
 *
 * @param {object} p
 * @param {string} p.categoryCode
 * @param {string} [p.objectFamilyRaw]
 * @param {string} [p.seed]
 * @returns {string} angle id or ""
 */
export function deriveVisiblePresentationAngleForDbHydrate(p) {
  const fam = normalizeObjectFamilyForEnergyCopy(String(p.objectFamilyRaw || ""));
  const code = String(p.categoryCode || "").trim();
  if (fam !== "crystal" || code !== "confidence") {
    return "";
  }
  return deriveCrystalConfidencePresentationAngle(String(p.seed || ""));
}
