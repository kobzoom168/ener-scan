import { S3_ENABLED } from "../../config/s3Storage.js";
import { supabase } from "../../config/supabaseStorage.js";
import { env } from "../../config/env.js";

/**
 * Public HTTPS URL for an object in the scan LINE upload bucket (`SCAN_V2_UPLOAD_BUCKET`).
 * @param {string} objectPath — storage path (no leading slash)
 * @returns {string}
 */
export function getScanUploadBucketPublicUrl(objectPath) {
  const path = String(objectPath || "")
    .trim()
    .replace(/^\/+/, "");
  if (!path) return "";

  if (S3_ENABLED) {
    const base = String(env.S3_PUBLIC_BASE_URL || "").replace(/\/$/, "");
    return base ? `${base}/${path}` : "";
  }

  const bucket = env.SCAN_V2_UPLOAD_BUCKET;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return String(data?.publicUrl || "").trim();
}
