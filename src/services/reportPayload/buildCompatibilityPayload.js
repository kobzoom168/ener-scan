/**
 * Builds `ReportPayload.compatibility` slice (single source for HTML + Flex headline fields).
 */

import { computeCompatibilityV1Stable } from "../../utils/compatibilityFormula.util.js";
import { buildCompatibilityExplainBullets } from "../../utils/compatibilityExplain.util.js";

/**
 * @param {object} raw
 * @param {string} raw.birthdate — YYYY-MM-DD
 * @param {string} raw.scannedAt — ISO 8601
 * @param {string} [raw.objectFamily]
 * @param {string} [raw.materialFamily]
 * @param {string} [raw.shapeFamily]
 * @param {string} [raw.mainEnergy] — Thai or English
 * @param {number} [raw.energyScore]
 * @param {string} [raw.dominantColor] — pipeline slug (optional; widens stable fingerprint when set)
 * @param {string} [raw.objectCategory] — pipeline label (optional)
 * @param {string} [raw.conditionClass] — pipeline slug (optional)
 * @returns {import("../../utils/compatibilityExplain.util.js").CompatibilityComputed & { explain: string[] }}
 */
export function buildCompatibilityPayload(raw) {
  const computed = computeCompatibilityV1Stable({
    birthdate: raw.birthdate,
    scannedAt: raw.scannedAt,
    objectFamily: raw.objectFamily,
    materialFamily: raw.materialFamily,
    shapeFamily: raw.shapeFamily,
    mainEnergy: raw.mainEnergy,
    energyScore: raw.energyScore,
    dominantColor: raw.dominantColor,
    objectCategory: raw.objectCategory,
    conditionClass: raw.conditionClass,
  });

  const explain = buildCompatibilityExplainBullets(computed);

  return {
    score: computed.score,
    band: computed.band,
    formulaVersion: computed.formulaVersion,
    factors: computed.factors,
    inputs: { ...computed.inputs },
    explain,
  };
}
