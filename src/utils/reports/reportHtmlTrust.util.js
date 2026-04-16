/**
 * Shared helpers for public HTML report “trust UX” (meta IDs, scan time, small copy).
 * Keeps templates thin — no backend changes.
 */

import { formatBangkokDateTime } from "../dateTime.util.js";

/**
 * Prefer wall-clock scan instant from compatibility inputs; fallback to payload build time.
 * @param {import("../../services/reports/reportPayload.types.js").ReportPayload | null | undefined} payload
 * @returns {string} ISO-ish string or ""
 */
export function resolveScannedAtIsoForReportMeta(payload) {
  if (!payload || typeof payload !== "object") return "";
  const fromCompat = String(
    payload.compatibility &&
      typeof payload.compatibility === "object" &&
      payload.compatibility.inputs &&
      typeof payload.compatibility.inputs === "object"
      ? /** @type {{ scannedAt?: string }} */ (payload.compatibility.inputs).scannedAt ?? ""
      : "",
  ).trim();
  if (fromCompat) return fromCompat;
  return String(payload.generatedAt || "").trim();
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
  const formatted = formatBangkokDateTime(s);
  return formatted === "-" ? "—" : formatted;
}
