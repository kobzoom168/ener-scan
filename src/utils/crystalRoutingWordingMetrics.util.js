/**
 * Dashboard-ready mismatch metrics: crystal **routing truth** vs **visible wording truth**.
 * Pure + deterministic; does not perform routing or wording selection.
 *
 * @module crystalRoutingWordingMetrics.util
 */
import { normalizeObjectFamilyForEnergyCopy } from "./energyCategoryResolve.util.js";

export const ROUTING_WORDING_ALIGNMENT_STATUS = {
  ALIGNED: "aligned",
  SOFT_MISMATCH: "soft_mismatch",
  HARD_MISMATCH: "hard_mismatch",
  NOT_APPLICABLE: "not_applicable",
};

export const ROUTING_WORDING_MISMATCH_TYPE = {
  NONE: "none",
  CATEGORY_MISMATCH: "category_mismatch",
  OBJECT_FAMILY_MISMATCH: "object_family_mismatch",
  CRYSTAL_SPECIFICITY_MISMATCH: "crystal_specificity_mismatch",
  UNEXPECTED_GENERIC_FALLBACK: "unexpected_generic_fallback",
  ROUTING_MISSING_WORDING_META: "routing_missing_wording_meta",
  WORDING_MISSING_ROUTING_META: "wording_missing_routing_meta",
  FALLBACK_OVERUSE: "fallback_overuse",
  NOT_APPLICABLE: "not_applicable",
};

export const ROUTING_WORDING_MISMATCH_SEVERITY = {
  NONE: "none",
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
};

export const DASHBOARD_METRIC_VERSION = "1";

/**
 * @typedef {Object} CrystalRoutingWordingMetricsInput
 * @property {string} [objectFamily] — raw pipeline slug; normalized internally
 * @property {string} [energyCategoryCode]
 * @property {string|null|undefined} [crystalRoutingRuleId]
 * @property {string|null|undefined} [crystalRoutingStrategy]
 * @property {string|null|undefined} [crystalRoutingReason]
 * @property {string|null|undefined} [protectSignalStrength]
 * @property {string|null|undefined} [visibleWordingDecisionSource]
 * @property {string|null|undefined} [visibleWordingObjectFamilyUsed]
 * @property {boolean} [visibleWordingCrystalSpecific]
 * @property {string|null|undefined} [visibleWordingCategoryUsed]
 * @property {string|null|undefined} [visibleWordingPresentationAngle]
 * @property {number|null|undefined} [visibleWordingFallbackLevel]
 * @property {string|null|undefined} [visibleWordingReason]
 */

/**
 * @typedef {Object} CrystalRoutingWordingMetricsResult
 * @property {string} routingWordingAlignmentStatus
 * @property {string} routingWordingMismatchType
 * @property {string} routingWordingMismatchSeverity
 * @property {string} routingWordingDashboardGroup
 * @property {string} routingCategoryCode
 * @property {string} wordingCategoryCode
 * @property {string} routingObjectFamily
 * @property {string|null} wordingObjectFamily
 * @property {boolean} isCrystalRoutingCase
 * @property {boolean} isCrystalWordingCase
 * @property {boolean} isCrystalSpecificSurface
 * @property {boolean} isGenericSurfaceFallback
 * @property {boolean} isCategoryMismatch
 * @property {boolean} isObjectFamilyMismatch
 * @property {boolean} isFallbackHeavy
 * @property {string|null} crystalRoutingRuleId
 * @property {string|null} crystalRoutingStrategy
 * @property {string|null} crystalRoutingReason
 * @property {string} protectSignalStrength
 * @property {string} energyCategoryCode — same as routingCategoryCode (dashboard alias)
 * @property {string} visibleWordingCategoryUsed — same as wordingCategoryCode (dashboard alias)
 * @property {string|null} visibleWordingDecisionSource
 * @property {boolean} visibleWordingCrystalSpecific
 * @property {number|null} visibleWordingFallbackLevel
 * @property {string} dashboardMetricVersion
 */

/**
 * @param {CrystalRoutingWordingMetricsInput} input
 * @returns {CrystalRoutingWordingMetricsResult}
 */
export function buildCrystalRoutingWordingMetrics(input) {
  const fam = normalizeObjectFamilyForEnergyCopy(String(input.objectFamily || ""));
  const catR = String(input.energyCategoryCode || "").trim();
  const catW = String(input.visibleWordingCategoryUsed || "").trim();
  const wordingFam = String(input.visibleWordingObjectFamilyUsed || "").trim();
  const src = String(input.visibleWordingDecisionSource || "").trim();
  const ruleId = input.crystalRoutingRuleId != null ? String(input.crystalRoutingRuleId) : "";
  const hasCrystalRule = ruleId.startsWith("crystal_rg_");
  const strategy =
    input.crystalRoutingStrategy != null
      ? String(input.crystalRoutingStrategy).trim()
      : "";
  const routingReason =
    input.crystalRoutingReason != null ? String(input.crystalRoutingReason).trim() : "";
  const crystalSpec = input.visibleWordingCrystalSpecific === true;
  const protect = String(input.protectSignalStrength || "none").trim();
  const fbRaw = input.visibleWordingFallbackLevel;
  const fbNum =
    fbRaw != null && Number.isFinite(Number(fbRaw)) ? Number(fbRaw) : null;

  const isCrystalRoutingCase = fam === "crystal";
  const isCrystalWordingCase = wordingFam === "crystal";
  const isCrystalSpecificSurface = crystalSpec;
  const isGenericSurfaceFallback =
    src === "code_bank_crystal_first" || src === "code_bank_family";
  const isCategoryMismatch = Boolean(catR && catW && catR !== catW);
  const isObjectFamilyMismatch =
    isCrystalRoutingCase && Boolean(wordingFam) && wordingFam !== "crystal";
  const isFallbackHeavy = fbNum != null && fbNum >= 2;

  /** @type {CrystalRoutingWordingMetricsResult} */
  const base = {
    routingWordingAlignmentStatus: ROUTING_WORDING_ALIGNMENT_STATUS.NOT_APPLICABLE,
    routingWordingMismatchType: ROUTING_WORDING_MISMATCH_TYPE.NOT_APPLICABLE,
    routingWordingMismatchSeverity: ROUTING_WORDING_MISMATCH_SEVERITY.NONE,
    routingWordingDashboardGroup: "non_crystal",
    routingCategoryCode: catR,
    wordingCategoryCode: catW,
    energyCategoryCode: catR,
    visibleWordingCategoryUsed: catW,
    routingObjectFamily: fam,
    wordingObjectFamily: wordingFam || null,
    isCrystalRoutingCase,
    isCrystalWordingCase,
    isCrystalSpecificSurface,
    isGenericSurfaceFallback,
    isCategoryMismatch,
    isObjectFamilyMismatch,
    isFallbackHeavy,
    crystalRoutingRuleId: hasCrystalRule ? ruleId : null,
    crystalRoutingStrategy: strategy || null,
    crystalRoutingReason: routingReason || null,
    protectSignalStrength: protect,
    visibleWordingDecisionSource: src || null,
    visibleWordingCrystalSpecific: crystalSpec,
    visibleWordingFallbackLevel: fbNum,
    dashboardMetricVersion: DASHBOARD_METRIC_VERSION,
  };

  if (!isCrystalRoutingCase) {
    return base;
  }

  base.routingWordingDashboardGroup = "crystal_unclassified";

  if (hasCrystalRule && !catW) {
    return {
      ...base,
      routingWordingAlignmentStatus: ROUTING_WORDING_ALIGNMENT_STATUS.HARD_MISMATCH,
      routingWordingMismatchType:
        ROUTING_WORDING_MISMATCH_TYPE.ROUTING_MISSING_WORDING_META,
      routingWordingMismatchSeverity: ROUTING_WORDING_MISMATCH_SEVERITY.MEDIUM,
      routingWordingDashboardGroup: "crystal_meta_gap",
    };
  }

  if (!hasCrystalRule && Boolean(catR)) {
    return {
      ...base,
      routingWordingAlignmentStatus: ROUTING_WORDING_ALIGNMENT_STATUS.SOFT_MISMATCH,
      routingWordingMismatchType:
        ROUTING_WORDING_MISMATCH_TYPE.WORDING_MISSING_ROUTING_META,
      routingWordingMismatchSeverity: ROUTING_WORDING_MISMATCH_SEVERITY.LOW,
      routingWordingDashboardGroup: "crystal_meta_gap",
    };
  }

  if (isObjectFamilyMismatch) {
    return {
      ...base,
      routingWordingAlignmentStatus: ROUTING_WORDING_ALIGNMENT_STATUS.HARD_MISMATCH,
      routingWordingMismatchType:
        ROUTING_WORDING_MISMATCH_TYPE.OBJECT_FAMILY_MISMATCH,
      routingWordingMismatchSeverity: ROUTING_WORDING_MISMATCH_SEVERITY.HIGH,
      routingWordingDashboardGroup: "crystal_hard_mismatch",
    };
  }

  if (isCategoryMismatch) {
    return {
      ...base,
      routingWordingAlignmentStatus: ROUTING_WORDING_ALIGNMENT_STATUS.HARD_MISMATCH,
      routingWordingMismatchType: ROUTING_WORDING_MISMATCH_TYPE.CATEGORY_MISMATCH,
      routingWordingMismatchSeverity: ROUTING_WORDING_MISMATCH_SEVERITY.HIGH,
      routingWordingDashboardGroup: "crystal_hard_mismatch",
    };
  }

  if (isFallbackHeavy && (src === "db_crystal" || src === "db_family")) {
    return {
      ...base,
      routingWordingAlignmentStatus: ROUTING_WORDING_ALIGNMENT_STATUS.SOFT_MISMATCH,
      routingWordingMismatchType: ROUTING_WORDING_MISMATCH_TYPE.FALLBACK_OVERUSE,
      routingWordingMismatchSeverity: ROUTING_WORDING_MISMATCH_SEVERITY.MEDIUM,
      routingWordingDashboardGroup: "crystal_soft_mismatch",
    };
  }

  const catsOk = Boolean(catR && catW && catR === catW);

  if (hasCrystalRule && catsOk && !wordingFam) {
    return {
      ...base,
      routingWordingAlignmentStatus: ROUTING_WORDING_ALIGNMENT_STATUS.HARD_MISMATCH,
      routingWordingMismatchType:
        ROUTING_WORDING_MISMATCH_TYPE.ROUTING_MISSING_WORDING_META,
      routingWordingMismatchSeverity: ROUTING_WORDING_MISMATCH_SEVERITY.MEDIUM,
      routingWordingDashboardGroup: "crystal_meta_gap",
    };
  }

  if (catsOk && wordingFam === "crystal" && hasCrystalRule) {
    if (src === "db_crystal") {
      if (!crystalSpec) {
        return {
          ...base,
          routingWordingAlignmentStatus: ROUTING_WORDING_ALIGNMENT_STATUS.SOFT_MISMATCH,
          routingWordingMismatchType:
            ROUTING_WORDING_MISMATCH_TYPE.CRYSTAL_SPECIFICITY_MISMATCH,
          routingWordingMismatchSeverity: ROUTING_WORDING_MISMATCH_SEVERITY.LOW,
          routingWordingDashboardGroup: "crystal_soft_mismatch",
        };
      }
      return {
        ...base,
        routingWordingAlignmentStatus: ROUTING_WORDING_ALIGNMENT_STATUS.ALIGNED,
        routingWordingMismatchType: ROUTING_WORDING_MISMATCH_TYPE.NONE,
        routingWordingMismatchSeverity: ROUTING_WORDING_MISMATCH_SEVERITY.NONE,
        routingWordingDashboardGroup: "crystal_aligned",
      };
    }
    if (src === "code_bank_crystal_first") {
      if (crystalSpec) {
        return {
          ...base,
          routingWordingAlignmentStatus: ROUTING_WORDING_ALIGNMENT_STATUS.ALIGNED,
          routingWordingMismatchType: ROUTING_WORDING_MISMATCH_TYPE.NONE,
          routingWordingMismatchSeverity: ROUTING_WORDING_MISMATCH_SEVERITY.NONE,
          routingWordingDashboardGroup: "crystal_aligned",
        };
      }
      return {
        ...base,
        routingWordingAlignmentStatus: ROUTING_WORDING_ALIGNMENT_STATUS.SOFT_MISMATCH,
        routingWordingMismatchType:
          ROUTING_WORDING_MISMATCH_TYPE.UNEXPECTED_GENERIC_FALLBACK,
        routingWordingMismatchSeverity: ROUTING_WORDING_MISMATCH_SEVERITY.MEDIUM,
        routingWordingDashboardGroup: "crystal_soft_mismatch",
      };
    }
  }

  if (hasCrystalRule && catsOk && wordingFam === "crystal") {
    return {
      ...base,
      routingWordingAlignmentStatus: ROUTING_WORDING_ALIGNMENT_STATUS.SOFT_MISMATCH,
      routingWordingMismatchType:
        ROUTING_WORDING_MISMATCH_TYPE.CRYSTAL_SPECIFICITY_MISMATCH,
      routingWordingMismatchSeverity: ROUTING_WORDING_MISMATCH_SEVERITY.LOW,
      routingWordingDashboardGroup: "crystal_soft_mismatch",
    };
  }

  return {
    ...base,
    routingWordingAlignmentStatus: ROUTING_WORDING_ALIGNMENT_STATUS.SOFT_MISMATCH,
    routingWordingMismatchType: ROUTING_WORDING_MISMATCH_TYPE.CRYSTAL_SPECIFICITY_MISMATCH,
    routingWordingMismatchSeverity: ROUTING_WORDING_MISMATCH_SEVERITY.LOW,
    routingWordingDashboardGroup: "crystal_soft_mismatch",
  };
}
