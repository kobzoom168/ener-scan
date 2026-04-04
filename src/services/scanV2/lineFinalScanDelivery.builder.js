import { parseCompatibilityPercent } from "../reports/reportPayload.builder.js";
import { env } from "../../config/env.js";

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

  let headline = "";
  if (
    env.LINE_SUMMARY_USE_FLEX_TEASER_FIELDS &&
    typeof s.headlineShort === "string" &&
    String(s.headlineShort).trim()
  ) {
    const hs = String(s.headlineShort).trim();
    const fr =
      typeof s.fitReasonShort === "string" && String(s.fitReasonShort).trim()
        ? String(s.fitReasonShort).trim().slice(0, 120)
        : "";
    headline = fr ? `${hs} — ${fr}` : hs;
    headline = headline.slice(0, 500);
  }
  if (!headline) {
    headline =
      typeof s.summaryLine === "string" && s.summaryLine.trim()
        ? s.summaryLine.trim().slice(0, 500)
        : "";
  }

  if (energyScore == null && parsed?.energyScore != null) {
    const n = Number(parsed.energyScore);
    if (Number.isFinite(n)) energyScore = n;
  }

  return { energyScore, mainEnergy, compatibility, headline };
}

/**
 * CTA block: label line + URL on next line (LINE text cannot hide URL, only structure).
 * @param {string} reportUrl
 * @returns {string}
 */
export function buildLineSummaryCtaText(reportUrl) {
  const url = String(reportUrl || "").trim();
  if (!url) {
    return "เปิดรายงานฉบับเต็ม — ลิงก์ยังไม่พร้อม";
  }
  return `เปิดรายงานฉบับเต็ม\n${url}`;
}

/**
 * Compact plain-text summary for push fallback (not the HTML report body).
 *
 * @param {object} p
 * @param {number|null} [p.energyScore]
 * @param {string} [p.mainEnergy]
 * @param {number|null} [p.compatibility]
 * @param {string} [p.reportUrl]
 * @param {{ opening?: string, fitLine?: string } | null} [p.lineWording] — LINE-only bank; preferred over raw headline
 * @param {string} [p.headline] — fallback one-liner when lineWording missing
 * @returns {string}
 */
export function buildLineSummaryText(p) {
  const {
    energyScore,
    mainEnergy,
    compatibility,
    reportUrl,
    lineWording,
    headline,
  } = p;
  const scoreStr = energyScore != null ? `${energyScore}/10` : "—";
  const mainShort = String(mainEnergy || "—")
    .replace(/\s+/g, " ")
    .trim();
  const lines = [];
  lines.push("สรุปผลสแกน — พร้อมอ่านรายงานฉบับเต็มแล้ว");
  lines.push("");
  lines.push(`• พลังหลัก: ${mainShort} · ${scoreStr}`);
  if (compatibility != null && Number.isFinite(compatibility)) {
    lines.push(`• เข้ากัน: ${Math.round(compatibility)}%`);
  }

  const opening = lineWording?.opening ? String(lineWording.opening).trim() : "";
  const fit = lineWording?.fitLine ? String(lineWording.fitLine).trim() : "";
  if (opening || fit) {
    lines.push("");
    if (opening) lines.push(opening);
    if (fit) lines.push(fit);
  } else {
    const h = String(headline || "").trim();
    if (h) {
      lines.push("");
      lines.push(h.length > 140 ? `${h.slice(0, 137)}…` : h);
    }
  }

  lines.push("");
  lines.push("────────");
  lines.push(buildLineSummaryCtaText(reportUrl || ""));
  return lines.join("\n").slice(0, 4900);
}

/**
 * @param {LineFinalSummaryFields & { reportUrl: string, lineWording?: { opening?: string, fitLine?: string } | null }} fields
 * @returns {string}
 */
export function buildSummaryLinkLineText(fields) {
  return buildLineSummaryText({
    energyScore: fields.energyScore,
    mainEnergy: fields.mainEnergy,
    compatibility: fields.compatibility,
    reportUrl: fields.reportUrl,
    lineWording: fields.lineWording ?? null,
    headline: fields.headline,
  });
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
        .slice(0, 320)
    : "";
  const url = String(reportUrl || "").trim();
  const parts = ["สรุปผลสแกน — ฉบับย่อ", ""];
  if (snippet) {
    parts.push(snippet.length >= 320 ? `${snippet}…` : snippet);
    parts.push("");
  }
  parts.push("────────");
  parts.push(buildLineSummaryCtaText(url));
  return parts.join("\n").slice(0, 4900);
}
