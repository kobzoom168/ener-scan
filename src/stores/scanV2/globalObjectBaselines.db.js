import { supabase } from "../../config/supabase.js";
import { hammingDistance } from "../../services/imageDedup/imagePhash.util.js";

/**
 * @typedef {Object} GlobalObjectBaselineUpsertInput
 * @property {string} imageSha256 — lowercase 64-char hex
 * @property {string|null} [imagePhash]
 * @property {string|null} [stableFeatureSeed]
 * @property {string} lane
 * @property {string} objectFamily
 * @property {number} [baselineSchemaVersion]
 * @property {string|null} [promptVersion]
 * @property {string|null} [scoringVersion]
 * @property {Record<string, unknown>} objectBaselineJson
 * @property {Record<string, number>|null} [axisScoresJson]
 * @property {string|null} [peakPowerKey]
 * @property {string|null} [thumbnailPath]
 * @property {string|null} [sourceScanResultV2Id]
 * @property {string|null} [sourceUploadId]
 * @property {number|null} [confidence]
 */

/**
 * @typedef {Object} GlobalObjectBaselineRow
 * @property {string} id
 * @property {string} imageSha256
 * @property {string|null} imagePhash
 * @property {string|null} stableFeatureSeed
 * @property {string} lane
 * @property {string} objectFamily
 * @property {number} baselineSchemaVersion
 * @property {string|null} promptVersion
 * @property {string|null} scoringVersion
 * @property {unknown} objectBaselineJson
 * @property {unknown} axisScoresJson
 * @property {string|null} peakPowerKey
 * @property {string|null} thumbnailPath
 * @property {string|null} sourceScanResultV2Id
 * @property {string|null} sourceUploadId
 * @property {number|null} confidence
 * @property {number} reuseCount
 */

/**
 * Insert or update baseline keyed by `image_sha256`.
 * Does not increment `reuse_count` (reserved for future reuse hits).
 *
 * @param {GlobalObjectBaselineUpsertInput} input
 * @returns {Promise<{ id: string } | null>}
 */
export async function upsertGlobalObjectBaselineFromScanResult(input) {
  const sha = String(input?.imageSha256 || "")
    .trim()
    .toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sha)) return null;

  const row = {
    image_sha256: sha,
    image_phash: input.imagePhash != null ? String(input.imagePhash).trim().toLowerCase() || null : null,
    stable_feature_seed:
      input.stableFeatureSeed != null ? String(input.stableFeatureSeed).trim() || null : null,
    lane: String(input.lane || "").trim() || "sacred_amulet",
    object_family: String(input.objectFamily || "").trim() || "sacred_amulet",
    baseline_schema_version:
      Number.isFinite(Number(input.baselineSchemaVersion)) && Number(input.baselineSchemaVersion) > 0
        ? Math.floor(Number(input.baselineSchemaVersion))
        : 1,
    prompt_version: input.promptVersion != null ? String(input.promptVersion).trim() || null : null,
    scoring_version: input.scoringVersion != null ? String(input.scoringVersion).trim() || null : null,
    object_baseline_json: input.objectBaselineJson,
    axis_scores_json: input.axisScoresJson && typeof input.axisScoresJson === "object" ? input.axisScoresJson : null,
    peak_power_key: input.peakPowerKey != null ? String(input.peakPowerKey).trim() || null : null,
    thumbnail_path: input.thumbnailPath != null ? String(input.thumbnailPath).trim() || null : null,
    source_scan_result_v2_id: input.sourceScanResultV2Id != null ? String(input.sourceScanResultV2Id).trim() || null : null,
    source_upload_id: input.sourceUploadId != null ? String(input.sourceUploadId).trim() || null : null,
    confidence:
      input.confidence != null && Number.isFinite(Number(input.confidence))
        ? Math.min(1, Math.max(0, Number(input.confidence)))
        : 1,
  };

  const { data, error } = await supabase
    .from("global_object_baselines")
    .upsert(row, { onConflict: "image_sha256" })
    .select("id")
    .maybeSingle();

  if (error) throw error;
  return data?.id ? { id: String(data.id) } : null;
}

/**
 * @param {Record<string, unknown>|null|undefined} raw
 * @returns {GlobalObjectBaselineRow|null}
 */
function mapBaselineRow(raw) {
  if (!raw || typeof raw !== "object") return null;
  const r = /** @type {Record<string, unknown>} */ (raw);
  const id = r.id != null ? String(r.id).trim() : "";
  if (!id) return null;
  const sha = r.image_sha256 != null ? String(r.image_sha256).trim().toLowerCase() : "";
  return {
    id,
    imageSha256: sha,
    imagePhash: r.image_phash != null ? String(r.image_phash).trim().toLowerCase() || null : null,
    stableFeatureSeed:
      r.stable_feature_seed != null ? String(r.stable_feature_seed).trim() || null : null,
    lane: String(r.lane || "").trim() || "sacred_amulet",
    objectFamily: String(r.object_family || "").trim() || "sacred_amulet",
    baselineSchemaVersion:
      Number.isFinite(Number(r.baseline_schema_version)) && Number(r.baseline_schema_version) > 0
        ? Math.floor(Number(r.baseline_schema_version))
        : 1,
    promptVersion: r.prompt_version != null ? String(r.prompt_version).trim() || null : null,
    scoringVersion: r.scoring_version != null ? String(r.scoring_version).trim() || null : null,
    objectBaselineJson: r.object_baseline_json,
    axisScoresJson: r.axis_scores_json ?? null,
    peakPowerKey: r.peak_power_key != null ? String(r.peak_power_key).trim() || null : null,
    thumbnailPath: r.thumbnail_path != null ? String(r.thumbnail_path).trim() || null : null,
    sourceScanResultV2Id:
      r.source_scan_result_v2_id != null ? String(r.source_scan_result_v2_id).trim() || null : null,
    sourceUploadId: r.source_upload_id != null ? String(r.source_upload_id).trim() || null : null,
    confidence:
      r.confidence != null && Number.isFinite(Number(r.confidence)) ? Number(r.confidence) : 1,
    reuseCount:
      r.reuse_count != null && Number.isFinite(Number(r.reuse_count)) ? Math.max(0, Math.floor(Number(r.reuse_count))) : 0,
  };
}

/**
 * @param {string} imageSha256Hex
 * @returns {Promise<GlobalObjectBaselineRow | null>}
 */
export async function findGlobalObjectBaselineBySha256(imageSha256Hex) {
  const sha = String(imageSha256Hex || "")
    .trim()
    .toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sha)) return null;

  const { data, error } = await supabase
    .from("global_object_baselines")
    .select(
      [
        "id",
        "image_sha256",
        "image_phash",
        "stable_feature_seed",
        "lane",
        "object_family",
        "baseline_schema_version",
        "prompt_version",
        "scoring_version",
        "object_baseline_json",
        "axis_scores_json",
        "peak_power_key",
        "thumbnail_path",
        "source_scan_result_v2_id",
        "source_upload_id",
        "confidence",
        "reuse_count",
      ].join(","),
    )
    .eq("image_sha256", sha)
    .maybeSingle();

  if (error) throw error;
  return mapBaselineRow(data);
}

/**
 * Fetch a full baseline row by primary key. Used by Phase 2C pHash reuse
 * after a candidate is identified via `listGlobalObjectBaselinePhashCandidates`.
 *
 * @param {string} baselineId
 * @returns {Promise<GlobalObjectBaselineRow | null>}
 */
export async function findGlobalObjectBaselineById(baselineId) {
  const id = String(baselineId || "").trim();
  if (!id) return null;

  const { data, error } = await supabase
    .from("global_object_baselines")
    .select(
      [
        "id",
        "image_sha256",
        "image_phash",
        "stable_feature_seed",
        "lane",
        "object_family",
        "baseline_schema_version",
        "prompt_version",
        "scoring_version",
        "object_baseline_json",
        "axis_scores_json",
        "peak_power_key",
        "thumbnail_path",
        "source_scan_result_v2_id",
        "source_upload_id",
        "confidence",
        "reuse_count",
      ].join(","),
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return mapBaselineRow(data);
}

/**
 * @returns {Promise<number>}
 */
export async function countGlobalObjectBaselines() {
  const { count, error } = await supabase
    .from("global_object_baselines")
    .select("id", { count: "exact", head: true });
  if (error) throw error;
  return Number.isFinite(Number(count)) ? Number(count) : 0;
}

/**
 * Return recent SHA prefixes with the same leading prefix for diagnostics only.
 *
 * @param {string} shaPrefixHex
 * @param {number} [limit]
 * @returns {Promise<string[]>}
 */
export async function listGlobalObjectBaselineShaPrefixesByPrefix(shaPrefixHex, limit = 5) {
  const pfx = String(shaPrefixHex || "")
    .trim()
    .toLowerCase();
  const lim = Math.min(20, Math.max(1, Math.floor(Number(limit)) || 5));
  if (!/^[0-9a-f]{4,64}$/.test(pfx)) return [];

  const { data, error } = await supabase
    .from("global_object_baselines")
    .select("image_sha256")
    .ilike("image_sha256", `${pfx}%`)
    .order("created_at", { ascending: false })
    .limit(lim);
  if (error) throw error;
  if (!Array.isArray(data) || !data.length) return [];

  return data
    .map((row) =>
      row && typeof row === "object" && "image_sha256" in row
        ? String(row.image_sha256 || "").trim().toLowerCase().slice(0, 12)
        : "",
    )
    .filter(Boolean);
}

/**
 * @typedef {Object} GlobalObjectBaselinePhashCandidate
 * @property {string} baselineId
 * @property {string} shaPrefix
 * @property {string} imagePhash
 * @property {number} phashDistance
 * @property {string} lane
 * @property {string} objectFamily
 * @property {string|null} peakPowerKey
 * @property {string|null} createdAt
 */

/**
 * @param {string} imagePhash
 * @param {Array<Record<string, unknown>>} rows
 * @param {{ maxDistance?: number, lane?: string|null, objectFamily?: string|null }} [opts]
 * @returns {GlobalObjectBaselinePhashCandidate[]}
 */
export function rankGlobalObjectBaselinePhashCandidates(imagePhash, rows, opts = {}) {
  const current = String(imagePhash || "")
    .trim()
    .toLowerCase();
  if (!/^[0-9a-f]{16}$/.test(current)) return [];
  const maxDistance = Math.min(64, Math.max(0, Math.floor(Number(opts.maxDistance ?? 6) || 6)));
  const laneFilter = String(opts.lane || "").trim().toLowerCase();
  const familyFilter = String(opts.objectFamily || "").trim().toLowerCase();

  /** @type {GlobalObjectBaselinePhashCandidate[]} */
  const out = [];
  for (const raw of Array.isArray(rows) ? rows : []) {
    if (!raw || typeof raw !== "object") continue;
    const id = String(raw.id || "").trim();
    const rowPhash = String(raw.image_phash || "")
      .trim()
      .toLowerCase();
    if (!id || !/^[0-9a-f]{16}$/.test(rowPhash)) continue;
    const lane = String(raw.lane || "")
      .trim()
      .toLowerCase();
    const objectFamily = String(raw.object_family || "")
      .trim()
      .toLowerCase();
    if (laneFilter && lane !== laneFilter) continue;
    if (familyFilter && objectFamily !== familyFilter) continue;

    const dist = hammingDistance(current, rowPhash);
    if (!Number.isFinite(dist) || dist > maxDistance) continue;
    const shaPrefix = String(raw.image_sha256 || "")
      .trim()
      .toLowerCase()
      .slice(0, 12);
    out.push({
      baselineId: id,
      shaPrefix,
      imagePhash: rowPhash,
      phashDistance: dist,
      lane: lane || "unknown",
      objectFamily: objectFamily || "unknown",
      peakPowerKey: raw.peak_power_key != null ? String(raw.peak_power_key).trim() || null : null,
      createdAt: raw.created_at != null ? String(raw.created_at) : null,
    });
  }
  out.sort((a, b) => a.phashDistance - b.phashDistance);
  return out;
}

/**
 * Diagnostics-only lookup by pHash; does not mutate DB.
 *
 * @param {string} imagePhash
 * @param {number} maxDistance
 * @param {{ lane?: string|null, objectFamily?: string|null, limit?: number }} [opts]
 * @returns {Promise<GlobalObjectBaselinePhashCandidate[]>}
 */
export async function listGlobalObjectBaselinePhashCandidates(
  imagePhash,
  maxDistance,
  opts = {},
) {
  const ph = String(imagePhash || "")
    .trim()
    .toLowerCase();
  if (!/^[0-9a-f]{16}$/.test(ph)) return [];

  const lim = Math.min(500, Math.max(20, Math.floor(Number(opts.limit) || 200)));
  const { data, error } = await supabase
    .from("global_object_baselines")
    .select("id,image_sha256,image_phash,lane,object_family,peak_power_key,created_at")
    .not("image_phash", "is", null)
    .neq("image_phash", "")
    .order("created_at", { ascending: false })
    .limit(lim);
  if (error) throw error;
  return rankGlobalObjectBaselinePhashCandidates(ph, Array.isArray(data) ? data : [], {
    maxDistance,
    lane: opts.lane ?? null,
    objectFamily: opts.objectFamily ?? null,
  });
}

/**
 * Best-effort reuse counter (non-atomic increment acceptable for Phase 2A on staging).
 *
 * @param {string} baselineId
 * @returns {Promise<void>}
 */
export async function markGlobalObjectBaselineReused(baselineId) {
  const id = String(baselineId || "").trim();
  if (!id) return;

  try {
    const { data: cur, error: selErr } = await supabase
      .from("global_object_baselines")
      .select("reuse_count")
      .eq("id", id)
      .maybeSingle();

    if (selErr) throw selErr;
    const prev =
      cur && typeof cur === "object" && "reuse_count" in cur && Number.isFinite(Number(cur.reuse_count))
        ? Math.max(0, Math.floor(Number(cur.reuse_count)))
        : 0;

    const { error: upErr } = await supabase
      .from("global_object_baselines")
      .update({
        reuse_count: prev + 1,
        last_reused_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (upErr) throw upErr;
    console.log(
      JSON.stringify({
        event: "CROSS_ACCOUNT_BASELINE_REUSE_MARKED",
        path: "worker-scan",
        baselineIdPrefix: id.slice(0, 8),
        reuseCountNext: prev + 1,
      }),
    );
  } catch {
    /* caller logs; never throw */
  }
}
