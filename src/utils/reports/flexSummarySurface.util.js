/**
 * Short, Flex-only copy: composed complete Thai phrases (see flexSummaryShortCopy.js).
 * Renderer maxLines/lineSpacing are guardrails only — content must already read finished.
 *
 * LINE summary-first bubble prefers DB copy in `buildScanSummaryFirstFlex` → `resolveEnergyCopyForFlex`;
 * this module remains the fallback when DB is unavailable or incomplete, and for stored report payload
 * teaser fields built in `reportPayload.builder`.
 */
import { cleanLine } from "../../services/flex/flex.utils.js";
import {
  composeFlexShortSurface,
  FLEX_SHORT_BULLET_MAX,
  FLEX_SHORT_FIT_MAX,
  FLEX_SHORT_HEADLINE_MAX,
  storedFlexSummaryLooksComplete,
} from "./flexSummaryShortCopy.js";

export const FLEX_SUMMARY_HEADLINE_MAX = FLEX_SHORT_HEADLINE_MAX;
export const FLEX_SUMMARY_FIT_MAX = FLEX_SHORT_FIT_MAX;
export const FLEX_SUMMARY_BULLET_MAX = FLEX_SHORT_BULLET_MAX;

/**
 * @param {object} p
 * @param {object} [p.wording]
 * @param {string} [p.mainEnergyLabel] — drives template pick (same as summary.mainEnergyLabel)
 * @param {string} [p.wordingFamily] — protection | shielding | authority | attraction
 * @param {string} [p.seed] — stable id for rotating variants
 * @param {string} [p.compatibilityReason] — unused for Flex short copy (HTML / full report)
 * @param {string} [p.summaryLine] — unused for Flex short copy
 * @param {string[]} [p.scanTips] — unused for Flex short copy (avoid truncating long tips)
 */
export function buildFlexSummarySurfaceFields({
  wording,
  mainEnergyLabel,
  wordingFamily,
  seed,
  compatibilityReason: _compatibilityReason,
  summaryLine: _summaryLine,
  scanTips: _scanTips,
}) {
  const label =
    String(mainEnergyLabel || wording?.mainEnergy || "").trim() ||
    String(wording?.heroNaming || "").trim();
  const wf = wordingFamily || wording?.wordingFamily;
  const seedFinal = String(seed || wording?.heroNaming || "flex");

  const composed = composeFlexShortSurface({
    mainEnergyLabel: label || "เสริมพลัง",
    wordingFamily: wf,
    seed: seedFinal,
  });

  return {
    headlineShort: composed.headlineShort,
    fitReasonShort: composed.fitReasonShort,
    bulletsShort: composed.bulletsShort.slice(0, 2),
    ctaLabel: "เปิดรายงานฉบับเต็ม",
  };
}

/**
 * @param {import("../../services/reports/reportPayload.types.js").ReportPayload | null} reportPayload
 * @param {unknown} [_parsed]
 */
export function resolveFlexSummarySurfaceForLine(reportPayload, _parsed) {
  const s = reportPayload?.summary;
  if (
    s &&
    storedFlexSummaryLooksComplete({
      headlineShort: s.headlineShort,
      fitReasonShort: s.fitReasonShort,
      bulletsShort: s.bulletsShort,
    })
  ) {
    const headlineShort = cleanLine(String(s.headlineShort || "").trim());
    const fitReasonShort = cleanLine(String(s.fitReasonShort || "").trim());
    const bulletsShort = (Array.isArray(s.bulletsShort) ? s.bulletsShort : [])
      .map((x) => cleanLine(String(x || "")))
      .filter(Boolean)
      .slice(0, 2);
    return {
      headlineShort,
      fitReasonShort,
      bulletsShort,
      ctaLabel: String(s.ctaLabel || "").trim() || "เปิดรายงานฉบับเต็ม",
    };
  }
  return buildFlexSummarySurfaceFields({
    wording: reportPayload?.wording,
    mainEnergyLabel:
      s?.mainEnergyLabel || reportPayload?.wording?.mainEnergy || "",
    wordingFamily: s?.wordingFamily || reportPayload?.wording?.wordingFamily,
    seed: reportPayload?.reportId || reportPayload?.scanId || "flex",
    compatibilityReason: s?.compatibilityReason,
    summaryLine: s?.summaryLine,
    scanTips: s?.scanTips,
  });
}
