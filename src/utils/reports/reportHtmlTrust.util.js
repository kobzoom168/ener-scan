/**
 * Shared helpers for public HTML report “trust UX” (meta IDs, scan time, small copy).
 * Keeps templates thin — no backend changes.
 */

import { formatBangkokReportMetaDateTime } from "../dateTime.util.js";

/**
 * Report “วันเวลาที่วิเคราะห์” should reflect when the report was produced, not formula/debug scan input.
 * Order: `generatedAt` → hero timestamp → `compatibility.inputs.scannedAt` (last resort).
 * @param {import("../../services/reports/reportPayload.types.js").ReportPayload | null | undefined} payload
 * @param {string} [heroReportGeneratedAt] — e.g. `vm.hero.reportGeneratedAt` when payload omits `generatedAt`
 * @returns {string} ISO-ish string or ""
 */
export function resolveScannedAtIsoForReportMeta(payload, heroReportGeneratedAt) {
  if (!payload || typeof payload !== "object") {
    return String(heroReportGeneratedAt || "").trim();
  }
  const gen = String(payload.generatedAt || "").trim();
  if (gen) return gen;
  const hero = String(heroReportGeneratedAt || "").trim();
  if (hero) return hero;
  return String(
    payload.compatibility &&
      typeof payload.compatibility === "object" &&
      payload.compatibility.inputs &&
      typeof payload.compatibility.inputs === "object"
      ? /** @type {{ scannedAt?: string }} */ (payload.compatibility.inputs).scannedAt ?? ""
      : "",
  ).trim();
}

/**
 * Human-facing report reference: ES- + 8 chars from publicToken (or pass-through ES-*).
 * @param {string | null | undefined} publicToken
 * @param {string | null | undefined} reportId
 * @returns {string}
 */
export function formatEsDisplayReportId(publicToken, reportId) {
  const rid = String(reportId || "").trim();
  if (/^ES-/i.test(rid)) {
    return rid.replace(/^es-/i, "ES-");
  }
  const tok = String(publicToken || "").trim();
  if (!tok) return "ES-────────";
  const alnum = tok.replace(/[^a-zA-Z0-9]/g, "");
  const slice = (alnum + "XXXXXXXX").slice(0, 8).toUpperCase();
  return `ES-${slice}`;
}

/**
 * @param {string | null | undefined} reportVersion
 * @returns {string}
 */
export function formatReportVersionDisplayLine(reportVersion) {
  const v = String(reportVersion || "").trim();
  if (v && v !== "unknown") return `Ener Scan Report v2 · ${v}`;
  return "Ener Scan Report v2";
}

/**
 * Thai-friendly datetime for meta line (Bangkok).
 * @param {string} iso
 * @returns {string}
 */
export function scannedAtLabelThai(iso) {
  const s = String(iso || "").trim();
  if (!s) return "—";
  const formatted = formatBangkokReportMetaDateTime(s);
  return formatted === "-" ? "—" : formatted;
}

/**
 * User-visible meta datetime, or empty string if missing/invalid (caller should omit the row).
 * @param {string} iso
 * @returns {string}
 */
export function formatReportMetaDatetimeOrEmpty(iso) {
  const s = String(iso || "").trim();
  if (!s) return "";
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return "";
  const formatted = formatBangkokReportMetaDateTime(s);
  return formatted === "-" ? "" : formatted;
}
