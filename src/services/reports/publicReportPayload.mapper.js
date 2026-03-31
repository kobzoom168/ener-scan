/**
 * Maps legacy ReportPayload to the public HTTP JSON shape (summary/sections
 * aligned with ReportPayloadV1 slices).
 *
 * @param {object} opts
 * @param {string|null} [opts.publicationId]
 * @param {string} opts.scanResultId — prefer scan_results_v2.id when known
 * @param {import("./reportPayload.types.js").ReportPayload} opts.payload
 */
export function mapLegacyReportPayloadToPublicReportView({
  publicationId = null,
  scanResultId,
  payload,
}) {
  const s =
    payload?.summary && typeof payload.summary === "object"
      ? payload.summary
      : {};
  const sec =
    payload?.sections && typeof payload.sections === "object"
      ? payload.sections
      : {};
  const obj =
    payload?.object && typeof payload.object === "object" ? payload.object : {};

  const joinLines = (arr) => {
    if (!Array.isArray(arr)) return "";
    return arr.map((x) => String(x || "").trim()).filter(Boolean).join("\n");
  };

  const headline =
    typeof s.summaryLine === "string" && s.summaryLine.trim()
      ? s.summaryLine.trim()
      : "";
  const bullets = Array.isArray(s.scanTips)
    ? s.scanTips.map((x) => String(x || "").trim()).filter(Boolean)
    : [];

  return {
    publicationId: publicationId ? String(publicationId) : null,
    scanResultId: String(scanResultId || "").trim(),
    generatedAt:
      typeof payload?.generatedAt === "string" && payload.generatedAt
        ? payload.generatedAt
        : new Date().toISOString(),
    summary: {
      energyScore:
        typeof s.energyScore === "number" && Number.isFinite(s.energyScore)
          ? s.energyScore
          : null,
      mainEnergy:
        typeof s.mainEnergyLabel === "string" ? s.mainEnergyLabel : null,
      compatibility:
        typeof s.compatibilityPercent === "number" &&
        Number.isFinite(s.compatibilityPercent)
          ? s.compatibilityPercent
          : null,
      headline: headline || undefined,
      bulletPoints: bullets.length ? bullets : undefined,
      teaserText: headline || undefined,
    },
    sections: {
      energyProfile: joinLines(sec.messagePoints) || undefined,
      ownerFit: joinLines(sec.ownerMatchReason) || undefined,
      strengths: joinLines(sec.whatItGives) || undefined,
      cautions: joinLines(sec.weakMoments) || undefined,
      suitableUseCases: joinLines(sec.bestUseCases) || undefined,
      hiddenEnergy:
        typeof sec.roleDescription === "string" && sec.roleDescription.trim()
          ? sec.roleDescription.trim()
          : undefined,
      interpretationNotes: joinLines(sec.guidanceTips) || undefined,
    },
    objectImageUrl:
      typeof obj.objectImageUrl === "string" && obj.objectImageUrl.trim()
        ? obj.objectImageUrl.trim()
        : undefined,
    objectEnergy:
      payload?.objectEnergy &&
      typeof payload.objectEnergy === "object" &&
      !Array.isArray(payload.objectEnergy)
        ? payload.objectEnergy
        : undefined,
  };
}
