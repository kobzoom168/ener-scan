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
 * @property {number[]|null} [imageEmbedding]
 * @property {string|null} [embeddingModel]
 * @property {string|null} [embeddingVersion]
 * @property {string|null} [embeddingDescriptor]
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
 * @property {string|null} objectGroupId
 * @property {boolean} isEnrolled
 * @property {number} viewCount
 * @property {unknown} lockedAxisScoresJson
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

  // Embedding columns exist only after migration 034; include them only when provided so the
  // upsert stays compatible with environments where the column is not yet present.
  if (
    Array.isArray(input.imageEmbedding) &&
    input.imageEmbedding.length > 0 &&
    input.imageEmbedding.every((x) => Number.isFinite(Number(x)))
  ) {
    /** pgvector accepts the JSON array string form `[0.1,0.2,...]`. */
    row.image_embedding = `[${input.imageEmbedding.map((x) => Number(x)).join(",")}]`;
    row.embedding_model = input.embeddingModel != null ? String(input.embeddingModel).trim() || null : null;
    row.embedding_version = input.embeddingVersion != null ? String(input.embeddingVersion).trim() || null : null;
    row.embedding_descriptor =
      input.embeddingDescriptor != null ? String(input.embeddingDescriptor).trim().slice(0, 600) || null : null;
  }

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
    objectGroupId: r.object_group_id != null ? String(r.object_group_id).trim() || null : null,
    isEnrolled: r.is_enrolled === true,
    viewCount:
      r.view_count != null && Number.isFinite(Number(r.view_count)) ? Math.max(1, Math.floor(Number(r.view_count))) : 1,
    lockedAxisScoresJson: r.locked_axis_scores_json ?? null,
  };
}

/**
 * Column list INCLUDING the enrollment columns (migration 035). PostgREST errors on unknown columns,
 * so this is only used by enrollment-path lookups that run after the migration is applied (the
 * feature is flag-gated). Legacy 2A/2C lookups keep their original narrower selects.
 */
const BASELINE_FULL_SELECT = [
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
  "object_group_id",
  "is_enrolled",
  "view_count",
  "locked_axis_scores_json",
].join(",");

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
 * Phase 2D: semantic nearest-neighbor lookup via the `match_global_object_baselines` RPC.
 * Returns the closest baselines (cosine) at or above `minSimilarity`, filtered by lane/family.
 *
 * @param {number[]} embedding
 * @param {{ lane?: string|null, objectFamily?: string|null, minSimilarity?: number, matchCount?: number }} [opts]
 * @returns {Promise<Array<GlobalObjectBaselineRow & { similarity: number }>>}
 */
export async function matchGlobalObjectBaselinesByEmbedding(embedding, opts = {}) {
  if (!Array.isArray(embedding) || embedding.length === 0) return [];
  if (!embedding.every((x) => Number.isFinite(Number(x)))) return [];

  const minSimilarity = Math.min(1, Math.max(0, Number(opts.minSimilarity ?? 0.92)));
  const matchCount = Math.min(50, Math.max(1, Math.floor(Number(opts.matchCount) || 5)));

  const { data, error } = await supabase.rpc("match_global_object_baselines", {
    query_embedding: embedding.map((x) => Number(x)),
    match_lane: opts.lane != null ? String(opts.lane).trim() || null : null,
    match_family: opts.objectFamily != null ? String(opts.objectFamily).trim() || null : null,
    min_similarity: minSimilarity,
    match_count: matchCount,
  });

  if (error) throw error;
  if (!Array.isArray(data)) return [];

  /** @type {Array<GlobalObjectBaselineRow & { similarity: number }>} */
  const out = [];
  for (const raw of data) {
    const mapped = mapBaselineRow(raw);
    if (!mapped) continue;
    const sim =
      raw && typeof raw === "object" && "similarity" in raw && Number.isFinite(Number(raw.similarity))
        ? Number(raw.similarity)
        : 0;
    out.push({ ...mapped, similarity: sim });
  }
  out.sort((a, b) => b.similarity - a.similarity);
  return out;
}

/**
 * Phase 2E: full row including enrollment columns (post-migration 035 only).
 * @param {string} baselineId
 * @returns {Promise<GlobalObjectBaselineRow | null>}
 */
export async function findGlobalObjectBaselineByIdWithGroup(baselineId) {
  const id = String(baselineId || "").trim();
  if (!id) return null;
  const { data, error } = await supabase
    .from("global_object_baselines")
    .select(BASELINE_FULL_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return mapBaselineRow(data);
}

/**
 * Phase 2E: per-view axis scores for every row in an object group.
 * @param {string} objectGroupId
 * @returns {Promise<Array<Record<string, number>>>}
 */
export async function listObjectGroupViewAxisScores(objectGroupId) {
  const gid = String(objectGroupId || "").trim();
  if (!gid) return [];
  const { data, error } = await supabase
    .from("global_object_baselines")
    .select("axis_scores_json")
    .eq("object_group_id", gid);
  if (error) throw error;
  if (!Array.isArray(data)) return [];
  return data
    .map((r) => (r && typeof r === "object" ? /** @type {Record<string, unknown>} */ (r).axis_scores_json : null))
    .filter((a) => a && typeof a === "object" && !Array.isArray(a))
    .map((a) => /** @type {Record<string, number>} */ (a));
}

/**
 * Phase 2E: append a recognized angle as a new view row of an existing object group.
 * Returns the new row id (or null on failure). Carries the group's locked scores forward.
 *
 * @param {object} p
 * @param {string} p.objectGroupId
 * @param {string} p.imageSha256
 * @param {string|null} [p.imagePhash]
 * @param {number[]|null} [p.imageEmbedding]
 * @param {string|null} [p.embeddingModel]
 * @param {string|null} [p.embeddingVersion]
 * @param {string|null} [p.embeddingDescriptor]
 * @param {string} p.lane
 * @param {string} p.objectFamily
 * @param {Record<string, unknown>} p.objectBaselineJson
 * @param {Record<string, number>} p.axisScoresJson
 * @param {string|null} [p.peakPowerKey]
 * @param {string|null} [p.sourceScanResultV2Id]
 * @param {string|null} [p.sourceUploadId]
 * @returns {Promise<{ id: string } | null>}
 */
export async function appendObjectGroupAngleView(p) {
  const sha = String(p?.imageSha256 || "").trim().toLowerCase();
  const gid = String(p?.objectGroupId || "").trim();
  if (!/^[0-9a-f]{64}$/.test(sha) || !gid) return null;

  /** @type {Record<string, unknown>} */
  const row = {
    image_sha256: sha,
    image_phash: p.imagePhash != null ? String(p.imagePhash).trim().toLowerCase() || null : null,
    object_group_id: gid,
    lane: String(p.lane || "sacred_amulet").trim() || "sacred_amulet",
    object_family: String(p.objectFamily || "sacred_amulet").trim() || "sacred_amulet",
    baseline_schema_version: 1,
    object_baseline_json: p.objectBaselineJson,
    axis_scores_json: p.axisScoresJson && typeof p.axisScoresJson === "object" ? p.axisScoresJson : null,
    peak_power_key: p.peakPowerKey != null ? String(p.peakPowerKey).trim() || null : null,
    source_scan_result_v2_id: p.sourceScanResultV2Id != null ? String(p.sourceScanResultV2Id).trim() || null : null,
    source_upload_id: p.sourceUploadId != null ? String(p.sourceUploadId).trim() || null : null,
    confidence: 1,
  };
  if (
    Array.isArray(p.imageEmbedding) &&
    p.imageEmbedding.length > 0 &&
    p.imageEmbedding.every((x) => Number.isFinite(Number(x)))
  ) {
    row.image_embedding = `[${p.imageEmbedding.map((x) => Number(x)).join(",")}]`;
    row.embedding_model = p.embeddingModel != null ? String(p.embeddingModel).trim() || null : null;
    row.embedding_version = p.embeddingVersion != null ? String(p.embeddingVersion).trim() || null : null;
    row.embedding_descriptor =
      p.embeddingDescriptor != null ? String(p.embeddingDescriptor).trim().slice(0, 600) || null : null;
  }

  const { data, error } = await supabase
    .from("global_object_baselines")
    .upsert(row, { onConflict: "image_sha256" })
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return data?.id ? { id: String(data.id) } : null;
}

/**
 * Phase 2E: lock a group's consolidated scores across all its rows.
 *
 * @param {object} p
 * @param {string} p.objectGroupId
 * @param {Record<string, number>} p.lockedAxisScores
 * @param {string|null} p.peakPowerKey
 * @param {number} p.viewCount
 * @returns {Promise<void>}
 */
export async function lockObjectGroupEnrollment(p) {
  const gid = String(p?.objectGroupId || "").trim();
  if (!gid) return;
  const { error } = await supabase
    .from("global_object_baselines")
    .update({
      is_enrolled: true,
      view_count: Math.max(1, Math.floor(Number(p.viewCount) || 1)),
      locked_axis_scores_json: p.lockedAxisScores && typeof p.lockedAxisScores === "object" ? p.lockedAxisScores : null,
      peak_power_key: p.peakPowerKey != null ? String(p.peakPowerKey).trim() || null : undefined,
    })
    .eq("object_group_id", gid);
  if (error) throw error;
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
