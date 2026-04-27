import { createScanUploadBucketSignedUrl } from "../storage/scanUploadStorageSignedUrl.util.js";

/**
 * Library card image: signed URL for `thumbnail_path` → report `objectImageUrl` → empty.
 * Never uses getPublicUrl for storage paths (bucket may be private).
 *
 * @param {string|null|undefined} thumbnailPathOrUrl — `scan_uploads.thumbnail_path` (storage path or full URL)
 * @param {string} objectImageUrl — HTTPS object image from report payload (fallback)
 * @param {{ createSignedUrlForPath?: (path: string) => Promise<string> }} [deps] — tests only
 * @returns {Promise<string>}
 */
export async function resolveSacredAmuletLibraryThumbUrl(
  thumbnailPathOrUrl,
  objectImageUrl,
  deps = {},
) {
  const ttl =
    deps.expiresInSeconds !== undefined ? deps.expiresInSeconds : 86400;
  const createSigned =
    deps.createSignedUrlForPath ??
    ((/** @type {string} */ p) => createScanUploadBucketSignedUrl(p, ttl));

  const thumbRaw = String(thumbnailPathOrUrl || "").trim();
  if (thumbRaw) {
    if (/^https?:\/\//i.test(thumbRaw)) return thumbRaw;
    const signed = String((await createSigned(thumbRaw)) || "").trim();
    if (signed && /^https?:\/\//i.test(signed)) return signed;
  }

  const obj = String(objectImageUrl || "").trim();
  if (/^https?:\/\//i.test(obj)) return obj;
  return "";
}
