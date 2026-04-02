/**
 * Short, Flex-only copy derived in the report builder (not computed inside Flex UI).
 * Keeps LINE bubbles within safe lengths without ellipsis mid-clause from LINE.
 */
import { cleanLine, safeThaiCut } from "../../services/flex/flex.utils.js";

/** Mobile-first caps (Thai); tune with flex.summaryFirst maxLines */
export const FLEX_SUMMARY_HEADLINE_MAX = 48;
export const FLEX_SUMMARY_FIT_MAX = 72;
export const FLEX_SUMMARY_BULLET_MAX = 44;

/**
 * @param {string} text
 * @param {number} max
 */
function firstSentenceSafe(text, max) {
  const s = cleanLine(text);
  if (!s) return "";
  const cut = s.split(/(?<=[.!?])\s+/)[0] || s;
  return safeThaiCut(cut, max);
}

/**
 * @param {object} p
 * @param {object} [p.wording]
 * @param {string} [p.compatibilityReason]
 * @param {string} [p.summaryLine]
 * @param {string[]} [p.scanTips]
 */
export function buildFlexSummarySurfaceFields({
  wording,
  compatibilityReason,
  summaryLine,
  scanTips,
}) {
  const headlineSrc =
    wording?.flexHeadline || summaryLine || wording?.energyCharacter || "";
  const headlineShort = safeThaiCut(
    cleanLine(String(headlineSrc || "")),
    FLEX_SUMMARY_HEADLINE_MAX,
  );

  const fitSrc =
    compatibilityReason || wording?.lifeTranslation || summaryLine || "";
  const fitReasonShort = firstSentenceSafe(
    String(fitSrc || ""),
    FLEX_SUMMARY_FIT_MAX,
  );

  const rawBullets = [
    ...(Array.isArray(wording?.flexBullets) ? wording.flexBullets : []),
    ...(Array.isArray(scanTips) ? scanTips : []),
  ];
  const bulletsShort = [];
  for (const b of rawBullets) {
    const t = safeThaiCut(cleanLine(String(b || "")), FLEX_SUMMARY_BULLET_MAX);
    if (t && !bulletsShort.includes(t)) bulletsShort.push(t);
    if (bulletsShort.length >= 2) break;
  }
  const pad = safeThaiCut(cleanLine(String(wording?.bestFor || "")), FLEX_SUMMARY_BULLET_MAX);
  if (bulletsShort.length < 2 && pad && !bulletsShort.includes(pad)) {
    bulletsShort.push(pad);
  }
  const fallbacks = [
    "รายละเอียดเชิงลึกอยู่ในรายงานฉบับเต็ม",
    "แตะปุ่มด้านล่างเพื่ออ่านต่อ",
  ];
  let fi = 0;
  while (bulletsShort.length < 2 && fi < fallbacks.length) {
    const t = fallbacks[fi++];
    if (!bulletsShort.includes(t)) bulletsShort.push(t);
  }

  return {
    headlineShort,
    fitReasonShort,
    bulletsShort: bulletsShort.slice(0, 2),
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
    typeof s.headlineShort === "string" &&
    s.headlineShort.trim() &&
    Array.isArray(s.bulletsShort) &&
    s.bulletsShort.filter(Boolean).length >= 1
  ) {
    return {
      headlineShort: s.headlineShort.trim(),
      fitReasonShort: String(s.fitReasonShort || "").trim(),
      bulletsShort: s.bulletsShort
        .map((x) => safeThaiCut(cleanLine(String(x || "")), FLEX_SUMMARY_BULLET_MAX))
        .filter(Boolean)
        .slice(0, 2),
      ctaLabel: String(s.ctaLabel || "").trim() || "เปิดรายงานฉบับเต็ม",
    };
  }
  return buildFlexSummarySurfaceFields({
    wording: reportPayload?.wording,
    compatibilityReason: s?.compatibilityReason,
    summaryLine: s?.summaryLine,
    scanTips: s?.scanTips,
  });
}
