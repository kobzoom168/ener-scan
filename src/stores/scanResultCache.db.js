/**
 * Persistent cache: perceptual image hash + normalized birthdate + prompt_version → result_text.
 * Optional columns: deterministic `object_category` / `dominant_color` (see migration).
 */
import { supabase } from "../config/supabase.js";
import { normalizeBirthdateForScan } from "../utils/webhookText.util.js";

/** Must match deep-scan prompt generation; bump when prompt/format contract changes. */
export const SCAN_CACHE_PROMPT_VERSION = "v12";

/** Back-compat accessor used by scan.service.js import. */
export function getScanCacheVersion() {
  return SCAN_CACHE_PROMPT_VERSION;
}

export function normalizeBirthdateCacheKey(birthdate) {
  return normalizeBirthdateForScan(String(birthdate || "").trim());
}

/**
 * Persist dominant color only when vision pipeline produced a usable slug (not `unknown`).
 * @param {string|undefined|null} slug
 * @param {string|undefined|null} source
 * @returns {boolean}
 */
export function shouldPersistDominantColorForCache(slug, source) {
  if (String(source || "").trim() !== "vision_v1") return false;
  const s = String(slug ?? "").trim().toLowerCase();
  return s.length > 0 && s !== "unknown";
}

/**
 * Cache hit may reuse `object_category` when the row has a non-empty value (any accepted source).
 * @param {CachedScanRow|Record<string, unknown>|null|undefined} row
 * @returns {boolean}
 */
export function cacheRowHasPersistedObjectCategory(row) {
  if (!row) return false;
  const oc = row.object_category;
  return oc != null && String(oc).trim() !== "";
}

/**
 * Reuse persisted dominant color only when stored as vision_v1 and slug is not `unknown`.
 * @param {CachedScanRow|Record<string, unknown>|null|undefined} row
 * @returns {boolean}
 */
export function cacheRowHasPersistedDominantColor(row) {
  if (!row) return false;
  const dc = row.dominant_color;
  const src = row.dominant_color_source;
  if (dc == null || String(dc).trim() === "") return false;
  if (String(src || "").trim() !== "vision_v1") return false;
  return String(dc).trim().toLowerCase() !== "unknown";
}

/**
 * @typedef {Object} CachedScanRow
 * @property {string} id
 * @property {string} result_text
 * @property {string | null} object_type
 * @property {string | null} [object_category]
 * @property {string | null} [object_category_source]
 * @property {string | null} [dominant_color]
 * @property {string | null} [dominant_color_source]
 */

/**
 * @returns {Promise<CachedScanRow | null>}
 */
export async function getCachedScanResult({
  imageHash,
  birthdate,
  promptVersion = SCAN_CACHE_PROMPT_VERSION,
} = {}) {
  const h = String(imageHash || "").trim();
  const b = normalizeBirthdateCacheKey(birthdate);
  const pv = String(promptVersion || SCAN_CACHE_PROMPT_VERSION).trim();
  if (!h || !b || !pv) return null;

  const { data, error } = await supabase
    .from("scan_result_cache")
    .select(
      "id, result_text, object_type, object_category, object_category_source, dominant_color, dominant_color_source",
    )
    .eq("image_hash", h)
    .eq("birthdate", b)
    .eq("prompt_version", pv)
    .maybeSingle();

  if (error) {
    console.error("[SCAN_CACHE] getCachedScanResult error:", {
      message: error.message,
      code: error.code,
    });
    throw error;
  }
  if (!data?.id || !data.result_text) return null;
  return {
    id: String(data.id),
    result_text: String(data.result_text),
    object_type: data.object_type != null ? String(data.object_type) : null,
    object_category:
      data.object_category != null ? String(data.object_category) : null,
    object_category_source:
      data.object_category_source != null
        ? String(data.object_category_source)
        : null,
    dominant_color:
      data.dominant_color != null ? String(data.dominant_color) : null,
    dominant_color_source:
      data.dominant_color_source != null
        ? String(data.dominant_color_source)
        : null,
  };
}

/**
 * Insert new cache row (ignore unique violation on race).
 * @param {object} p
 * @param {string} [p.objectCategory]
 * @param {"deep_scan"|"cache_classify"} [p.objectCategorySource]
 * @param {string} [p.dominantColor]
 * @param {"vision_v1"} [p.dominantColorSource]
 */
export async function saveCachedScanResult({
  imageHash,
  birthdate,
  resultText,
  objectType = "single_supported",
  promptVersion = SCAN_CACHE_PROMPT_VERSION,
  objectCategory = null,
  objectCategorySource = null,
  dominantColor = null,
  dominantColorSource = null,
} = {}) {
  const h = String(imageHash || "").trim();
  const b = normalizeBirthdateCacheKey(birthdate);
  const text = String(resultText || "").trim();
  const pv = String(promptVersion || SCAN_CACHE_PROMPT_VERSION).trim();
  if (!h || !b || !text || !pv) return null;

  /** @type {Record<string, unknown>} */
  const payload = {
    image_hash: h,
    birthdate: b,
    prompt_version: pv,
    result_text: text,
    object_type: objectType != null ? String(objectType) : null,
    hit_count: 0,
    last_hit_at: null,
  };

  const oc = objectCategory != null ? String(objectCategory).trim() : "";
  if (oc) {
    payload.object_category = oc;
    payload.object_category_source = String(
      objectCategorySource || "deep_scan",
    ).trim();
  }

  if (shouldPersistDominantColorForCache(dominantColor, dominantColorSource)) {
    payload.dominant_color = String(dominantColor).trim().toLowerCase();
    payload.dominant_color_source = "vision_v1";
  }

  const { data, error } = await supabase
    .from("scan_result_cache")
    .insert(payload)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      console.log("[SCAN_CACHE] save skipped (duplicate key)", {
        imageHash: h.slice(0, 16),
      });
      return null;
    }
    console.error("[SCAN_CACHE] saveCachedScanResult error:", {
      message: error.message,
      code: error.code,
    });
    throw error;
  }
  return data?.id ? String(data.id) : null;
}

/**
 * Best-effort: fill missing deterministic signals on an existing cache row (e.g. old rows pre-migration).
 * @param {string} cacheId
 * @param {object} fields
 */
export async function updateCachedScanSignals(cacheId, fields = {}) {
  const id = String(cacheId || "").trim();
  if (!id) return;

  /** @type {Record<string, unknown>} */
  const patch = {};
  if (fields.objectCategory != null && String(fields.objectCategory).trim()) {
    patch.object_category = String(fields.objectCategory).trim();
    patch.object_category_source = String(
      fields.objectCategorySource || "cache_classify",
    ).trim();
  }
  if (
    shouldPersistDominantColorForCache(
      fields.dominantColor,
      fields.dominantColorSource,
    )
  ) {
    patch.dominant_color = String(fields.dominantColor).trim().toLowerCase();
    patch.dominant_color_source = "vision_v1";
  }
  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase
    .from("scan_result_cache")
    .update(patch)
    .eq("id", id);
  if (error) {
    console.error("[SCAN_CACHE] updateCachedScanSignals failed (ignored):", {
      message: error.message,
      idPrefix: id.slice(0, 8),
    });
  }
}

export async function markCachedScanHit(cacheId) {
  const id = String(cacheId || "").trim();
  if (!id) return;

  const nowIso = new Date().toISOString();
  const { data: row, error: rErr } = await supabase
    .from("scan_result_cache")
    .select("hit_count")
    .eq("id", id)
    .maybeSingle();
  if (rErr) {
    console.error("[SCAN_CACHE] markCachedScanHit read failed:", rErr.message);
    return;
  }
  const next = (Number(row?.hit_count) || 0) + 1;
  const { error: uErr } = await supabase
    .from("scan_result_cache")
    .update({ hit_count: next, last_hit_at: nowIso })
    .eq("id", id);
  if (uErr) {
    console.error("[SCAN_CACHE] markCachedScanHit update failed:", uErr.message);
  }
}
