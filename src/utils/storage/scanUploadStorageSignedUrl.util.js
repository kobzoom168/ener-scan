import { supabase } from "../../config/supabase.js";
import { env } from "../../config/env.js";

/**
 * Time-limited HTTPS URL for an object in the scan upload bucket (private bucket safe).
 * Uses the service-role Supabase client.
 *
 * @param {string} objectPath — storage path (no leading slash)
 * @param {number} [expiresInSeconds] — default 24h
 * @returns {Promise<string>} signed URL or "" on failure
 */
export async function createScanUploadBucketSignedUrl(
  objectPath,
  expiresInSeconds = 86400,
) {
  const path = String(objectPath || "")
    .trim()
    .replace(/^\/+/, "");
  if (!path) return "";

  const ttl = Math.min(604800, Math.max(60, Math.floor(Number(expiresInSeconds) || 86400)));
  const bucket = env.SCAN_V2_UPLOAD_BUCKET;

  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, ttl);

    if (error) {
      console.warn(
        JSON.stringify({
          event: "SCAN_UPLOAD_BUCKET_SIGNED_URL_FAIL",
          bucket,
          pathPrefix: path.slice(0, 80),
          message: String(error?.message || error).slice(0, 240),
        }),
      );
      return "";
    }

    const url = String(data?.signedUrl || "").trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      console.warn(
        JSON.stringify({
          event: "SCAN_UPLOAD_BUCKET_SIGNED_URL_EMPTY",
          bucket,
          pathPrefix: path.slice(0, 80),
        }),
      );
      return "";
    }
    return url;
  } catch (e) {
    console.warn(
      JSON.stringify({
        event: "SCAN_UPLOAD_BUCKET_SIGNED_URL_EXCEPTION",
        bucket,
        pathPrefix: path.slice(0, 80),
        message: String(e?.message || e).slice(0, 240),
      }),
    );
    return "";
  }
}

const SIGNED_URLS_MAX_CHUNK = 100;

/**
 * Batch signed URLs for many paths in one (or few) HTTP calls.
 * @param {string[]} paths — storage paths (deduped by caller optional)
 * @param {number} [expiresInSeconds]
 * @returns {Promise<Map<string, string>>} path → HTTPS signed URL (only successful entries)
 */
export async function createScanUploadBucketSignedUrls(
  paths,
  expiresInSeconds = 86400,
) {
  const raw = Array.isArray(paths) ? paths : [];
  const cleaned = [
    ...new Set(
      raw
        .map((p) => String(p || "").trim().replace(/^\/+/, ""))
        .filter(Boolean),
    ),
  ];
  if (!cleaned.length) return new Map();

  const ttl = Math.min(604800, Math.max(60, Math.floor(Number(expiresInSeconds) || 86400)));
  const bucket = env.SCAN_V2_UPLOAD_BUCKET;
  /** @type {Map<string, string>} */
  const out = new Map();

  try {
    for (let i = 0; i < cleaned.length; i += SIGNED_URLS_MAX_CHUNK) {
      const chunk = cleaned.slice(i, i + SIGNED_URLS_MAX_CHUNK);
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrls(chunk, ttl);

      if (error) {
        console.warn(
          JSON.stringify({
            event: "SCAN_UPLOAD_BUCKET_SIGNED_URLS_BATCH_FAIL",
            bucket,
            chunkSize: chunk.length,
            message: String(error?.message || error).slice(0, 240),
          }),
        );
        continue;
      }
      if (!Array.isArray(data)) continue;
      for (const row of data) {
        const p = String(row?.path || "").trim();
        const u = String(row?.signedUrl || row?.signedURL || "").trim();
        if (row?.error && p) {
          console.warn(
            JSON.stringify({
              event: "SCAN_UPLOAD_BUCKET_SIGNED_URLS_ROW_FAIL",
              bucket,
              pathPrefix: p.slice(0, 80),
              message: String(row.error?.message || row.error).slice(0, 200),
            }),
          );
        }
        if (p && u && /^https?:\/\//i.test(u)) out.set(p, u);
      }
    }
    return out;
  } catch (e) {
    console.warn(
      JSON.stringify({
        event: "SCAN_UPLOAD_BUCKET_SIGNED_URLS_EXCEPTION",
        bucket,
        pathCount: cleaned.length,
        message: String(e?.message || e).slice(0, 240),
      }),
    );
    return out;
  }
}
