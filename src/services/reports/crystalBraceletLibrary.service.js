/**
 * "คลังกำไลของคุณ" — crystal_bracelet scans for one LINE user from `scan_results_v2`,
 * the bracelet-lane counterpart of sacredAmuletLibrary (per กบ: reports for amulets
 * have a look-back library; bracelets must too). Lean version: photo history rows
 * that link back to each scan's own public report — no separate ranking page.
 */
import { listScanResultsV2PayloadRowsForLineUser } from "../../stores/scanV2/scanResultsV2.db.js";
import { normalizeReportPayloadForRender } from "../../utils/reports/reportPayloadNormalize.util.js";
import {
  CRYSTAL_BRACELET_AXIS_ORDER,
  CRYSTAL_BRACELET_AXIS_LABEL_THAI,
} from "../../crystalBracelet/crystalBraceletScores.util.js";

/**
 * @typedef {Object} CrystalBraceletLibraryItem
 * @property {string} scanResultV2Id
 * @property {string} publicToken
 * @property {string} thumbUrl
 * @property {number} powerScore — คะแนนพลัง (0-10 scale, from the report)
 * @property {string} peakAxisKey
 * @property {string} peakAxisLabelTh
 * @property {number|null} fitPercent
 * @property {string|null} scannedAtIso
 * @property {Record<string, number>} axisScores
 * @property {number} scanCountInGroup
 * @property {string} groupKey
 */

/**
 * @typedef {Object} CrystalBraceletAxisHighlight
 * @property {string} axis
 * @property {string} labelTh
 * @property {number} axisScore
 * @property {CrystalBraceletLibraryItem} item
 */

/**
 * @typedef {Object} CrystalBraceletLibraryView
 * @property {number} totalCount — distinct bracelets (grouped)
 * @property {number} scanCount — raw bracelet scans seen
 * @property {CrystalBraceletLibraryItem[]} items — newest first
 * @property {CrystalBraceletLibraryItem[]} byOverall — powerScore desc
 * @property {CrystalBraceletLibraryItem|null} topOverall
 * @property {CrystalBraceletAxisHighlight[]} axisHighlights — best bracelet per axis
 */

/**
 * One highlight per bracelet = the SINGLE axis that bracelet is strongest in
 * (per กบ: show each เส้น only at its standout power, not every axis repeated).
 * 2 bracelets → 2 cards; sorted by that peak-axis score, highest first.
 * @param {CrystalBraceletLibraryItem[]} items
 * @returns {CrystalBraceletAxisHighlight[]}
 */
function pickCrystalBraceletAxisHighlights(items) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const out = [];
  for (const item of items) {
    let bestAxis = null;
    let bestScore = 0;
    for (const axis of CRYSTAL_BRACELET_AXIS_ORDER) {
      const s = Number(item.axisScores?.[axis]) || 0;
      if (s > bestScore) {
        bestScore = s;
        bestAxis = axis;
      }
    }
    if (!bestAxis) continue;
    out.push({
      axis: bestAxis,
      labelTh: CRYSTAL_BRACELET_AXIS_LABEL_THAI[bestAxis] || bestAxis,
      axisScore: Math.round(bestScore * 10) / 10,
      item,
    });
  }
  out.sort((a, b) => b.axisScore - a.axisScore);
  return out;
}

function axisScoreOf(axes, key) {
  const v = axes?.[key];
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = Number(v.score ?? v.value);
  return Number.isFinite(s) ? s : 0;
}

/**
 * @param {Record<string, unknown>} norm — normalized report payload
 * @param {{ id?: string, created_at?: string, html_public_token?: string|null }} row
 * @returns {CrystalBraceletLibraryItem|null}
 */
function buildItemFromNormalizedPayload(norm, row = {}) {
  const cb = norm?.crystalBraceletV1;
  if (!cb || typeof cb !== "object" || Array.isArray(cb)) return null;

  const axes = cb.axes && typeof cb.axes === "object" ? cb.axes : {};
  /** @type {Record<string, number>} */
  const axisScores = {};
  for (const k of CRYSTAL_BRACELET_AXIS_ORDER) {
    axisScores[k] = axisScoreOf(axes, k);
  }

  let peakAxisKey = String(cb.primaryAxis || "").trim();
  if (!CRYSTAL_BRACELET_AXIS_ORDER.includes(peakAxisKey)) {
    peakAxisKey = CRYSTAL_BRACELET_AXIS_ORDER.reduce((best, k) =>
      axisScores[k] > axisScores[best] ? k : best,
    CRYSTAL_BRACELET_AXIS_ORDER[0]);
  }

  const rawScore = Number(
    cb.energyScore ??
      cb.score ??
      cb.htmlReport?.energyScore ??
      norm?.summary?.energyScore ??
      NaN,
  );
  const avgAxis =
    CRYSTAL_BRACELET_AXIS_ORDER.reduce((s, k) => s + axisScores[k], 0) /
    Math.max(1, CRYSTAL_BRACELET_AXIS_ORDER.length);
  // Overall power is the /10 energy score; the per-axis scores are /100 (radar).
  // Fallback: derive a /10 figure from the /100 axis average (avoid the 64.5/10 bug).
  const powerScore = Number.isFinite(rawScore)
    ? Math.round(rawScore * 10) / 10
    : Math.round(avgAxis) / 10;

  const fitRaw = Number(cb.ownerFit?.score);
  const fitPercent = Number.isFinite(fitRaw) ? Math.round(fitRaw) : null;

  const groupKey =
    String(norm.stableFeatureSeed || "").trim() ||
    String(norm.diagnostics?.stableFeatureSeed || "").trim() ||
    String(row.html_public_token || norm.reportId || row.id || "").trim();

  return {
    scanResultV2Id: String(row.id || ""),
    publicToken: String(row.html_public_token || "").trim(),
    thumbUrl: String(norm.object?.objectImageUrl || "").trim(),
    powerScore,
    peakAxisKey,
    peakAxisLabelTh:
      CRYSTAL_BRACELET_AXIS_LABEL_THAI[peakAxisKey] || peakAxisKey,
    fitPercent,
    scannedAtIso: row.created_at ? String(row.created_at) : null,
    axisScores,
    scanCountInGroup: 1,
    groupKey,
  };
}

/**
 * @param {string} lineUserId
 * @param {{ maxRows?: number, maxItems?: number }} [opts]
 * @returns {Promise<CrystalBraceletLibraryView>}
 */
export async function buildCrystalBraceletLibraryForLineUser(
  lineUserId,
  { maxRows = 80, maxItems = 12 } = {},
) {
  const rows = await listScanResultsV2PayloadRowsForLineUser(lineUserId, maxRows);
  /** @type {Map<string, CrystalBraceletLibraryItem>} */
  const groups = new Map();
  let scanCount = 0;

  for (const row of rows) {
    let norm = null;
    try {
      norm = normalizeReportPayloadForRender(row?.report_payload_json).payload;
    } catch {
      continue;
    }
    const item = buildItemFromNormalizedPayload(norm, row);
    if (!item) continue;
    scanCount += 1;
    const existing = groups.get(item.groupKey);
    if (existing) {
      existing.scanCountInGroup += 1; // rows are newest-first; keep the newest
    } else if (groups.size < maxItems) {
      groups.set(item.groupKey, item);
    }
  }

  const items = Array.from(groups.values());
  const byOverall = [...items].sort((a, b) => b.powerScore - a.powerScore);
  return {
    totalCount: items.length,
    scanCount,
    items,
    byOverall,
    topOverall: byOverall[0] || null,
    axisHighlights: pickCrystalBraceletAxisHighlights(items),
  };
}

/**
 * Fallback when the DB lookup fails: a one-item view from the current payload.
 * @param {Record<string, unknown>} norm
 * @returns {CrystalBraceletLibraryView|null}
 */
export function buildCrystalBraceletLibraryViewFromPayloadOnly(norm) {
  const item = buildItemFromNormalizedPayload(norm, {});
  if (!item) return null;
  return {
    totalCount: 1,
    scanCount: 1,
    items: [item],
    byOverall: [item],
    topOverall: item,
    axisHighlights: pickCrystalBraceletAxisHighlights([item]),
  };
}
