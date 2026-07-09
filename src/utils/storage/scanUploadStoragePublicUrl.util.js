import { S3_ENABLED } from "../../config/s3Storage.js";
import { env } from "../../config/env.js";

/**
 * Public HTTPS URL for an object in the scan LINE upload bucket (`SCAN_V2_UPLOAD_BUCKET`).
 * R2/S3 only — Supabase storage retired Jul 2026.
 * @param {string} objectPath — storage path (no leading slash)
 * @returns {string}
 */
export function getScanUploadBucketPublicUrl(objectPath) {
  const path = String(objectPath || "")
    .trim()
    .replace(/^\/+/, "");
  if (!path) return "";
  if (!S3_ENABLED) return "";
  const base = String(env.S3_PUBLIC_BASE_URL || "").replace(/\/$/, "");
  return base ? `${base}/${path}` : "";
}
