import { getScanUploadBucketPublicUrl } from "../storage/scanUploadStoragePublicUrl.util.js";

/**
 * Library card image: long-retention thumbnail URL → report object image → empty.
 *
 * @param {string|null|undefined} thumbnailPathOrUrl — `scan_uploads.thumbnail_path` (storage path or full URL)
 * @param {string} objectImageUrl — `norm.object.objectImageUrl` when already HTTPS
 * @param {(path: string) => string} [pathToPublicUrl] — override for tests (default: scan upload bucket)
 * @returns {string}
 */
export function resolveSacredAmuletLibraryThumbUrl(
  thumbnailPathOrUrl,
  objectImageUrl,
  pathToPublicUrl = getScanUploadBucketPublicUrl,
) {
  const thumbRaw = String(thumbnailPathOrUrl || "").trim();
  if (thumbRaw) {
    if (/^https?:\/\//i.test(thumbRaw)) return thumbRaw;
    const pub = String(pathToPublicUrl(thumbRaw) || "").trim();
    if (pub && /^https?:\/\//i.test(pub)) return pub;
  }
  const obj = String(objectImageUrl || "").trim();
  if (/^https?:\/\//i.test(obj)) return obj;
  return "";
}
