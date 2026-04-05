/**
 * Same main-energy inference shape as {@link buildReportPayloadFromScan} (crystal path).
 * Used by staging verification scripts (no DB).
 */
import { parseScanText } from "../../src/services/flex/flex.parser.js";
import { deriveReportWordingFromParsed } from "../../src/services/reports/reportWording.derive.js";
import {
  inferEnergyCategoryCodeFromMainEnergy,
  inferEnergyCategoryInferenceTrace,
  normalizeObjectFamilyForEnergyCopy,
} from "../../src/utils/energyCategoryResolve.util.js";
/** Same logic as `parseCompatibilityPercent` in reportPayload.builder (avoid importing full builder). */
function parseCompatibilityPercent(raw) {
  const s = String(raw || "").trim();
  if (!s || s === "-") return null;
  const matches = s.match(/(\d+(?:\.\d+)?)/g);
  if (!matches?.length) return null;
  for (const m of matches) {
    const n = Number(m);
    if (!Number.isFinite(n)) continue;
    if (n >= 0 && n <= 10) return Math.round(n * 10);
    if (n > 10 && n <= 100) return Math.round(n);
  }
  const n = Number(matches[0]);
  if (!Number.isFinite(n)) return null;
  if (n >= 0 && n <= 10) return Math.round(n * 10);
  if (n <= 100) return Math.round(n);
  return null;
}

/**
 * @param {string} resultText
 * @param {string} [objectFamilyOpt]
 * @returns {object}
 */
export function mirrorMainEnergyInferenceLikeBuilder(resultText, objectFamilyOpt = "crystal") {
  const parsed = parseScanText(String(resultText || ""));
  const compatPct = parseCompatibilityPercent(parsed.compatibility);
  const wording = deriveReportWordingFromParsed(parsed, {
    seed: "staging-crystal-verify",
    energyScore: null,
    compatibilityPercent: compatPct,
    objectFamily: objectFamilyOpt,
  });

  const mainEnergyLabelForCategory = wording.mainEnergy
    ? String(wording.mainEnergy)
    : parsed.mainEnergy && parsed.mainEnergy !== "-"
      ? String(parsed.mainEnergy)
      : "";

  const mainEnergyRawForCrystalMode =
    parsed.mainEnergy && parsed.mainEnergy !== "-"
      ? String(parsed.mainEnergy).replace(/\s+/g, " ").trim()
      : mainEnergyLabelForCategory;

  const famNorm = normalizeObjectFamilyForEnergyCopy(String(objectFamilyOpt || ""));
  const mainEnergyForCategoryInference =
    famNorm === "crystal" && mainEnergyRawForCrystalMode
      ? mainEnergyRawForCrystalMode
      : mainEnergyLabelForCategory;

  const energyCategoryCode = inferEnergyCategoryCodeFromMainEnergy(
    mainEnergyForCategoryInference,
    String(objectFamilyOpt || ""),
  );
  const trace = inferEnergyCategoryInferenceTrace(
    mainEnergyForCategoryInference,
    String(objectFamilyOpt || ""),
  );

  return {
    event: "REPORT_PAYLOAD_MAIN_ENERGY_INFERENCE",
    objectFamily: String(objectFamilyOpt || "").slice(0, 48),
    parsedMainEnergyRaw: String(mainEnergyForCategoryInference || "").slice(0, 160),
    mainEnergySource: parsed.mainEnergyResolution?.source ?? "missing",
    resolveEnergyTypeResult: trace.resolveEnergyTypeResult,
    protectKeywordMatched: trace.protectKeywordMatched,
    protectWeakKeywordMatched: trace.protectWeakKeywordMatched,
    protectSignalStrength: trace.protectSignalStrength,
    energyTypeResolverMode: trace.energyTypeResolverMode,
    energyTypeResolverFamily: trace.energyTypeResolverFamily,
    resolvedEnergyTypeBeforeCategoryMap: trace.resolvedEnergyTypeBeforeCategoryMap,
    crystalWeakProtectOutcome: trace.crystalWeakProtectOutcome ?? undefined,
    crystalNonProtectRoutingReason: trace.crystalNonProtectRoutingReason,
    crystalPostResolverCategoryDecision: trace.crystalPostResolverCategoryDecision,
    crystalRoutingRuleId: trace.crystalRoutingRuleId,
    crystalRoutingReason: trace.crystalRoutingReason,
    crystalRoutingStrategy: trace.crystalRoutingStrategy,
    energyCategoryInferenceBranch: trace.inferenceBranch,
    energyCategoryCode,
  };
}
