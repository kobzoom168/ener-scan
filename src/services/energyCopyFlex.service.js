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
} from "./flex/flex.utils.js";

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
 * @param {ResolveEnergyCopyForFlexInput} input
 * @returns {Promise<ResolveEnergyCopyForFlexResult>}
 */
export async function resolveEnergyCopyForFlex(input = {}) {
  const mainEnergy = String(input.mainEnergy || "").trim();
  const hidden = String(input.hidden || "").trim();
  const codeIn =
    String(input.categoryCode || "").trim() ||
    inferEnergyCategoryCodeFromMainEnergy(mainEnergy);
  const famRaw = String(input.objectFamily || "").trim();
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

  const copySet = await loadCopyWithFallback(
    codeIn,
    objectFamilyNorm,
    tone,
  );
  const hasDbCopy = Boolean(
    copySet.headline &&
      Array.isArray(copySet.bullets) &&
      copySet.bullets.length > 0,
  );
  if (hasDbCopy) fromDb = true;

  const accent =
    pickAccentColorFromCategoryCode(codeIn) ||
    pickMainEnergyColorLegacy(mainEnergy || "พลังหลัก");

  const label =
    (shortNameTh || displayNameTh || "").trim() ||
    getEnergyShortLabelLegacy(mainEnergy || "-");

  return {
    categoryCode: codeIn,
    accentColor: accent,
    energyShortLabel: label,
    headline: copySet.headline || null,
    fitLine: copySet.fitLine || null,
    bullets: Array.isArray(copySet.bullets) ? [...copySet.bullets] : [],
    hiddenShortText: mapHiddenToShortText(hidden, codeIn),
    fromDb,
  };
}
