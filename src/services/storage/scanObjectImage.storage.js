import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, S3_ENABLED } from "../../config/s3Storage.js";
import { supabase } from "../../config/supabaseStorage.js";
import { env } from "../../config/env.js";

export function guessImageContentType(buffer) {
  if (!buffer || buffer.length < 3) return { contentType: "image/jpeg", ext: "jpg" };
  const [b0, b1, b2, b3] = buffer;
  if (b0 === 0xff && b1 === 0xd8) return { contentType: "image/jpeg", ext: "jpg" };
  if (b0 === 0x89 && b1 === 0x50 && b2 === 0x4e && b3 === 0x47) return { contentType: "image/png", ext: "png" };
  if (b0 === 0x47 && b1 === 0x49 && b2 === 0x46) return { contentType: "image/gif", ext: "gif" };
  if (b0 === 0x52 && b1 === 0x49 && b2 === 0x46 && b3 === 0x46) return { contentType: "image/webp", ext: "webp" };
  return { contentType: "image/jpeg", ext: "jpg" };
}

/**
 * Upload LINE scan object image for public HTML report.
 * Uses S3/R2 when configured, falls back to Supabase Storage.
 *
 * @param {object} params
 * @param {Buffer} params.buffer
 * @param {string} params.publicToken
 * @param {string} [params.lineUserId]
 * @returns {Promise<string|null>} public HTTPS URL or null on skip/failure
 */
export async function uploadScanObjectImageForReport({ buffer, publicToken, lineUserId = "" } = {}) {
  const bucket = env.SCAN_OBJECT_IMAGE_BUCKET;
  if (!bucket) {
    console.log(JSON.stringify({ event: "SCAN_OBJECT_IMAGE", outcome: "skipped_no_bucket" }));
    return null;
  }

  const tok = String(publicToken || "").trim();
  if (!tok) {
    console.warn(JSON.stringify({ event: "SCAN_OBJECT_IMAGE", outcome: "skipped_no_token" }));
    return null;
  }

  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    console.warn(JSON.stringify({ event: "SCAN_OBJECT_IMAGE", outcome: "skipped_empty_buffer" }));
    return null;
  }

  const uid = String(lineUserId || "").trim().slice(0, 64) || "anon";
  const { contentType, ext } = guessImageContentType(buffer);
  const objectPath = `${uid}/${tok}/object.${ext}`;

  try {
    let url = null;

    if (S3_ENABLED) {
      await s3Client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: objectPath,
        Body: buffer,
        ContentType: contentType,
      }));
      const base = String(env.S3_PUBLIC_BASE_URL || "").replace(/\/$/, "");
      url = base ? `${base}/${objectPath}` : null;
    } else {
      const { error: uploadError } = await supabase.storage.from(bucket).upload(objectPath, buffer, { contentType, upsert: true });
      if (uploadError) {
        console.error(JSON.stringify({ event: "SCAN_OBJECT_IMAGE", outcome: "upload_error", message: uploadError.message, code: uploadError.statusCode || uploadError.code }));
        return null;
      }
      const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(objectPath);
      url = publicUrlData?.publicUrl || null;
    }

    console.log(JSON.stringify({ event: "SCAN_OBJECT_IMAGE", outcome: "ok", tokenPrefix: `${tok.slice(0, 12)}…`, contentType }));
    return url;
  } catch (err) {
    console.error(JSON.stringify({ event: "SCAN_OBJECT_IMAGE", outcome: "exception", message: err?.message }));
    return null;
  }
}
