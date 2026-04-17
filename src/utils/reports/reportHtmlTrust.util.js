/**
 * Shared helpers for public HTML report “trust UX” (meta IDs, scan time, small copy).
 * Keeps templates thin — no backend changes.
 */

import { formatBangkokReportMetaDateTime } from "../dateTime.util.js";

const PRIMARY_META_MIN_MS = Date.parse("2000-01-01T00:00:00.000Z");
const COMPAT_META_MIN_MS = Date.parse("2018-01-01T00:00:00.000Z");
const REPORT_META_FUTURE_SLACK_MS = 48 * 60 * 60 * 1000;

/**
 * @param {number} ms
 * @param {number} minMs
 * @returns {boolean}
 */
function isPlausibleReportMetaMs(ms, minMs) {
  if (!Number.isFinite(ms)) return false;
  if (ms < minMs) return false;
  if (ms > Date.now() + REPORT_META_FUTURE_SLACK_MS) return false;
  return true;
}

/**
 * Tiers 1–3: `generatedAt`, hero mirror, `payload.scannedAt` — allow older real reports.
 * @param {unknown} v
 * @returns {string} ISO string or ""
 */
function trimToValidReportMetaIso(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const ms = Date.parse(s);
  if (!isPlausibleReportMetaMs(ms, PRIMARY_META_MIN_MS)) return "";
  return s;
}

/**
 * `compatibility.inputs.scannedAt` is the compatibility pipeline’s input clock (formula/debug),
 * not the canonical “report built / analysis shown” instant. Only use when all higher-priority
 * sources are missing or unusable; stricter floor + min length to avoid stale/junk pipeline stamps.
 * @param {string} s
 * @returns {string}
 */
function trimCompatInputsScannedAtLastResort(s) {
  const raw = String(s ?? "").trim();
  if (raw.length < 12) return "";
  const ms = Date.parse(raw);
  if (!isPlausibleReportMetaMs(ms, COMPAT_META_MIN_MS)) return "";
  return raw;
}

/**
 * User-facing “วันเวลาที่วิเคราะห์” on HTML reports: **report build / analysis time** for this artifact,
 * not the compatibility formula’s internal input timestamp (see tier 4).
 *
 * Priority:
 * 1. `payload.generatedAt` — primary SSOT after normalize (report JSON generation / build)
 * 2. `heroReportGeneratedAt` — mirror when templates run on a payload that omitted `generatedAt`
 * 3. `payload.scannedAt` — optional scan/analysis instant when stored at payload top level
 * 4. `payload.compatibility.inputs.scannedAt` — **last resort only**; may lag or reflect pipeline input
 *
 * @param {import("../../services/reports/reportPayload.types.js").ReportPayload | null | undefined} payload
 * @param {string} [heroReportGeneratedAt] — e.g. `vm.hero.reportGeneratedAt` when payload omits `generatedAt`
 * @returns {string} ISO-ish string or ""
 */
export function resolveScannedAtIsoForReportMeta(payload, heroReportGeneratedAt) {
  if (!payload || typeof payload !== "object") {
    return trimToValidReportMetaIso(heroReportGeneratedAt);
  }

  const gen = trimToValidReportMetaIso(payload.generatedAt);
  if (gen) return gen;

  const hero = trimToValidReportMetaIso(heroReportGeneratedAt);
  if (hero) return hero;

  const top = trimToValidReportMetaIso(
    /** @type {{ scannedAt?: string }} */ (payload).scannedAt,
  );
  if (top) return top;

  const rawCompat =
    payload.compatibility &&
    typeof payload.compatibility === "object" &&
    payload.compatibility.inputs &&
    typeof payload.compatibility.inputs === "object"
      ? /** @type {{ scannedAt?: string }} */ (payload.compatibility.inputs).scannedAt ?? ""
      : "";

  return trimCompatInputsScannedAtLastResort(String(rawCompat).trim());
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
 * User-visible meta datetime for the report meta row (`formatBangkokReportMetaDateTime`), or empty if missing/invalid (caller omits the row).
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
