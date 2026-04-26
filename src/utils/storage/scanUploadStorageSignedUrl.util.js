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
