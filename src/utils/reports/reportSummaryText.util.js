/**
 * Shared summary-line distillation for HTML report + Flex (same ReportPayload).
 */

/**
 * Prefer first clause before em/en dash; cap length for UI.
 * @param {unknown} raw
 * @returns {string}
 */
export function distillSummaryLine(raw) {
  const t = String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (!t) return "";
  const splitDash = t.split(/\s*[—–]\s*/);
  if (splitDash.length > 1 && splitDash[0].length >= 6) return splitDash[0].trim();
  const firstLine = t.split(/\n/)[0].trim();
  if (firstLine.length <= 108) return firstLine;
  const cut = firstLine.slice(0, 100);
  const sp = cut.lastIndexOf(" ");
  return (sp > 32 ? cut.slice(0, sp) : cut) + "…";
}

/**
 * @param {string} distilled
 * @returns {string}
 */
export function summaryLineDensityClass(distilled) {
  const len = [...String(distilled)].length;
  return len <= 34 ? "summary-line--tight" : "summary-line--roomy";
}
