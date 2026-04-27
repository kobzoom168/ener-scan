import sharp from "sharp";
import { uploadScanUploadThumbnail } from "../../storage/scanUploadStorage.js";
import { updateScanUploadThumbnailPath } from "../../stores/scanV2/scanUploads.db.js";

const LONG_EDGE_PX = 512;
const WEBP_QUALITY = 80;

/**
 * Build WebP thumbnail bytes from original scan image bytes (long edge ~512px).
 *
 * @param {Buffer} imageBuffer
 * @param {typeof sharp} [sharpFactory]
 * @returns {Promise<Buffer>}
 */
export async function encodeScanUploadThumbnailWebp(imageBuffer, sharpFactory = sharp) {
  return sharpFactory(imageBuffer)
    .rotate()
    .resize({
      width: LONG_EDGE_PX,
      height: LONG_EDGE_PX,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
}

/**
 * After original bytes are in storage, generate a long-retention WebP thumb, upload under
 * `{lineUserId}/{uploadId}/thumb.webp`, and persist `scan_uploads.thumbnail_path`.
 * Never throws; failures are logged and the scan pipeline must continue.
 *
 * @param {object} opts
 * @param {object} opts.upload — row from `getScanUploadById` (`id`, `thumbnail_path`, `storage_path`)
 * @param {string} opts.lineUserId
 * @param {Buffer} opts.imageBuffer — original LINE image bytes
 * @param {object} [opts.deps] — optional overrides for tests (`sharpFactory`, `uploadThumbnail`, `updateThumbnailPath`, `encodeWebp`)
 * @returns {Promise<string|null>} storage path written, or null
 */
export async function ensureScanUploadThumbnail({
  upload,
  lineUserId,
  imageBuffer,
  deps = {},
} = {}) {
  const uploadId = String(upload?.id || "").trim();
  const uid = String(lineUserId || "").trim();
  if (!uploadId || !uid || !imageBuffer || !Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    return null;
  }

  const existing = String(upload?.thumbnail_path || "").trim();
  if (existing) return existing;

  const sharpFactory = deps.sharpFactory ?? sharp;
  const uploadThumbnail = deps.uploadThumbnail ?? uploadScanUploadThumbnail;
  const updateThumbnailPath = deps.updateThumbnailPath ?? updateScanUploadThumbnailPath;
  const encodeWebp = deps.encodeWebp ?? encodeScanUploadThumbnailWebp;

  let webpBuffer;
  try {
    webpBuffer = await encodeWebp(imageBuffer, sharpFactory);
  } catch (e) {
    console.warn(
      JSON.stringify({
        event: "SCAN_UPLOAD_THUMB_ENCODE_WARN",
        uploadIdPrefix: uploadId.slice(0, 8),
        message: String(e?.message || e).slice(0, 240),
      }),
    );
    return null;
  }

  if (!webpBuffer?.length) return null;

  try {
    const { path } = await uploadThumbnail({
      lineUserId: uid,
      uploadId,
      buffer: webpBuffer,
      contentType: "image/webp",
    });
    const thumbPath = String(path || "").trim();
    const origPath = String(upload?.storage_path || "").trim();
    if (thumbPath && origPath && thumbPath === origPath) {
      console.warn(
        JSON.stringify({
          event: "SCAN_UPLOAD_THUMB_PATH_COLLISION_SKIP",
          uploadIdPrefix: uploadId.slice(0, 8),
        }),
      );
      return null;
    }
    if (!thumbPath) return null;
    await updateThumbnailPath(uploadId, thumbPath);
    return thumbPath;
  } catch (e) {
    console.warn(
      JSON.stringify({
        event: "SCAN_UPLOAD_THUMB_PERSIST_WARN",
        uploadIdPrefix: uploadId.slice(0, 8),
        message: String(e?.message || e).slice(0, 240),
      }),
    );
    return null;
  }
}
