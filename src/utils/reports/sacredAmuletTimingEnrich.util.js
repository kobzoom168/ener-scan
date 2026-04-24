/**
 * Sacred amulet timing — enrich or recompute for the public “จังหวะเสริมพลัง” explain page.
 */
import { computeTimingV1 } from "../../services/timing/timingEngine.service.js";
import {
  normalizeBirthdateIso,
  parseIsoYmd,
} from "../compatibilityFormula.util.js";

/**
 * @param {import("../../services/reports/reportPayload.types.js").ReportPayload} payload — normalized
 * @returns {import("../../services/reports/reportPayload.types.js").ReportTimingV1 | null}
 */
export function resolveSacredAmuletTimingForEnergyPage(payload) {
  const existing =
    payload.timingV1 && typeof payload.timingV1 === "object"
      ? payload.timingV1
      : null;
  if (
    existing?.allWeekdayScores?.length === 7 &&
    existing?.allHourScores?.length >= 1
  ) {
    return existing;
  }

  const am = payload.amuletV1;
  const bdIso = normalizeBirthdateIso(String(payload.birthdateUsed || ""));
  if (!am || typeof am !== "object" || Array.isArray(am) || !parseIsoYmd(bdIso)) {
    return existing;
  }

  const compatPct = payload.summary?.compatibilityPercent;
  const summaryEnergy = payload.summary?.energyScore;
  const fit =
    compatPct != null && Number.isFinite(Number(compatPct))
      ? Math.round(Number(compatPct))
      : Math.round(
          Math.min(100, Math.max(0, (Number(summaryEnergy) || 5) * 10)),
        );

  return computeTimingV1({
    birthdateIso: bdIso,
    lane: "sacred_amulet",
    primaryKey: String(am.primaryPower || "").trim() || "protection",
    secondaryKey: String(am.secondaryPower || "").trim() || undefined,
    compatibilityScore:
      compatPct != null && Number.isFinite(Number(compatPct))
        ? Math.round(Number(compatPct))
        : undefined,
    ownerFitScore: fit,
  });
}
