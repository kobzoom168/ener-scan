import { S3_ENABLED } from "../../config/s3Storage.js";
import { env } from "../../config/env.js";

function getScanUploadPublicUrl(path) {
  // Use scan-uploads specific public URL if set, fallback to general S3_PUBLIC_BASE_URL
  const base = String(env.S3_UPLOAD_PUBLIC_BASE_URL || env.S3_PUBLIC_BASE_URL || "").replace(/\/$/, "");
  return base && path ? `${base}/${path}` : "";
}

/**
 * Time-limited HTTPS URL for an object in the scan upload bucket.
 * R2/S3 only (public bucket → public URL) — Supabase storage retired Jul 2026.
 *
 * @param {string} objectPath — storage path (no leading slash)
 * @param {number} [expiresInSeconds] — kept for call-site compatibility (ignored for R2 public URLs)
 * @returns {Promise<string>} URL or "" on failure
 */
export async function createScanUploadBucketSignedUrl(
  objectPath,
  expiresInSeconds = 86400,
) {
  void expiresInSeconds;
  const path = String(objectPath || "")
    .trim()
    .replace(/^\/+/, "");
  if (!path || !S3_ENABLED) return "";
  return getScanUploadPublicUrl(path);
}

/**
 * Batch URLs for many paths.
 * @param {string[]} paths
 * @param {number} [expiresInSeconds]
 * @returns {Promise<Map<string, string>>} path → HTTPS URL (only successful entries)
 */
export async function createScanUploadBucketSignedUrls(
  paths,
  expiresInSeconds = 86400,
) {
  void expiresInSeconds;
  const raw = Array.isArray(paths) ? paths : [];
  const cleaned = [
    ...new Set(
      raw
        .map((p) => String(p || "").trim().replace(/^\/+/, ""))
        .filter(Boolean),
    ),
  ];
  /** @type {Map<string, string>} */
  const out = new Map();
  if (!cleaned.length || !S3_ENABLED) return out;
  for (const p of cleaned) {
    const url = getScanUploadPublicUrl(p);
    if (url && /^https?:\/\//i.test(url)) out.set(p, url);
  }
  return out;
}
