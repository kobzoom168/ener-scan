/**
 * “คลังพลังของคุณ” — sacred_amulet scans for one LINE user from `scan_results_v2`.
 * Never invents amulet names; ranking uses scores + thumbnails only.
 */
import { listScanResultsV2PayloadRowsForLineUser } from "../../stores/scanV2/scanResultsV2.db.js";
import { listScanPhashesByScanResultIds } from "../../stores/scanV2/imageDedupCache.db.js";
import { listScanJobsUploadIdsByIds } from "../../stores/scanV2/scanJobs.db.js";
import { listScanUploadsSha256ByIds } from "../../stores/scanV2/scanUploads.db.js";
import { normalizeReportPayloadForRender } from "../../utils/reports/reportPayloadNormalize.util.js";
import { formatEsDisplayReportId } from "../../utils/reports/reportHtmlTrust.util.js";
import { computeAmuletOrdAndAlignFromPayload } from "../../amulet/amuletOrdAlign.util.js";
import {
  hammingDistance,
} from "../imageDedup/imagePhash.util.js";
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
 * @property {"image_sha256"|"object_fingerprint"|"stable_feature_seed"|"image_phash"|"cache_key"|"public_token_fallback"} groupKeySource
 * @property {string|null} imagePhash
 * @property {string|null} imageSha256
 * @property {string} objectFamily
 * @property {"unique"|"exact_duplicate"|"near_exact_duplicate"|"possible_duplicate"|"possible_duplicate_high"|"possible_duplicate_medium"} duplicateStatus
 * @property {string|null} duplicateReason
 * @property {string|null} objectGroupId
 * @property {boolean} userConfirmedGroup
 * @property {number|null} duplicateConfidence
 * @property {string|null} uploadId — scan_uploads.id when known (pin / retention)
 */

/**
 * @typedef {Object} SacredAmuletAxisHighlight
 * @property {AmuletPowerKey} axis
 * @property {string} labelTh — ชื่อมิติพลัง (ไทย)
 * @property {SacredAmuletLibraryItem} item
 * @property {number} axisScore
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
 * @property {SacredAmuletAxisHighlight[]} axisHighlights — สูงสุดต่อมิติ (สูงสุด 6 รายการ)
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
 * @returns {{ key: string, source: Exclude<SacredAmuletLibraryItem["groupKeySource"], "image_sha256">, trusted: boolean }}
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

const NEAR_EXACT_PHASH_DISTANCE_MAX = 4;
const POSSIBLE_DUP_PHASH_DISTANCE_MIN = 5;
const POSSIBLE_DUP_PHASH_DISTANCE_MAX = 10;
const POSSIBLE_DUP_TIME_WINDOW_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

/**
 * @param {SacredAmuletLibraryItem} a
 * @param {SacredAmuletLibraryItem} b
 * @returns {boolean}
 */
function sameObjectFamily(a, b) {
  return String(a.objectFamily || "").trim() === String(b.objectFamily || "").trim();
}

/**
 * @param {SacredAmuletLibraryItem} a
 * @param {SacredAmuletLibraryItem} b
 * @returns {boolean}
 */
function scannedAtCloseEnough(a, b) {
  const ta = Date.parse(String(a.scannedAtIso || "")) || 0;
  const tb = Date.parse(String(b.scannedAtIso || "")) || 0;
  if (!ta || !tb) return false;
  return Math.abs(ta - tb) <= POSSIBLE_DUP_TIME_WINDOW_MS;
}

/**
 * @param {SacredAmuletLibraryItem[]} scans
 * @returns {SacredAmuletLibraryItem[]}
 */
function applyNearExactPhashGrouping(scans) {
  const withPhash = scans.filter(
    (s) => !String(s.imageSha256 || "").trim() && String(s.imagePhash || "").trim(),
  );
  if (withPhash.length < 2) return scans;
  const n = withPhash.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x) => {
    let p = x;
    while (parent[p] !== p) p = parent[p];
    while (parent[x] !== x) {
      const nx = parent[x];
      parent[x] = p;
      x = nx;
    }
    return p;
  };
  const unite = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const a = withPhash[i];
      const b = withPhash[j];
      if (!sameObjectFamily(a, b)) continue;
      const da = String(a.imagePhash || "");
      const db = String(b.imagePhash || "");
      if (!da || !db) continue;
      const dist = hammingDistance(da, db);
      if (dist <= NEAR_EXACT_PHASH_DISTANCE_MAX) unite(i, j);
    }
  }

  /** @type {Map<number, string>} */
  const rootKey = new Map();
  for (let i = 0; i < n; i += 1) {
    const r = find(i);
    if (rootKey.has(r)) continue;
    const keys = [];
    for (let j = 0; j < n; j += 1) {
      if (find(j) === r) keys.push(String(withPhash[j].imagePhash || ""));
    }
    keys.sort();
    rootKey.set(r, `image_phash:${keys[0] || "unknown"}`);
  }

  return scans.map((s) => {
    if (String(s.imageSha256 || "").trim()) return s;
    const ph = String(s.imagePhash || "");
    if (!ph) return s;
    const idx = withPhash.findIndex((x) => x.scanResultV2Id === s.scanResultV2Id);
    if (idx < 0) return s;
    const root = find(idx);
    const key = rootKey.get(root) || s.groupKey;
    return key === s.groupKey
      ? s
      : {
          ...s,
          groupKey: key,
          groupKeySource: "image_phash",
          duplicateStatus: "near_exact_duplicate",
          duplicateReason: "phash_distance_le_4_same_object_family",
        };
  });
}

/**
 * @param {SacredAmuletLibraryItem[]} reps
 * @returns {SacredAmuletLibraryItem[]}
 */
function markPossibleDuplicates(reps) {
  return reps.map((it, i) => {
    if (
      it.scanCountInGroup > 1 ||
      it.duplicateStatus === "possible_duplicate_high" ||
      it.duplicateStatus === "possible_duplicate_medium" ||
      it.duplicateStatus === "possible_duplicate"
    ) {
      return it;
    }
    const ph = String(it.imagePhash || "");
    if (!ph) return it;
    for (let j = 0; j < reps.length; j += 1) {
      if (j === i) continue;
      const other = reps[j];
      if (!sameObjectFamily(it, other)) continue;
      const oph = String(other.imagePhash || "");
      if (!oph) continue;
      const dist = hammingDistance(ph, oph);
      if (
        dist >= POSSIBLE_DUP_PHASH_DISTANCE_MIN &&
        dist <= POSSIBLE_DUP_PHASH_DISTANCE_MAX &&
        scannedAtCloseEnough(it, other)
      ) {
        return {
          ...it,
          duplicateStatus: "possible_duplicate",
          duplicateReason: "phash_distance_5_10_same_family_close_time",
        };
      }
    }
    return it;
  });
}

/**
 * @param {SacredAmuletLibraryItem[]} scans
 * @returns {SacredAmuletLibraryItem[]}
 */
function applyShaGrouping(scans) {
  return scans.map((s) => {
    const sha = String(s.imageSha256 || "").trim().toLowerCase();
    if (!sha) return s;
    return {
      ...s,
      groupKey: `image_sha256:${sha}`,
      groupKeySource: "image_sha256",
    };
  });
}

/**
 * @param {SacredAmuletLibraryItem[]} scans
 * @returns {SacredAmuletLibraryItem[]}
 */
function applyConfirmedGrouping(scans) {
  return scans.map((s) => {
    const gid = String(s.objectGroupId || "").trim();
    if (!gid || !s.userConfirmedGroup) return s;
    return {
      ...s,
      groupKey: `confirmed_group:${normalizeGroupToken(gid)}`,
      groupKeySource: "cache_key",
    };
  });
}

/**
 * @param {unknown} raw
 * @param {{ id?: string, created_at?: string, uploadId?: string|null }} meta
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
  const rawObj = /** @type {Record<string, unknown>} */ (raw);
  const imagePhashCandidates = [
    rawObj.image_phash,
    rawObj.imagePhash,
    rawObj.phash,
    rawObj.pHash,
  ];
  const imagePhash =
    imagePhashCandidates.map((v) => String(v || "").trim().toLowerCase()).find(Boolean) ||
    null;
  const imageSha256Candidates = [rawObj.sha256, rawObj.imageSha256, rawObj.image_sha256];
  const imageSha256 =
    imageSha256Candidates
      .map((v) => String(v || "").trim().toLowerCase())
      .find((v) => /^[0-9a-f]{64}$/i.test(v)) || null;
  const objectFamilyRaw =
    String(norm.summary?.energyCopyObjectFamily || "").trim() ||
    String(readPath(rawObj, ["diagnostics", "objectFamily"]) || "").trim() ||
    "sacred_amulet";
  const objectGroupId =
    String(rawObj.object_group_id || readPath(rawObj, ["dedup", "object_group_id"]) || "")
      .trim() || null;
  const userConfirmedGroupRaw = readPath(rawObj, ["dedup", "user_confirmed_group"]);
  const userConfirmedGroup =
    userConfirmedGroupRaw === true ||
    String(userConfirmedGroupRaw || "").trim().toLowerCase() === "true" ||
    (Boolean(objectGroupId) &&
      String(readPath(rawObj, ["dedup", "confirmed_by"]) || "")
        .trim()
        .toLowerCase() === "user");
  const duplicateStatusRaw = String(
    rawObj.duplicate_status || readPath(rawObj, ["dedup", "duplicate_status"]) || "",
  )
    .trim()
    .toLowerCase();
  const duplicateStatus =
    duplicateStatusRaw === "exact_duplicate" ||
    duplicateStatusRaw === "near_exact_duplicate" ||
    duplicateStatusRaw === "possible_duplicate" ||
    duplicateStatusRaw === "possible_duplicate_high" ||
    duplicateStatusRaw === "possible_duplicate_medium"
      ? duplicateStatusRaw
      : "unique";
  const duplicateReason =
    String(rawObj.duplicate_reason || readPath(rawObj, ["dedup", "duplicate_reason"]) || "")
      .trim() || null;
  const duplicateConfidenceNum = Number(
    rawObj.duplicate_confidence || readPath(rawObj, ["dedup", "duplicate_confidence"]),
  );
  const duplicateConfidence = Number.isFinite(duplicateConfidenceNum)
    ? Math.max(0, Math.min(1, duplicateConfidenceNum))
    : null;

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
    imagePhash,
    imageSha256,
    objectFamily: objectFamilyRaw,
    duplicateStatus,
    duplicateReason,
    objectGroupId,
    userConfirmedGroup,
    duplicateConfidence,
    uploadId: String(meta?.uploadId || "").trim() || null,
  };
}

/**
 * Sort comparator: higher axis score first; tie → สแกนใหม่กว่า; tie → compat สูงกว่า; tie → scan id.
 * @param {SacredAmuletLibraryItem} a
 * @param {SacredAmuletLibraryItem} b
 * @param {AmuletPowerKey} axis
 * @returns {number}
 */
function compareAxisScoreDesc(a, b, axis) {
  const da = Number(a.axisScores?.[axis]) || 0;
  const db = Number(b.axisScores?.[axis]) || 0;
  if (db !== da) return db - da;
  const ta = Date.parse(String(a.scannedAtIso || "")) || 0;
  const tb = Date.parse(String(b.scannedAtIso || "")) || 0;
  if (tb !== ta) return tb - ta;
  const ca = a.compatPercent != null ? a.compatPercent : -1;
  const cb = b.compatPercent != null ? b.compatPercent : -1;
  if (cb !== ca) return cb - ca;
  return String(b.scanResultV2Id || "").localeCompare(String(a.scanResultV2Id || ""));
}

/**
 * @param {SacredAmuletLibraryItem[]} items
 * @param {AmuletPowerKey} axis
 */
function sortByAxisScore(items, axis) {
  return [...items].sort((a, b) => compareAxisScoreDesc(a, b, axis));
}

/**
 * คะแนนสูงสุดต่อมิติ (สูงสุด 6); ข้ามมิติที่ไม่มีคะแนน > 0
 * @param {SacredAmuletLibraryItem[]} items
 * @returns {SacredAmuletAxisHighlight[]}
 */
function pickSacredAmuletAxisHighlights(items) {
  if (!Array.isArray(items) || items.length === 0) return [];
  /** @type {SacredAmuletAxisHighlight[]} */
  const out = [];
  for (const axis of POWER_ORDER) {
    const scored = items.filter((it) => {
      const s = Number(it.axisScores?.[axis]);
      return Number.isFinite(s) && s > 0;
    });
    if (!scored.length) continue;
    const item = [...scored].sort((a, b) => compareAxisScoreDesc(a, b, axis))[0];
    const axisScore = Math.round(Number(item.axisScores?.[axis]) || 0);
    const labelTh =
      POWER_LABEL_THAI[/** @type {keyof typeof POWER_LABEL_THAI} */ (axis)] ||
      String(axis);
    out.push({ axis, labelTh, item, axisScore });
  }
  return out;
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
  const safeBaseScans = scans.map((s) => ({
    ...s,
    groupKey: `public_token_fallback:${normalizeGroupToken(String(s.publicToken || "unknown"))}`,
    groupKeySource: "public_token_fallback",
  }));
  const confirmedGroupedScans = applyConfirmedGrouping(safeBaseScans);
  const shaGroupedScans = applyShaGrouping(confirmedGroupedScans).map((s) =>
    s.groupKeySource === "image_sha256"
      ? {
          ...s,
          duplicateStatus: "exact_duplicate",
          duplicateReason: "image_sha256_match",
        }
      : s,
  );
  const nearExactGroupedScans = applyNearExactPhashGrouping(shaGroupedScans);
  for (const it of nearExactGroupedScans) {
    if (!it || typeof it !== "object") continue;
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

  const itemsMarked = markPossibleDuplicates(items);
  const groupedObjectCount =
    itemsMarked.length < nearExactGroupedScans.length
      ? itemsMarked.length
      : null;

  return {
    totalCount: nearExactGroupedScans.length,
    groupedObjectCount,
    items: itemsMarked,
    byOverall: sortByOverall(itemsMarked),
    byLuck: sortByAxisScore(itemsMarked, "luck"),
    byProtection: sortByAxisScore(itemsMarked, "protection"),
    byMetta: sortByAxisScore(itemsMarked, "metta"),
    byBaramee: sortByAxisScore(itemsMarked, "baramee"),
    byFit: sortByFit(itemsMarked),
    topOverall: sortByOverall(itemsMarked)[0] || null,
    axisHighlights: pickSacredAmuletAxisHighlights(itemsMarked),
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

  const scanJobIdByResultId = new Map();
  for (const row of rows) {
    const rid = String(row?.id || "").trim();
    const jobId = String(row?.scan_job_id || "").trim();
    if (rid && jobId) scanJobIdByResultId.set(rid, jobId);
  }

  /** @type {Map<string, string>} */
  const uploadIdByJobId = new Map();
  const scanJobIds = Array.from(new Set(Array.from(scanJobIdByResultId.values())));
  if (scanJobIds.length) {
    try {
      const jobRows = await listScanJobsUploadIdsByIds(scanJobIds, uid);
      for (const r of jobRows) {
        const jid = String(r.id || "").trim();
        const upid = String(r.upload_id || "").trim();
        if (jid && upid) uploadIdByJobId.set(jid, upid);
      }
    } catch {
      /* non-fatal */
    }
  }

  /** @type {SacredAmuletLibraryItem[]} */
  const scans = [];

  for (const row of rows) {
    const raw = row?.report_payload_json;
    const rid = String(row?.id || "").trim();
    const jobId = scanJobIdByResultId.get(rid) || "";
    const uploadId = jobId ? uploadIdByJobId.get(jobId) || null : null;
    const meta = { id: row?.id, created_at: row?.created_at, uploadId };
    const fromRow = extractSacredAmuletLibraryItem(raw, meta);
    if (!fromRow) continue;
    let tok = fromRow.publicToken;
    const alt = String(row?.html_public_token || "").trim();
    if (alt) tok = alt;
    const merged = { ...fromRow, publicToken: tok };
    merged.displayReportId = formatEsDisplayReportId(tok, merged.reportId);
    scans.push(merged);
  }

  const rawScanCount = scans.length;
  const scanResultIdsCount = new Set(
    scans.map((s) => String(s.scanResultV2Id || "").trim()).filter(Boolean),
  ).size;

  if (scanJobIds.length) {
    try {
      const uploadIds = Array.from(new Set(Array.from(uploadIdByJobId.values())));
      if (uploadIds.length) {
        const uploadRows = await listScanUploadsSha256ByIds(uploadIds, uid);
        const shaByUploadId = new Map();
        for (const ur of uploadRows) {
          const upid = String(ur.id || "").trim();
          const sha = String(ur.sha256 || "").trim().toLowerCase();
          if (upid && /^[0-9a-f]{64}$/i.test(sha)) shaByUploadId.set(upid, sha);
        }
        for (const s of scans) {
          if (s.imageSha256) continue;
          const jobId = scanJobIdByResultId.get(String(s.scanResultV2Id || "").trim());
          const uploadId = jobId ? uploadIdByJobId.get(jobId) : null;
          const sha = uploadId ? shaByUploadId.get(uploadId) : null;
          if (sha) s.imageSha256 = sha;
        }
      }
    } catch {
      // Non-fatal: fallback to other keys.
    }
  }

  let phashRowsCount = 0;
  if (scans.length) {
    try {
      const phRows = await listScanPhashesByScanResultIds(
        scans.map((s) => s.scanResultV2Id),
        uid,
      );
      phashRowsCount = phRows.length;
      const byScanId = new Map();
      for (const r of phRows) {
        const sid = String(r.scan_result_id || "").trim();
        const ph = String(r.image_phash || "").trim().toLowerCase();
        if (!sid || !ph) continue;
        byScanId.set(sid, ph);
      }
      for (const s of scans) {
        if (s.imagePhash) continue;
        const ph = byScanId.get(String(s.scanResultV2Id || "").trim());
        if (ph) s.imagePhash = ph;
      }
    } catch {
      // Non-fatal: keep grouping by existing trusted keys.
    }
  }
  const scansWithPhashCount = scans.filter((s) => String(s.imagePhash || "").trim()).length;
  const view = buildSacredAmuletLibraryViewFromItems(scans);
  if (!view) return null;
  const groupedItemsCount = view.items.length;
  const duplicateGroupsCount = view.items.filter((it) => it.scanCountInGroup > 1).length;
  console.log(
    JSON.stringify({
      event: "REPORT_LIBRARY_GROUPING_STATS",
      lineUserIdPrefix: uid.slice(0, 8),
      rawScanCount,
      scanResultIdsCount,
      phashRowsCount,
      scansWithPhashCount,
      groupedItemsCount,
      duplicateGroupsCount,
    }),
  );
  return view;
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
    axisHighlights: pickSacredAmuletAxisHighlights(items),
  };
}
