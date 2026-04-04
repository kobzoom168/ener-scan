/**
 * Flex-facing adaptor: energy category + copy templates + safe fallbacks.
 * Uses DB when available; warns and falls back on failure.
 */
import {
  getEnergyCategory,
  getEnergyCopySet,
  getEnergyCopyTemplateRowsBundle,
  getEnergyCopyTemplateRowsCrystalOnly,
} from "./energyCopy.service.js";
import { selectEnergyCopyFromTemplates } from "../utils/energyCopySelect.util.js";
import {
  filterRowsForLegacyEnergyCopy,
  isUsableVisibleSurface,
} from "../utils/visibleWordingSelect.util.js";
import {
  resolveVisibleWordingBundleFromDb,
  logFieldsFromDbBundle,
} from "./dbWordingBundle.service.js";
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
 * @param {string|null|undefined} headline
 * @param {string|null|undefined} fitLine
 * @param {readonly string[]|null|undefined} bullets
 */
export function clampFlexDbSurfaceLines(headline, fitLine, bullets) {
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
 * @property {string} [presentationAngleId] — Flex/report angle (e.g. shield); DB-first visible wording
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
 * @property {string} [wordingPrimarySource]
 * @property {string|null} [visibleMainLabelSource]
 * @property {boolean} [visibleCopyUsedCodeFallback]
 * @property {object} [dbWordingDiagnostics]
 * @property {string|null} [opening]
 * @property {string|null} [teaser]
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
 * @param {{ headline?: string|null, fitLine?: string|null, bullets?: string[] }} set
 * @returns {boolean}
 */
function isUsableEnergyCopySet(set) {
  return Boolean(
    set &&
      set.headline &&
      Array.isArray(set.bullets) &&
      set.bullets.length > 0,
  );
}

/**
 * Crystal Flex: crystal-only DB → offline crystal master → generic `all` rows → merged [crystal,all] last.
 * Never starts from merged [crystal,all] — avoids generic `all` winning over incomplete crystal rows.
 *
 * @param {object} p
 * @param {string} p.categoryCode
 * @param {string} p.tone
 * @param {string} p.crystalModeIn
 * @param {string} [p.presentationAngleId]
 */
async function resolveCrystalFlexSurfaceCopy({
  categoryCode,
  tone,
  crystalModeIn,
  presentationAngleId = "",
}) {
  const code = String(categoryCode || "").trim();
  const fallbackCode = effectiveFlexFallbackCategoryCode(
    code,
    "crystal",
    crystalModeIn,
  );
  const angle = String(presentationAngleId || "").trim();

  const dbTry = await resolveVisibleWordingBundleFromDb({
    categoryCode: code,
    objectFamilyRaw: "crystal",
    presentationAngleId: angle,
    crystalMode: crystalModeIn,
  });
  if (dbTry && isUsableVisibleSurface(dbTry.bundle)) {
    const visibleSurface = dbTry.bundle;
    console.log(
      JSON.stringify({
        event: "VISIBLE_DB_SURFACE_SELECTED",
        objectFamilyNorm: "crystal",
        categoryCode: dbTry.categoryUsed,
        fallbackCode,
        presentationAngle: angle || null,
        wordingPrimarySource: "db",
        dbWordingSlots: visibleSurface.diagnostics?.dbWordingSlots,
        rowSource: dbTry.rowSource,
      }),
    );
    console.log(
      JSON.stringify({
        event: "CRYSTAL_DB_COPY_SELECTED",
        objectFamilyNorm: "crystal",
        categoryCode: dbTry.categoryUsed,
        fallbackCode,
        selectedSource: "crystal_db_visible",
        hadCrystalDbRow: true,
        hadGenericAllRow: false,
        reason: "visible_surface_angle_aware",
      }),
    );
    return {
      copySet: {
        headline: visibleSurface.headline,
        fitLine: visibleSurface.fitLine,
        bullets: visibleSurface.bullets,
        opening: visibleSurface.opening ?? null,
        teaser: visibleSurface.teaser ?? null,
      },
      mainLabelFromDb: visibleSurface.mainLabel,
      visibleWordingDiagnostics: visibleSurface.diagnostics,
      fromDb: true,
      templateFromDb: true,
      usedOfflineCrystalMaster: false,
      usedGenericAllLastResort: false,
    };
  }

  /** @type {unknown[]} */
  let rawCrystalRows = [];
  try {
    rawCrystalRows = await getEnergyCopyTemplateRowsCrystalOnly({
      categoryCode: code,
      tone,
    });
  } catch (e) {
    console.warn("[energyCopyFlex] getEnergyCopyTemplateRowsCrystalOnly failed", {
      categoryCode: code,
      message: e?.message,
    });
  }

  let crystalOnly = selectEnergyCopyFromTemplates(
    filterRowsForLegacyEnergyCopy(rawCrystalRows),
    "crystal",
  );

  const hadPartialCrystalRow =
    Boolean(crystalOnly?.headline) ||
    Boolean(crystalOnly?.fitLine) ||
    (Array.isArray(crystalOnly?.bullets) && crystalOnly.bullets.length > 0);

  if (isUsableEnergyCopySet(crystalOnly)) {
    console.log(
      JSON.stringify({
        event: "CRYSTAL_DB_COPY_SELECTED",
        objectFamilyNorm: "crystal",
        categoryCode: code,
        fallbackCode,
        selectedSource: "crystal_db",
        hadCrystalDbRow: true,
        hadGenericAllRow: false,
        reason: "crystal_only_rows_usable",
      }),
    );
    return {
      copySet: crystalOnly,
      mainLabelFromDb: null,
      visibleWordingDiagnostics: null,
      fromDb: true,
      templateFromDb: true,
      usedOfflineCrystalMaster: false,
      usedGenericAllLastResort: false,
    };
  }

  console.log(
    JSON.stringify({
      event: "CRYSTAL_DB_COPY_MISS",
      objectFamilyNorm: "crystal",
      categoryCode: code,
      fallbackCode,
      selectedSource: null,
      hadCrystalDbRow: hadPartialCrystalRow,
      hadGenericAllRow: false,
      reason: hadPartialCrystalRow
        ? "crystal_only_partial_incomplete"
        : "crystal_only_zero_rows",
    }),
  );

  if (
    String(crystalModeIn || "").trim() === "spiritual_growth" &&
    code !== "spiritual_growth"
  ) {
    /** @type {unknown[]} */
    let rawSg = [];
    try {
      rawSg = await getEnergyCopyTemplateRowsCrystalOnly({
        categoryCode: "spiritual_growth",
        tone,
      });
    } catch {
      /* logged below if still miss */
    }
    const sgCrystal = selectEnergyCopyFromTemplates(
      filterRowsForLegacyEnergyCopy(rawSg),
      "crystal",
    );
    if (isUsableEnergyCopySet(sgCrystal)) {
      console.log(
        JSON.stringify({
          event: "CRYSTAL_DB_COPY_SELECTED",
          objectFamilyNorm: "crystal",
          categoryCode: "spiritual_growth",
          fallbackCode: "spiritual_growth",
          selectedSource: "crystal_db",
          hadCrystalDbRow: true,
          hadGenericAllRow: false,
          reason: "spiritual_growth_category_retry",
        }),
      );
      return {
        copySet: sgCrystal,
        mainLabelFromDb: null,
        visibleWordingDiagnostics: null,
        fromDb: true,
        templateFromDb: true,
        usedOfflineCrystalMaster: false,
        usedGenericAllLastResort: false,
      };
    }
  }

  const fb = getFallbackFlexSurfaceLines(fallbackCode, "crystal");
  const fbSet = {
    headline: fb.headline,
    fitLine: fb.fitLine,
    bullets: fb.bullets,
  };
  if (isUsableEnergyCopySet(fbSet)) {
    console.log(
      JSON.stringify({
        event: "CRYSTAL_DB_GENERIC_SKIPPED",
        objectFamilyNorm: "crystal",
        categoryCode: code,
        fallbackCode,
        selectedSource: "crystal_offline_master",
        hadCrystalDbRow: hadPartialCrystalRow,
        hadGenericAllRow: false,
        reason: "prefer_crystal_offline_over_generic_all",
      }),
    );
    console.log(
      JSON.stringify({
        event: "CRYSTAL_FALLBACK_SELECTED",
        objectFamilyNorm: "crystal",
        categoryCode: code,
        fallbackCode,
        selectedSource: "crystal_offline_master",
        hadCrystalDbRow: hadPartialCrystalRow,
        hadGenericAllRow: false,
        reason: "offline_master_v2_crystal_branch",
      }),
    );
    return {
      copySet: fbSet,
      mainLabelFromDb: null,
      visibleWordingDiagnostics: null,
      fromDb: false,
      templateFromDb: false,
      usedOfflineCrystalMaster: true,
      usedGenericAllLastResort: false,
    };
  }

  let genericAllOnly = { headline: null, fitLine: null, bullets: [] };
  try {
    genericAllOnly = await getEnergyCopySet({
      categoryCode: code,
      objectFamily: "all",
      tone,
    });
  } catch (e) {
    console.warn("[energyCopyFlex] generic all-only last resort failed", {
      categoryCode: code,
      message: e?.message,
    });
  }

  if (isUsableEnergyCopySet(genericAllOnly)) {
    console.log(
      JSON.stringify({
        event: "GENERIC_ALL_ROW_LAST_RESORT_USED",
        objectFamilyNorm: "crystal",
        categoryCode: code,
        fallbackCode,
        selectedSource: "generic_all_db",
        hadCrystalDbRow: hadPartialCrystalRow,
        hadGenericAllRow: true,
        reason: "object_family_all_only_after_crystal_paths_exhausted",
      }),
    );
    return {
      copySet: genericAllOnly,
      mainLabelFromDb: null,
      visibleWordingDiagnostics: null,
      fromDb: true,
      templateFromDb: true,
      usedOfflineCrystalMaster: false,
      usedGenericAllLastResort: true,
    };
  }

  const merged = await loadCopyWithFallback(code, "crystal", tone);
  if (isUsableEnergyCopySet(merged)) {
    console.log(
      JSON.stringify({
        event: "GENERIC_ALL_ROW_LAST_RESORT_USED",
        objectFamilyNorm: "crystal",
        categoryCode: code,
        fallbackCode,
        selectedSource: "merged_crystal_plus_all_db",
        hadCrystalDbRow: hadPartialCrystalRow,
        hadGenericAllRow: true,
        reason: "legacy_merged_crystal_all_after_all_only_empty",
      }),
    );
    return {
      copySet: merged,
      mainLabelFromDb: null,
      visibleWordingDiagnostics: null,
      fromDb: true,
      templateFromDb: true,
      usedOfflineCrystalMaster: false,
      usedGenericAllLastResort: true,
    };
  }

  return {
    copySet: { headline: null, fitLine: null, bullets: [] },
    mainLabelFromDb: null,
    visibleWordingDiagnostics: null,
    fromDb: false,
    templateFromDb: false,
    usedOfflineCrystalMaster: false,
    usedGenericAllLastResort: false,
  };
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
  const presentationAngleId = String(input.presentationAngleId || "").trim();
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

  let copySet = { headline: null, fitLine: null, bullets: [] };
  let usedOfflineCrystalMaster = false;
  /** @type {object | null} */
  let visibleWordingDiagnostics = null;
  let mainLabelFromVisibleDb = null;
  let wordingPrimarySource = "fallback";

  if (objectFamilyNorm === "crystal") {
    const crystalRes = await resolveCrystalFlexSurfaceCopy({
      categoryCode: codeIn,
      tone,
      crystalModeIn,
      presentationAngleId,
    });
    copySet = crystalRes.copySet;
    usedOfflineCrystalMaster = crystalRes.usedOfflineCrystalMaster;
    mainLabelFromVisibleDb = crystalRes.mainLabelFromDb ?? null;
    visibleWordingDiagnostics = crystalRes.visibleWordingDiagnostics ?? null;
    if (visibleWordingDiagnostics) wordingPrimarySource = "db";
    else if (isUsableEnergyCopySet(crystalRes.copySet) && crystalRes.templateFromDb) {
      wordingPrimarySource = "db_legacy";
    }
    if (isUsableEnergyCopySet(crystalRes.copySet)) {
      fromDb = crystalRes.templateFromDb === true;
    } else {
      fromDb = false;
    }
  } else {
    const dbNonCrystal = await resolveVisibleWordingBundleFromDb({
      categoryCode: codeIn,
      objectFamilyRaw: famRaw,
      presentationAngleId,
      crystalMode: null,
    });
    if (dbNonCrystal && isUsableVisibleSurface(dbNonCrystal.bundle)) {
      const vis = dbNonCrystal.bundle;
      copySet = {
        headline: vis.headline,
        fitLine: vis.fitLine,
        bullets: vis.bullets,
        opening: vis.opening ?? null,
        teaser: vis.teaser ?? null,
      };
      mainLabelFromVisibleDb = vis.mainLabel;
      visibleWordingDiagnostics = vis.diagnostics;
      wordingPrimarySource = "db";
      fromDb = true;
    } else {
      copySet = await loadCopyWithFallback(
        codeIn,
        objectFamilyNorm,
        tone,
      );
      if (isUsableEnergyCopySet(copySet)) {
        fromDb = true;
        wordingPrimarySource = "db_legacy";
      }
    }
  }

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

  let visibleMainLabelSource = "category_short";
  if (
    mainLabelFromVisibleDb &&
    !lineContainsEnergyCopyAvoidWord(mainLabelFromVisibleDb)
  ) {
    label = String(mainLabelFromVisibleDb).trim();
    visibleMainLabelSource = "db_main_label";
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
    const fbBranch =
      objectFamilyNorm === "crystal" ? "crystal" : objectFamilyNorm;
    const fb = getFallbackFlexSurfaceLines(fbCode, fbBranch);
    clamped = clampFlexDbSurfaceLines(
      fb.headline,
      fb.fitLine,
      fb.bullets,
    );
    fromDb = false;
    wordingPrimarySource = "fallback";
    visibleWordingDiagnostics = null;
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

  const visibleCopyUsedCodeFallback = wordingPrimarySource === "fallback";

  const dbLog =
    wordingPrimarySource === "db" && visibleWordingDiagnostics
      ? logFieldsFromDbBundle({
          bundle: { diagnostics: visibleWordingDiagnostics },
        })
      : {};

  console.log(
    JSON.stringify({
      event: "ENERGY_COPY_FLEX_RESOLVED",
      categoryCode: codeIn,
      wordingPrimarySource,
      visibleMainLabelSource,
      visibleCopyUsedCodeFallback,
      dbWordingSelected: Boolean(visibleWordingDiagnostics?.dbWordingSelected),
      dbWordingFallbackLevel:
        visibleWordingDiagnostics?.dbWordingFallbackLevel ?? null,
      presentationAngleId: presentationAngleId || null,
      ...dbLog,
    }),
  );

  const openingOut =
    copySet && "opening" in copySet && copySet.opening != null
      ? String(copySet.opening).trim() || null
      : null;
  const teaserOut =
    copySet && "teaser" in copySet && copySet.teaser != null
      ? String(copySet.teaser).trim() || null
      : null;

  return {
    categoryCode: codeIn,
    accentColor: accent,
    energyShortLabel: label,
    headline: clamped.headline,
    fitLine: clamped.fitLine,
    bullets: clamped.bullets,
    opening: openingOut,
    teaser: teaserOut,
    hiddenShortText: mapHiddenToShortText(hidden, codeIn),
    fromDb,
    wordingPrimarySource,
    visibleMainLabelSource,
    visibleCopyUsedCodeFallback,
    dbWordingDiagnostics: visibleWordingDiagnostics || undefined,
  };
}
