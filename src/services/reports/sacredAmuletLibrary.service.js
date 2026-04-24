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
 * @property {number} scanCountInGroup
 * @property {string} groupKey
 * @property {"object_fingerprint"|"stable_feature_seed"|"image_phash"|"cache_key"|"public_token_fallback"} groupKeySource
 */

/**
 * @typedef {Object} SacredAmuletLibraryView
 * @property {number} totalCount
 * @property {number|null} groupedObjectCount
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
 * @param {unknown} v
 * @returns {string}
 */
function normalizeGroupToken(v) {
  return String(v || "")
    .trim()
    .toLowerCase();
}

/**
 * @param {Record<string, unknown>} obj
 * @param {string[]} path
 * @returns {unknown}
 */
function readPath(obj, path) {
  /** @type {unknown} */
  let cur = obj;
  for (const p of path) {
    if (!cur || typeof cur !== "object" || Array.isArray(cur)) return undefined;
    cur = /** @type {Record<string, unknown>} */ (cur)[p];
  }
  return cur;
}

/**
 * @param {unknown} raw
 * @param {import("./reportPayload.types.js").ReportPayload} norm
 * @param {{ id?: string, created_at?: string }} meta
 * @returns {{ key: string, source: SacredAmuletLibraryItem["groupKeySource"], trusted: boolean }}
 */
function resolveGroupIdentity(raw, norm, meta) {
  const rawObj =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? /** @type {Record<string, unknown>} */ (raw)
      : {};
  const tok = String(norm.publicToken || "").trim();
  const reportId = String(norm.reportId || "").trim();
  const scanId = String(norm.scanId || "").trim();
  const rowId = String(meta?.id || "").trim();

  /** @type {Array<{ source: SacredAmuletLibraryItem["groupKeySource"], value: unknown }>} */
  const candidates = [
    { source: "object_fingerprint", value: rawObj.objectFingerprint },
    { source: "object_fingerprint", value: rawObj.object_fingerprint },
    { source: "stable_feature_seed", value: rawObj.stableFeatureSeed },
    { source: "stable_feature_seed", value: rawObj.stable_feature_seed },
    { source: "stable_feature_seed", value: readPath(rawObj, ["compatibility", "inputs", "scoreSeedKey"]) },
    { source: "stable_feature_seed", value: readPath(rawObj, ["objectEnergy", "inputs", "stableFeatureSeed"]) },
    { source: "image_phash", value: rawObj.imagePhash },
    { source: "image_phash", value: rawObj.image_phash },
    { source: "image_phash", value: rawObj.pHash },
    { source: "image_phash", value: rawObj.phash },
    { source: "cache_key", value: rawObj.cacheKey },
    { source: "cache_key", value: rawObj.cache_key },
  ];

  const disallow = new Set(
    [tok, reportId, scanId, rowId].map((x) => normalizeGroupToken(x)).filter(Boolean),
  );
  for (const c of candidates) {
    const rawVal = String(c.value || "").trim();
    if (!rawVal) continue;
    const key = normalizeGroupToken(rawVal);
    if (!key) continue;
    if (disallow.has(key)) continue;
    return { key: `${c.source}:${key}`, source: c.source, trusted: true };
  }

  const tokSafe = tok || "unknown";
  return {
    key: `public_token_fallback:${normalizeGroupToken(tokSafe)}`,
    source: "public_token_fallback",
    trusted: false,
  };
}

/**
 * @param {SacredAmuletLibraryItem[]} list
 * @returns {SacredAmuletLibraryItem}
 */
function pickLatestRepresentative(list) {
  return [...list].sort((a, b) => {
    const ta = Date.parse(String(a.scannedAtIso || "")) || 0;
    const tb = Date.parse(String(b.scannedAtIso || "")) || 0;
    if (tb !== ta) return tb - ta;
    return String(b.scanResultV2Id || "").localeCompare(String(a.scanResultV2Id || ""));
  })[0];
}

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

  const identity = resolveGroupIdentity(raw, norm, meta);

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
    scanCountInGroup: 1,
    groupKey: identity.key,
    groupKeySource: identity.source,
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
 * Build grouped ranking view from raw scan-level items.
 *
 * @param {SacredAmuletLibraryItem[]} scans
 * @returns {SacredAmuletLibraryView|null}
 */
export function buildSacredAmuletLibraryViewFromItems(scans) {
  if (!Array.isArray(scans) || scans.length === 0) return null;
  /** @type {Map<string, SacredAmuletLibraryItem[]>} */
  const grouped = new Map();
  let trustedGroupKeySeen = false;
  for (const it of scans) {
    if (!it || typeof it !== "object") continue;
    if (it.groupKeySource !== "public_token_fallback") trustedGroupKeySeen = true;
    const curr = grouped.get(it.groupKey);
    if (curr) curr.push(it);
    else grouped.set(it.groupKey, [it]);
  }
  if (grouped.size === 0) return null;

  /** @type {SacredAmuletLibraryItem[]} */
  const items = [];
  for (const list of grouped.values()) {
    const rep = pickLatestRepresentative(list);
    items.push({
      ...rep,
      scanCountInGroup: list.length,
    });
  }

  const byOverall = sortByOverall(items);
  const topOverall = byOverall[0] || null;
  const groupedObjectCount =
    trustedGroupKeySeen && items.length < scans.length ? items.length : null;

  return {
    totalCount: scans.length,
    groupedObjectCount,
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
 * @param {string} lineUserId — LINE `userId` จาก report payload
 * @returns {Promise<SacredAmuletLibraryView|null>}
 */
export async function buildSacredAmuletLibraryForLineUser(lineUserId) {
  const uid = String(lineUserId || "").trim();
  if (!uid) return null;

  const rows = await listScanResultsV2PayloadRowsForLineUser(uid, 100);
  /** @type {SacredAmuletLibraryItem[]} */
  const scans = [];

  for (const row of rows) {
    const raw = row?.report_payload_json;
    const meta = { id: row?.id, created_at: row?.created_at };
    const fromRow = extractSacredAmuletLibraryItem(raw, meta);
    if (!fromRow) continue;
    let tok = fromRow.publicToken;
    const alt = String(row?.html_public_token || "").trim();
    if (alt) tok = alt;
    const merged = { ...fromRow, publicToken: tok };
    merged.displayReportId = formatEsDisplayReportId(tok, merged.reportId);
    scans.push(merged);
  }

  return buildSacredAmuletLibraryViewFromItems(scans);
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
    groupedObjectCount: null,
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
