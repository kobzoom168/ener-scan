import { parseCompatibilityPercent } from "../reports/reportPayload.builder.js";

/**
 * Batch 3: minimal LINE final-result copy (summary + report URL), without full model output.
 *
 * @typedef {Object} LineFinalSummaryFields
 * @property {number|null} energyScore
 * @property {string} mainEnergy
 * @property {number|null} compatibility — 0–100 when present
 * @property {string} headline — short teaser (e.g. summary line)
 */

/**
 * @param {import("../reports/reportPayload.types.js").ReportPayload | null | undefined} reportPayload
 * @param {{ energyScore?: unknown, mainEnergy?: unknown, compatibility?: unknown } | null} [parsed] — optional parseScanResultForHistory shape
 * @returns {LineFinalSummaryFields}
 */
export function extractLineSummaryFields(reportPayload, parsed) {
  const s =
    reportPayload?.summary && typeof reportPayload.summary === "object"
      ? reportPayload.summary
      : {};

  let energyScore =
    typeof s.energyScore === "number" && Number.isFinite(s.energyScore)
      ? s.energyScore
      : null;

  let mainEnergy = "";
  if (typeof s.mainEnergyLabel === "string" && s.mainEnergyLabel.trim()) {
    mainEnergy = s.mainEnergyLabel.trim();
  } else if (parsed?.mainEnergy != null && String(parsed.mainEnergy).trim()) {
    mainEnergy = String(parsed.mainEnergy).trim();
  }

  let compatibility =
    typeof s.compatibilityPercent === "number" &&
    Number.isFinite(s.compatibilityPercent)
      ? s.compatibilityPercent
      : null;

  if (compatibility == null && parsed?.compatibility != null) {
    const raw = parsed.compatibility;
    if (typeof raw === "number" && Number.isFinite(raw)) {
      compatibility = raw > 10 && raw <= 100 ? Math.round(raw) : Math.round(raw * 10);
    } else {
      compatibility = parseCompatibilityPercent(String(raw));
    }
  }

  const headline =
    typeof s.summaryLine === "string" && s.summaryLine.trim()
      ? s.summaryLine.trim().slice(0, 500)
      : "";

  if (energyScore == null && parsed?.energyScore != null) {
    const n = Number(parsed.energyScore);
    if (Number.isFinite(n)) energyScore = n;
  }

  return { energyScore, mainEnergy, compatibility, headline };
}

/**
 * @param {LineFinalSummaryFields & { reportUrl: string }} fields
 * @returns {string}
 */
export function buildSummaryLinkLineText(fields) {
  const { energyScore, mainEnergy, compatibility, headline, reportUrl } = fields;
  const lines = [];
  lines.push("สรุปผลสแกน");

  const scoreStr = energyScore != null ? `${energyScore}/10` : "—";
  const mainStr = mainEnergy || "—";
  lines.push(`• พลังหลัก: ${mainStr} (${scoreStr})`);

  if (compatibility != null && Number.isFinite(compatibility)) {
    lines.push(`• ความเข้ากัน: ${Math.round(compatibility)}%`);
  }

  if (headline) {
    lines.push("");
    lines.push(headline);
  }

  const url = String(reportUrl || "").trim();
  lines.push("");
  if (url) {
    lines.push(`เปิดรายงานเต็ม: ${url}`);
  } else {
    lines.push("เปิดรายงานเต็ม: (ลิงก์ยังไม่พร้อม)");
  }

  return lines.join("\n").slice(0, 4900);
}

/**
 * When `reportPayload` is missing (e.g. public report insert failed) but we still use summary-link mode.
 * @param {string} resultText
 * @param {string} [reportUrl]
 * @returns {string}
 */
export function buildSummaryLinkFallbackText(resultText, reportUrl) {
  const raw = String(resultText || "").trim();
  const snippet = raw
    ? raw
        .split(/\n+/)
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 2)
        .join("\n")
        .slice(0, 400)
    : "";
  const url = String(reportUrl || "").trim();
  const parts = ["สรุปผลสแกน", ""];
  if (snippet) {
    parts.push(snippet.length >= 400 ? `${snippet}…` : snippet);
    parts.push("");
  }
  parts.push(url ? `เปิดรายงานเต็ม: ${url}` : "เปิดรายงานเต็ม: (ลิงก์ยังไม่พร้อม)");
  return parts.join("\n").slice(0, 4900);
}
