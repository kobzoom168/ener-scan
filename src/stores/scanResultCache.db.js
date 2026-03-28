/**
 * Persistent cache: perceptual image hash + normalized birthdate + prompt_version → result_text.
 */
import { supabase } from "../config/supabase.js";
import { normalizeBirthdateForScan } from "../utils/webhookText.util.js";

/** Must match deep-scan prompt generation; bump when prompt/format contract changes. */
export const SCAN_CACHE_PROMPT_VERSION = "v10";

/** Back-compat accessor used by scan.service.js import. */
export function getScanCacheVersion() {
  return SCAN_CACHE_PROMPT_VERSION;
}

export function normalizeBirthdateCacheKey(birthdate) {
  return normalizeBirthdateForScan(String(birthdate || "").trim());
}

/**
 * @returns {Promise<{ id: string, result_text: string, object_type: string | null } | null>}
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
    .select("id, result_text, object_type")
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
  };
}

/**
 * Insert new cache row (ignore unique violation on race).
 */
export async function saveCachedScanResult({
  imageHash,
  birthdate,
  resultText,
  objectType = "single_supported",
  promptVersion = SCAN_CACHE_PROMPT_VERSION,
} = {}) {
  const h = String(imageHash || "").trim();
  const b = normalizeBirthdateCacheKey(birthdate);
  const text = String(resultText || "").trim();
  const pv = String(promptVersion || SCAN_CACHE_PROMPT_VERSION).trim();
  if (!h || !b || !text || !pv) return null;

  const payload = {
    image_hash: h,
    birthdate: b,
    prompt_version: pv,
    result_text: text,
    object_type: objectType != null ? String(objectType) : null,
    hit_count: 0,
    last_hit_at: null,
  };

  const { data, error } = await supabase
    .from("scan_result_cache")
    .insert(payload)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      console.log("[SCAN_CACHE] save skipped (duplicate key)", { imageHash: h.slice(0, 16) });
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
