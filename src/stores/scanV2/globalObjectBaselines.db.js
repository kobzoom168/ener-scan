import { supabase } from "../../config/supabase.js";

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
 * @param {string} imageSha256Hex
 * @returns {Promise<{ id: string, object_baseline_json: unknown } | null>}
 */
export async function findGlobalObjectBaselineBySha256(imageSha256Hex) {
  const sha = String(imageSha256Hex || "")
    .trim()
    .toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sha)) return null;

  const { data, error } = await supabase
    .from("global_object_baselines")
    .select("id, object_baseline_json")
    .eq("image_sha256", sha)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) return null;
  return { id: String(data.id), object_baseline_json: data.object_baseline_json };
}
