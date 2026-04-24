/**
 * “คลังพลังของคุณ” — sacred_amulet scans for one LINE user from `scan_results_v2`.
 * Never invents amulet names; ranking uses scores + thumbnails only.
 */
import { listScanResultsV2PayloadRowsForLineUser } from "../../stores/scanV2/scanResultsV2.db.js";
import { normalizeReportPayloadForRender } from "../../utils/reports/reportPayloadNormalize.util.js";
import { formatEsDisplayReportId } from "../../utils/reports/reportHtmlTrust.util.js";
import { computeAmuletOrdAndAlignFromPayload } from "../../amulet/amuletOrdAlign.util.js";
import {
  POWER_LABEL_THAI,
  POWER_ORDER,
} from "../../amulet/amuletScores.util.js";

/** @typedef {import("../../amulet/amuletScores.util.js").AmuletPowerKey} AmuletPowerKey */

/**
 * @typedef {Object} SacredAmuletLibraryItem
 * @property {string} scanResultV2Id
 * @property {string} publicToken
 * @property {string} thumbUrl
 * @property {number} powerTotal
 * @property {string} peakPowerLabelTh
 * @property {number|null} compatPercent
 * @property {string|null} scannedAtIso
 * @property {string} displayReportId
 * @property {string} reportId
 * @property {Record<string, number>} axisScores — keys ตาม `POWER_ORDER`
 */

/**
 * @typedef {Object} SacredAmuletLibraryView
 * @property {number} totalCount
 * @property {SacredAmuletLibraryItem[]} items
 * @property {SacredAmuletLibraryItem[]} byOverall
 * @property {SacredAmuletLibraryItem[]} byLuck
 * @property {SacredAmuletLibraryItem[]} byProtection
 * @property {SacredAmuletLibraryItem[]} byMetta
 * @property {SacredAmuletLibraryItem[]} byBaramee
 * @property {SacredAmuletLibraryItem[]} byFit
 * @property {SacredAmuletLibraryItem|null} topOverall
 */

/**
 * @param {unknown} raw
 * @param {{ id?: string, created_at?: string }} meta
 * @returns {SacredAmuletLibraryItem | null}
 */
export function extractSacredAmuletLibraryItem(raw, meta) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const { payload: norm, warnings } = normalizeReportPayloadForRender(
    /** @type {import("./reportPayload.types.js").ReportPayload} */ (raw),
  );
  if (warnings.length) {
    /* non-fatal */
  }
  const am = norm.amuletV1;
  if (!am || typeof am !== "object" || Array.isArray(am)) return null;

  const tok =
    String(norm.publicToken || "").trim() ||
    String(/** @type {{ publicToken?: string }} */ (raw).publicToken || "").trim();
  if (!tok) return null;

  const reportId = String(norm.reportId || "").trim();

  const es = Number(norm.summary?.energyScore);
  const powerTotal = Number.isFinite(es)
    ? Math.round(Math.min(100, Math.max(0, es * 10)))
    : 0;

  let peakKey = String(am.primaryPower || "").trim() || "protection";
  try {
    const m = computeAmuletOrdAndAlignFromPayload(norm);
    if (m?.objectPeakKey) peakKey = String(m.objectPeakKey);
  } catch {
    /* keep primary */
  }
  const peakPowerLabelTh =
    POWER_LABEL_THAI[/** @type {keyof typeof POWER_LABEL_THAI} */ (peakKey)] ||
    POWER_LABEL_THAI.protection;

  const cp = Number(norm.summary?.compatibilityPercent);
  const compatPercent = Number.isFinite(cp) ? Math.round(Math.min(100, Math.max(0, cp))) : null;

  const img = String(norm.object?.objectImageUrl || "").trim();
  const thumbUrl = /^https?:\/\//i.test(img) ? img : "";

  const scannedAtIso =
    String(meta?.created_at || "").trim() ||
    String(norm.scannedAt || "").trim() ||
    String(norm.generatedAt || "").trim() ||
    null;

  const displayReportId = formatEsDisplayReportId(tok, reportId);

  /** @type {Record<string, number>} */
  const axisScores = {};
  for (const k of POWER_ORDER) {
    const sc = Number(am.powerCategories?.[k]?.score);
    axisScores[k] = Number.isFinite(sc) ? sc : 0;
  }

  return {
    scanResultV2Id: String(meta?.id || "").trim() || "",
    publicToken: tok,
    thumbUrl,
    powerTotal,
    peakPowerLabelTh,
    compatPercent,
    scannedAtIso,
    displayReportId,
    reportId,
    axisScores,
  };
}

/**
 * @param {SacredAmuletLibraryItem[]} items
 * @param {AmuletPowerKey} axis
 */
function sortByAxisScore(items, axis) {
  return [...items].sort((a, b) => {
    const da = Number(a.axisScores?.[axis]) || 0;
    const db = Number(b.axisScores?.[axis]) || 0;
    if (db !== da) return db - da;
    const ta = Date.parse(String(a.scannedAtIso || "")) || 0;
    const tb = Date.parse(String(b.scannedAtIso || "")) || 0;
    return tb - ta;
  });
}

function sortByOverall(items) {
  return [...items].sort((a, b) => {
    if (b.powerTotal !== a.powerTotal) return b.powerTotal - a.powerTotal;
    const ta = Date.parse(String(a.scannedAtIso || "")) || 0;
    const tb = Date.parse(String(b.scannedAtIso || "")) || 0;
    return tb - ta;
  });
}

function sortByFit(items) {
  return [...items].sort((a, b) => {
    const ca = a.compatPercent != null ? a.compatPercent : -1;
    const cb = b.compatPercent != null ? b.compatPercent : -1;
    if (cb !== ca) return cb - ca;
    const ta = Date.parse(String(a.scannedAtIso || "")) || 0;
    const tb = Date.parse(String(b.scannedAtIso || "")) || 0;
    return tb - ta;
  });
}

/**
 * @param {string} lineUserId — LINE `userId` จาก report payload
 * @returns {Promise<SacredAmuletLibraryView|null>}
 */
export async function buildSacredAmuletLibraryForLineUser(lineUserId) {
  const uid = String(lineUserId || "").trim();
  if (!uid) return null;

  const rows = await listScanResultsV2PayloadRowsForLineUser(uid, 100);
  /** @type {SacredAmuletLibraryItem[]} */
  const items = [];
  const seenTok = new Set();

  for (const row of rows) {
    const raw = row?.report_payload_json;
    const meta = { id: row?.id, created_at: row?.created_at };
    const fromRow = extractSacredAmuletLibraryItem(raw, meta);
    if (!fromRow) continue;
    let tok = fromRow.publicToken;
    const alt = String(row?.html_public_token || "").trim();
    if (alt) tok = alt;
    if (seenTok.has(tok)) continue;
    seenTok.add(tok);
    const merged = { ...fromRow, publicToken: tok };
    merged.displayReportId = formatEsDisplayReportId(tok, merged.reportId);
    items.push(merged);
  }

  if (items.length === 0) return null;

  const byOverall = sortByOverall(items);
  const topOverall = byOverall[0] || null;

  return {
    totalCount: items.length,
    items,
    byOverall,
    byLuck: sortByAxisScore(items, "luck"),
    byProtection: sortByAxisScore(items, "protection"),
    byMetta: sortByAxisScore(items, "metta"),
    byBaramee: sortByAxisScore(items, "baramee"),
    byFit: sortByFit(items),
    topOverall,
  };
}

/**
 * When DB history is empty but the current report is amulet (e.g. legacy row), still show one card.
 * @param {import("./reportPayload.types.js").ReportPayload} payload — normalized
 * @returns {SacredAmuletLibraryView | null}
 */
export function buildSacredAmuletLibraryViewFromPayloadOnly(payload) {
  const item = extractSacredAmuletLibraryItem(payload, {
    id: "",
    created_at: String(payload.generatedAt || ""),
  });
  if (!item) return null;
  const items = [item];
  return {
    totalCount: 1,
    items,
    byOverall: items,
    byLuck: items,
    byProtection: items,
    byMetta: items,
    byBaramee: items,
    byFit: items,
    topOverall: item,
  };
}
