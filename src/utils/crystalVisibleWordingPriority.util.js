/**
 * Traceable crystal vs non-crystal **visible wording** priority for report/Flex surfaces.
 *
 * Routing (`crystalCategoryRouting.util.js`) decides category codes; this module documents
 * which **wording source** was used for teaser/headline/fit/bullets after DB + code fallback.
 *
 * ## Priority when `object_family` resolves to `crystal`
 *
 * 1. **DB crystal-specific templates** — `resolveVisibleWordingBundleFromDb` uses
 *    `getEnergyCopyTemplateRowsCrystalOnly` (`rowSource`: `crystal_only` or
 *    `crystal_spiritual_growth_retry`). Prefer this when the visible surface is complete.
 * 2. **Code crystal-first pools** — `composeFlexShortSurface` / `buildFlexSummarySurfaceFields`
 *    pass `objectFamily` so `normalizeObjectFamilyForEnergyCopy` selects the **crystal**
 *    branch in `flexSummaryShortCopy.js` (stone-flavored lines), not generic Thai-amulet pools.
 * 3. **Generic Thai master** — must **not** win for crystal: callers should always pass the
 *    real pipeline `objectFamily` into composed fallback so the crystal branch can run.
 *
 * Non-crystal families: DB `family + all` rows, then code pools for that family (unchanged).
 *
 * @module crystalVisibleWordingPriority.util
 */

/**
 * @typedef {Object} ResolveCrystalVisibleWordingPriorityInput
 * @property {string} objectFamilyNormalized — result of `normalizeObjectFamilyForEnergyCopy`
 * @property {string} energyCategoryCode — final category for the report payload (required for code-bank crystal path)
 * @property {boolean} dbSurfaceOk — DB bundle passed `isUsableVisibleSurface`
 * @property {string|null|undefined} [dbRowSource] — `crystal_only` | `crystal_spiritual_growth_retry` | `family_plus_all` | etc.
 * @property {string} [categoryUsedForSurface] — `dbBundleResolved.categoryUsed` when DB wins, else category code
 * @property {string|null|undefined} [presentationAngleId] — angle on the surface actually shown (DB headline or code meta)
 * @property {number|null|undefined} [dbWordingFallbackLevel] — from DB bundle diagnostics when DB path
 */

/**
 * @typedef {Object} CrystalVisibleWordingPriorityResult
 * @property {"db_crystal"|"db_family"|"code_bank_crystal_first"|"code_bank_family"} visibleWordingDecisionSource
 * @property {string} visibleWordingObjectFamilyUsed
 * @property {boolean} visibleWordingCrystalSpecific — true when copy path is crystal-scoped (DB crystal rows or code crystal branch)
 * @property {string} visibleWordingCategoryUsed
 * @property {string|null} visibleWordingPresentationAngle
 * @property {number|null} visibleWordingFallbackLevel
 * @property {string} visibleWordingReason — short machine reason for diagnostics
 */

/**
 * Pure helper: derive wording-decision diagnostics without performing I/O.
 *
 * @param {ResolveCrystalVisibleWordingPriorityInput} p
 * @returns {CrystalVisibleWordingPriorityResult}
 */
export function resolveCrystalVisibleWordingPriority(p) {
  const fam = String(p.objectFamilyNormalized || "").trim();
  const isCrystal = fam === "crystal";
  const dbOk = Boolean(p.dbSurfaceOk);
  const rowSource = p.dbRowSource != null ? String(p.dbRowSource).trim() : "";
  const categoryUsed = String(
    p.categoryUsedForSurface || p.energyCategoryCode || "",
  ).trim();
  const angle =
    p.presentationAngleId != null && p.presentationAngleId !== ""
      ? String(p.presentationAngleId)
      : null;
  const fbLevel =
    p.dbWordingFallbackLevel != null && Number.isFinite(Number(p.dbWordingFallbackLevel))
      ? Number(p.dbWordingFallbackLevel)
      : null;

  if (!isCrystal) {
    return {
      visibleWordingDecisionSource: dbOk ? "db_family" : "code_bank_family",
      visibleWordingObjectFamilyUsed: fam || "thai_amulet",
      visibleWordingCrystalSpecific: false,
      visibleWordingCategoryUsed: categoryUsed,
      visibleWordingPresentationAngle: angle,
      visibleWordingFallbackLevel: dbOk ? fbLevel : null,
      visibleWordingReason: dbOk
        ? "non_crystal_db_bundle"
        : "non_crystal_code_bank_fallback",
    };
  }

  const crystalDb =
    dbOk &&
    (rowSource === "crystal_only" || rowSource === "crystal_spiritual_growth_retry");

  if (crystalDb) {
    return {
      visibleWordingDecisionSource: "db_crystal",
      visibleWordingObjectFamilyUsed: "crystal",
      visibleWordingCrystalSpecific: true,
      visibleWordingCategoryUsed: categoryUsed,
      visibleWordingPresentationAngle: angle,
      visibleWordingFallbackLevel: fbLevel,
      visibleWordingReason:
        rowSource === "crystal_spiritual_growth_retry"
          ? "db_crystal_spiritual_growth_retry"
          : "db_crystal_only_rows",
    };
  }

  return {
    visibleWordingDecisionSource: "code_bank_crystal_first",
    visibleWordingObjectFamilyUsed: "crystal",
    visibleWordingCrystalSpecific: true,
    visibleWordingCategoryUsed: String(p.energyCategoryCode || "").trim(),
    visibleWordingPresentationAngle: angle,
    visibleWordingFallbackLevel: null,
    visibleWordingReason: dbOk
      ? "crystal_db_bundle_not_usable"
      : "crystal_no_db_surface",
  };
}
