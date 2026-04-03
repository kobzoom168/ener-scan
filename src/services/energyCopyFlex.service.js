/**
 * Flex-facing adaptor: energy category + copy templates + safe fallbacks.
 * Uses DB when available; warns and falls back on failure.
 */
import { getEnergyCategory, getEnergyCopySet } from "./energyCopy.service.js";
import {
  inferEnergyCategoryCodeFromMainEnergy,
  normalizeObjectFamilyForEnergyCopy,
  pickAccentColorFromCategoryCode,
  ENERGY_CATEGORY_DISPLAY_SYNC,
} from "../utils/energyCategoryResolve.util.js";
import {
  FLEX_TRAIT_HIDDEN_MAX,
  getEnergyShortLabelLegacy,
  pickMainEnergyColorLegacy,
  safeWrapText,
  truncateAtWordBoundary,
} from "./flex/flex.utils.js";
import {
  FLEX_SHORT_BULLET_MAX,
  FLEX_SHORT_FIT_MAX,
  FLEX_SHORT_HEADLINE_MAX,
  getFallbackFlexSurfaceLines,
} from "../utils/reports/flexSummaryShortCopy.js";
import {
  lineContainsEnergyCopyAvoidWord,
} from "../utils/reports/energyCopyAvoidWords.util.js";

/**
 * Keeps DB strings inside the same summary-shell caps as composed pools (V4.1 teaser; avoids bubble bloat).
 */
function clampFlexDbSurfaceLines(headline, fitLine, bullets) {
  const h = headline
    ? truncateAtWordBoundary(String(headline).trim(), FLEX_SHORT_HEADLINE_MAX)
    : null;
  const f = fitLine
    ? truncateAtWordBoundary(String(fitLine).trim(), FLEX_SHORT_FIT_MAX)
    : "";
  const b = (Array.isArray(bullets) ? bullets : [])
    .slice(0, 2)
    .map((line) =>
      truncateAtWordBoundary(String(line || "").trim(), FLEX_SHORT_BULLET_MAX),
    )
    .filter(Boolean);
  return { headline: h, fitLine: f, bullets: b };
}

/**
 * Short hidden line for Flex (truncation; no keyword substring map).
 * @param {string} hidden
 * @param {string} [_categoryCode]
 */
export function mapHiddenToShortText(hidden, _categoryCode) {
  void _categoryCode;
  const h = String(hidden || "").trim();
  if (!h || h === "-") return "";
  return String(safeWrapText(h, FLEX_TRAIT_HIDDEN_MAX) || "").trim();
}

/**
 * @typedef {object} ResolveEnergyCopyForFlexInput
 * @property {string} [categoryCode]
 * @property {string} [objectFamily] — raw pipeline slug
 * @property {string} [mainEnergy] — parsed พลังหลัก
 * @property {string} [hidden] — parsed hidden line
 * @property {"general"|"spiritual_growth"|null} [crystalMode] — when DB copy misses, prefer spiritual_growth crystal fallback
 */

/**
 * @typedef {object} ResolveEnergyCopyForFlexResult
 * @property {string} categoryCode
 * @property {string} accentColor
 * @property {string} energyShortLabel
 * @property {string|null} headline
 * @property {string|null} fitLine
 * @property {string[]} bullets
 * @property {string} hiddenShortText
 * @property {boolean} fromDb
 */

async function loadCopyWithFallback(categoryCode, objectFamilyNormalized, tone) {
  let set = { headline: null, fitLine: null, bullets: [] };
  try {
    set = await getEnergyCopySet({
      categoryCode,
      objectFamily: objectFamilyNormalized,
      tone,
    });
  } catch (e) {
    console.warn("[energyCopyFlex] getEnergyCopySet failed", {
      categoryCode,
      objectFamily: objectFamilyNormalized,
      message: e?.message,
    });
  }
  if (
    (!set.headline || !set.bullets?.length) &&
    objectFamilyNormalized === "thai_talisman"
  ) {
    try {
      const alt = await getEnergyCopySet({
        categoryCode,
        objectFamily: "thai_amulet",
        tone,
      });
      if (alt.headline && alt.bullets?.length) return alt;
    } catch (e) {
      console.warn("[energyCopyFlex] thai_amulet fallback failed", {
        message: e?.message,
      });
    }
  }
  return set;
}

/**
 * @param {string} codeIn
 * @param {string} objectFamilyNorm
 * @param {string} crystalMode
 * @returns {string}
 */
function effectiveFlexFallbackCategoryCode(codeIn, objectFamilyNorm, crystalMode) {
  if (
    objectFamilyNorm === "crystal" &&
    String(crystalMode || "").trim() === "spiritual_growth"
  ) {
    return "spiritual_growth";
  }
  return String(codeIn || "").trim() || "luck_fortune";
}

/**
 * @param {ResolveEnergyCopyForFlexInput} input
 * @returns {Promise<ResolveEnergyCopyForFlexResult>}
 */
export async function resolveEnergyCopyForFlex(input = {}) {
  const mainEnergy = String(input.mainEnergy || "").trim();
  const hidden = String(input.hidden || "").trim();
  const famRaw = String(input.objectFamily || "").trim();
  const crystalModeIn = String(input.crystalMode ?? "").trim();
  const codeIn =
    String(input.categoryCode || "").trim() ||
    inferEnergyCategoryCodeFromMainEnergy(mainEnergy, famRaw);
  const objectFamilyNorm = normalizeObjectFamilyForEnergyCopy(famRaw);

  let tone = "hard";
  let displayNameTh =
    ENERGY_CATEGORY_DISPLAY_SYNC[codeIn]?.display_name_th || "";
  let shortNameTh = ENERGY_CATEGORY_DISPLAY_SYNC[codeIn]?.short_name_th || "";

  let fromDb = false;
  try {
    const row = await getEnergyCategory(codeIn);
    if (row) {
      fromDb = true;
      tone = String(row.tone_default || "hard").trim() || "hard";
      displayNameTh = String(row.display_name_th || displayNameTh);
      shortNameTh = String(row.short_name_th || shortNameTh || displayNameTh);
    }
  } catch (e) {
    console.warn("[energyCopyFlex] getEnergyCategory failed", {
      code: codeIn,
      message: e?.message,
    });
  }

  let copySet = await loadCopyWithFallback(
    codeIn,
    objectFamilyNorm,
    tone,
  );
  let hasDbCopy = Boolean(
    copySet.headline &&
      Array.isArray(copySet.bullets) &&
      copySet.bullets.length > 0,
  );
  if (
    !hasDbCopy &&
    objectFamilyNorm === "crystal" &&
    crystalModeIn === "spiritual_growth" &&
    codeIn !== "spiritual_growth"
  ) {
    copySet = await loadCopyWithFallback(
      "spiritual_growth",
      objectFamilyNorm,
      tone,
    );
    hasDbCopy = Boolean(
      copySet.headline &&
        Array.isArray(copySet.bullets) &&
        copySet.bullets.length > 0,
    );
  }
  if (hasDbCopy) fromDb = true;

  const accent =
    pickAccentColorFromCategoryCode(codeIn) ||
    pickMainEnergyColorLegacy(mainEnergy || "พลังหลัก");

  let label =
    (shortNameTh || displayNameTh || "").trim() ||
    getEnergyShortLabelLegacy(mainEnergy || "-", famRaw);

  if (lineContainsEnergyCopyAvoidWord(label)) {
    label =
      ENERGY_CATEGORY_DISPLAY_SYNC[codeIn]?.short_name_th ||
      ENERGY_CATEGORY_DISPLAY_SYNC[codeIn]?.display_name_th ||
      getEnergyShortLabelLegacy(mainEnergy || "-", famRaw);
  }

  let clamped = clampFlexDbSurfaceLines(
    copySet.headline || null,
    copySet.fitLine || null,
    copySet.bullets,
  );

  let usedGuardFallback = false;
  const guarded = [
    clamped.headline,
    clamped.fitLine,
    ...(clamped.bullets || []),
  ]
    .filter(Boolean)
    .some((x) => lineContainsEnergyCopyAvoidWord(x));
  if (guarded) {
    usedGuardFallback = true;
    const fbCode = effectiveFlexFallbackCategoryCode(
      codeIn,
      objectFamilyNorm,
      crystalModeIn,
    );
    const fb = getFallbackFlexSurfaceLines(fbCode, objectFamilyNorm);
    clamped = clampFlexDbSurfaceLines(
      fb.headline,
      fb.fitLine,
      fb.bullets,
    );
    fromDb = false;
  }

  if (objectFamilyNorm === "crystal" && (!fromDb || usedGuardFallback)) {
    console.log(
      JSON.stringify({
        event: "CRYSTAL_FALLBACK_USED",
        categoryCode: codeIn,
        crystalMode: crystalModeIn || null,
        fromDb,
        usedGuardFallback,
      }),
    );
  }

  return {
    categoryCode: codeIn,
    accentColor: accent,
    energyShortLabel: label,
    headline: clamped.headline,
    fitLine: clamped.fitLine,
    bullets: clamped.bullets,
    hiddenShortText: mapHiddenToShortText(hidden, codeIn),
    fromDb,
  };
}
