import { supabase } from "../../config/supabase.js";
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
  const bucket = env.SCAN_V2_UPLOAD_BUCKET;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return String(data?.publicUrl || "").trim();
}
