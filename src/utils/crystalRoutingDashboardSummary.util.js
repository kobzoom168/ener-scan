/**
 * Pure aggregation of dashboard rows that mirror `routingWordingMetrics` / log fields.
 * For offline scripts, future reporters, and tests — not wired into request path by default.
 *
 * @module crystalRoutingDashboardSummary.util
 */
import { normalizeObjectFamilyForEnergyCopy } from "./energyCategoryResolve.util.js";
import {
  ROUTING_WORDING_ALIGNMENT_STATUS,
  ROUTING_WORDING_MISMATCH_TYPE,
} from "./crystalRoutingWordingMetrics.util.js";

export const CRYSTAL_DASHBOARD_SUMMARY_VERSION = "1";

const WEAK_PROTECT_DEFAULT_RULE = "crystal_rg_weak_protect_default";

/**
 * @typedef {Object} CrystalRoutingDashboardRow
 * @property {string} [routingWordingAlignmentStatus]
 * @property {string} [routingWordingMismatchType]
 * @property {string} [routingWordingMismatchSeverity]
 * @property {boolean} [isCrystalRoutingCase]
 * @property {string} [routingObjectFamily]
 * @property {string} [objectFamily] — alias; normalized if `isCrystalRoutingCase` omitted
 * @property {boolean} [visibleWordingCrystalSpecific]
 * @property {string|null} [visibleWordingDecisionSource]
 * @property {boolean} [isFallbackHeavy]
 * @property {number|null} [visibleWordingFallbackLevel]
 * @property {string|null} [crystalRoutingRuleId]
 * @property {string|null} [crystalRoutingStrategy]
 */

/**
 * @typedef {Object} CrystalRoutingDashboardSummary
 * @property {string} summaryVersion
 * @property {number} rowCount — input length
 * @property {number} totalCrystalRoutingCases — denominator for crystal-only rates
 * @property {number} notApplicableCount — non-crystal rows (excluded from crystal rates)
 * @property {number} alignedCount
 * @property {number} softMismatchCount
 * @property {number} hardMismatchCount
 * @property {number} crystalSpecificSurfaceCount
 * @property {number} crystalSpecificSurfaceRate — 0..1
 * @property {number} genericFallbackCount — code_bank_* decision sources on crystal rows
 * @property {number} genericFallbackRate — 0..1
 * @property {number} fallbackHeavyCount
 * @property {number} fallbackHeavyRate — 0..1 among crystal rows
 * @property {number} weakProtectDefaultCount
 * @property {number} weakProtectDefaultRate — share among all crystal rows (0..1)
 * @property {{ mismatchType: string, count: number }[]} topMismatchTypes — deterministic sort
 * @property {{ ruleId: string, count: number }[]} topRoutingRuleIds — deterministic sort; "(none)" bucket
 */

/**
 * @param {CrystalRoutingDashboardRow[]} rows
 * @returns {CrystalRoutingDashboardSummary}
 */
export function aggregateCrystalRoutingDashboardSummary(rows) {
  const list = Array.isArray(rows) ? rows : [];

  function crystalCase(row) {
    if (typeof row.isCrystalRoutingCase === "boolean") {
      return row.isCrystalRoutingCase;
    }
    const fam = String(row.routingObjectFamily ?? row.objectFamily ?? "");
    return normalizeObjectFamilyForEnergyCopy(fam) === "crystal";
  }

  function alignment(row) {
    return String(row.routingWordingAlignmentStatus || "").trim();
  }

  function mismatchType(row) {
    return String(row.routingWordingMismatchType || "").trim();
  }

  function ruleId(row) {
    const r = row.crystalRoutingRuleId;
    if (r == null || String(r).trim() === "") return null;
    return String(r).trim();
  }

  function decisionSource(row) {
    return String(row.visibleWordingDecisionSource || "").trim();
  }

  function fallbackHeavy(row) {
    if (row.isFallbackHeavy === true) return true;
    const fb = row.visibleWordingFallbackLevel;
    return fb != null && Number.isFinite(Number(fb)) && Number(fb) >= 2;
  }

  function genericCodeSource(row) {
    const s = decisionSource(row);
    return s === "code_bank_crystal_first" || s === "code_bank_family";
  }

  let totalCrystalRoutingCases = 0;
  let notApplicableCount = 0;
  let alignedCount = 0;
  let softMismatchCount = 0;
  let hardMismatchCount = 0;
  let crystalSpecificSurfaceCount = 0;
  let genericFallbackCount = 0;
  let fallbackHeavyCount = 0;
  let weakProtectDefaultCount = 0;

  /** @type {Record<string, number>} */
  const mismatchTypeCounts = {};
  /** @type {Record<string, number>} */
  const ruleIdCounts = {};

  for (const row of list) {
    const isCrystal = crystalCase(row);
    if (!isCrystal) {
      notApplicableCount += 1;
      continue;
    }

    totalCrystalRoutingCases += 1;

    const a = alignment(row);
    if (a === ROUTING_WORDING_ALIGNMENT_STATUS.ALIGNED) alignedCount += 1;
    else if (a === ROUTING_WORDING_ALIGNMENT_STATUS.SOFT_MISMATCH) softMismatchCount += 1;
    else if (a === ROUTING_WORDING_ALIGNMENT_STATUS.HARD_MISMATCH) hardMismatchCount += 1;

    if (row.visibleWordingCrystalSpecific === true) {
      crystalSpecificSurfaceCount += 1;
    }

    if (genericCodeSource(row)) {
      genericFallbackCount += 1;
    }

    if (fallbackHeavy(row)) {
      fallbackHeavyCount += 1;
    }

    if (ruleId(row) === WEAK_PROTECT_DEFAULT_RULE) {
      weakProtectDefaultCount += 1;
    }

    const mt = mismatchType(row);
    if (mt && mt !== ROUTING_WORDING_MISMATCH_TYPE.NONE) {
      mismatchTypeCounts[mt] = (mismatchTypeCounts[mt] || 0) + 1;
    }

    const rid = ruleId(row);
    const key = rid ?? "(none)";
    ruleIdCounts[key] = (ruleIdCounts[key] || 0) + 1;
  }

  const denom = totalCrystalRoutingCases;
  const rate = (n) => (denom > 0 ? n / denom : 0);

  const topMismatchTypes = Object.entries(mismatchTypeCounts)
    .map(([mismatchType, count]) => ({ mismatchType, count }))
    .sort((x, y) => y.count - x.count || x.mismatchType.localeCompare(y.mismatchType));

  const topRoutingRuleIds = Object.entries(ruleIdCounts)
    .map(([ruleId, count]) => ({ ruleId, count }))
    .sort((x, y) => y.count - x.count || x.ruleId.localeCompare(y.ruleId));

  return {
    summaryVersion: CRYSTAL_DASHBOARD_SUMMARY_VERSION,
    rowCount: list.length,
    totalCrystalRoutingCases,
    notApplicableCount,
    alignedCount,
    softMismatchCount,
    hardMismatchCount,
    crystalSpecificSurfaceCount,
    crystalSpecificSurfaceRate: rate(crystalSpecificSurfaceCount),
    genericFallbackCount,
    genericFallbackRate: rate(genericFallbackCount),
    fallbackHeavyCount,
    fallbackHeavyRate: rate(fallbackHeavyCount),
    weakProtectDefaultCount,
    weakProtectDefaultRate: rate(weakProtectDefaultCount),
    topMismatchTypes,
    topRoutingRuleIds,
  };
}
