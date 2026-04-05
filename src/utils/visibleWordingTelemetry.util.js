/**
 * Log-safe snapshot of visible wording diagnostics for `reportPayload.builder` events.
 * Does not compute wording; only shapes output from {@link resolveCrystalVisibleWordingPriority} result.
 */

/**
 * @typedef {import("./crystalVisibleWordingPriority.util.js").CrystalVisibleWordingPriorityResult} CrystalVisibleWordingPriorityResult
 */

/**
 * @param {CrystalVisibleWordingPriorityResult | null | undefined} diag
 * @returns {{
 *   visibleWordingDiagnostics: {
 *     visibleWordingDecisionSource: string | null,
 *     visibleWordingObjectFamilyUsed: string | null,
 *     visibleWordingCrystalSpecific: boolean,
 *     visibleWordingCategoryUsed: string | null,
 *     visibleWordingPresentationAngle: string | null,
 *     visibleWordingFallbackLevel: number | null,
 *     visibleWordingReason: string | null,
 *   }
 * }}
 */
export function buildVisibleWordingTelemetryFields(diag) {
  const d = diag || {};
  return {
    visibleWordingDiagnostics: {
      visibleWordingDecisionSource: d.visibleWordingDecisionSource ?? null,
      visibleWordingObjectFamilyUsed: d.visibleWordingObjectFamilyUsed ?? null,
      visibleWordingCrystalSpecific: d.visibleWordingCrystalSpecific === true,
      visibleWordingCategoryUsed: d.visibleWordingCategoryUsed ?? null,
      visibleWordingPresentationAngle: d.visibleWordingPresentationAngle ?? null,
      visibleWordingFallbackLevel:
        d.visibleWordingFallbackLevel != null &&
        Number.isFinite(Number(d.visibleWordingFallbackLevel))
          ? Number(d.visibleWordingFallbackLevel)
          : null,
      visibleWordingReason: d.visibleWordingReason ?? null,
    },
  };
}

/**
 * Correlation flags for ops (routing category vs wording template category; crystal rule vs crystal-specific copy).
 *
 * @param {object} p
 * @param {string} p.energyCategoryCode — routing / inference category
 * @param {CrystalVisibleWordingPriorityResult | null | undefined} p.visibleWordingDiag
 * @param {string|null|undefined} [p.crystalRoutingRuleId]
 * @param {string} [p.objectFamilyNormalized]
 * @returns {{
 *   wordingCategoryMatchesRoutingCategory: boolean,
 *   crystalRoutingVsWordingCrystalFlagOk: boolean | null,
 * }}
 */
export function buildVisibleWordingTelemetryCorrelation(p) {
  const code = String(p.energyCategoryCode || "").trim();
  const wCat = String(p.visibleWordingDiag?.visibleWordingCategoryUsed || "").trim();
  const wordingCategoryMatchesRoutingCategory =
    Boolean(code) && Boolean(wCat) && code === wCat;

  const fam = String(p.objectFamilyNormalized || "").trim();
  const ruleId = p.crystalRoutingRuleId != null ? String(p.crystalRoutingRuleId) : "";
  const crystalSpecific = p.visibleWordingDiag?.visibleWordingCrystalSpecific === true;

  /** null = N/A (non-crystal routing trace) */
  let crystalRoutingVsWordingCrystalFlagOk = null;
  if (fam === "crystal" && ruleId.startsWith("crystal_rg_")) {
    crystalRoutingVsWordingCrystalFlagOk = crystalSpecific;
  }

  return {
    wordingCategoryMatchesRoutingCategory,
    crystalRoutingVsWordingCrystalFlagOk,
  };
}
