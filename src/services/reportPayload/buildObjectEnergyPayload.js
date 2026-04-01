/**
 * Builds `ReportPayload.objectEnergy` (single source for stars + HTML copy).
 */

import { computeObjectEnergyV1 } from "../../utils/objectEnergyFormula.util.js";
import { buildObjectEnergyExplainBullets } from "../../utils/objectEnergyExplain.util.js";

/**
 * @param {object} raw
 * @param {string} [raw.objectFamily]
 * @param {string} [raw.materialFamily]
 * @param {string} [raw.dominantColor]
 * @param {string} [raw.conditionClass]
 * @param {string} [raw.shapeFamily]
 * @param {number} [raw.energyScore]
 * @param {string} [raw.mainEnergy]
 * @param {string} [raw.objectCheckResult]
 * @param {number} [raw.objectCheckConfidence]
 */
export function buildObjectEnergyPayload(raw) {
  const computed = computeObjectEnergyV1({
    objectFamily: raw.objectFamily,
    materialFamily: raw.materialFamily,
    dominantColor: raw.dominantColor,
    conditionClass: raw.conditionClass,
    shapeFamily: raw.shapeFamily,
    energyScore: raw.energyScore,
    mainEnergy: raw.mainEnergy,
    objectCheckResult: raw.objectCheckResult,
    objectCheckConfidence: raw.objectCheckConfidence,
  });

  const rawCheck = String(raw.objectCheckResult || "").trim().toLowerCase();
  const internalOnly = new Set([
    "single_supported",
    "multiple",
    "unclear",
    "unsupported",
  ]);
  const checkHint =
    raw.objectCheckResult != null &&
    String(raw.objectCheckResult).trim().length > 0 &&
    !internalOnly.has(rawCheck)
      ? `หมายเหตุจากการตรวจวัตถุ: ${String(raw.objectCheckResult).trim().slice(0, 120)}`
      : "";

  const explain = buildObjectEnergyExplainBullets(
    computed.profile,
    computed.stars,
    computed.mainEnergyResolved,
    computed.confidence,
    checkHint ? [checkHint] : [],
  );

  return {
    formulaVersion: computed.formulaVersion,
    profile: computed.profile,
    stars: computed.stars,
    mainEnergyResolved: computed.mainEnergyResolved,
    confidence: computed.confidence,
    inputs: computed.inputs,
    explain,
  };
}
