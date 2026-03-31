/**
 * Builds `ReportPayload.compatibility` slice (single source for HTML + Flex headline fields).
 */

import { computeCompatibilityV1 } from "../../utils/compatibilityFormula.util.js";
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
 * @returns {import("../../utils/compatibilityExplain.util.js").CompatibilityComputed & { explain: string[] }}
 */
export function buildCompatibilityPayload(raw) {
  const computed = computeCompatibilityV1({
    birthdate: raw.birthdate,
    scannedAt: raw.scannedAt,
    objectFamily: raw.objectFamily,
    materialFamily: raw.materialFamily,
    shapeFamily: raw.shapeFamily,
    mainEnergy: raw.mainEnergy,
    energyScore: raw.energyScore,
  });

  const explain = buildCompatibilityExplainBullets(computed);

  return {
    score: computed.score,
    band: computed.band,
    formulaVersion: computed.formulaVersion,
    factors: computed.factors,
    inputs: {
      ownerElement: computed.inputs.ownerElement,
      objectElement: computed.inputs.objectElement,
      birthDayRoot: computed.inputs.birthDayRoot,
      sendTimeRoot: computed.inputs.sendTimeRoot,
      lifePath: computed.inputs.lifePath,
      objectFamily: computed.inputs.objectFamily,
      materialFamily: computed.inputs.materialFamily,
      shapeFamily: computed.inputs.shapeFamily,
      mainEnergy: computed.inputs.mainEnergyKey,
      hourBucket: computed.inputs.hourBucket,
    },
    explain,
  };
}
