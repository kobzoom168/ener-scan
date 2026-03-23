import { supabase } from "../../config/supabase.js";
import { env } from "../../config/env.js";

/**
 * @param {Buffer} buffer
 * @returns {{ contentType: string, ext: string }}
 */
export function guessImageContentType(buffer) {
  if (!buffer || buffer.length < 3) {
    return { contentType: "image/jpeg", ext: "jpg" };
  }
  const b0 = buffer[0];
  const b1 = buffer[1];
  const b2 = buffer[2];
  const b3 = buffer[3];
  if (b0 === 0xff && b1 === 0xd8) {
    return { contentType: "image/jpeg", ext: "jpg" };
  }
  if (b0 === 0x89 && b1 === 0x50 && b2 === 0x4e && b3 === 0x47) {
    return { contentType: "image/png", ext: "png" };
  }
  if (b0 === 0x47 && b1 === 0x49 && b2 === 0x46) {
    return { contentType: "image/gif", ext: "gif" };
  }
  if (b0 === 0x52 && b1 === 0x49 && b2 === 0x46 && b3 === 0x46) {
    return { contentType: "image/webp", ext: "webp" };
  }
  return { contentType: "image/jpeg", ext: "jpg" };
}

/**
 * Upload LINE scan object image for public HTML report (same pattern as payment slip storage).
 * Path keyed by report publicToken so URL does not expose internal scan_result UUIDs.
 *
 * @param {object} params
 * @param {Buffer} params.buffer
 * @param {string} params.publicToken — report public token (unique, URL-safe)
 * @param {string} [params.lineUserId] — optional segment for namespacing
 * @returns {Promise<string|null>} public HTTPS URL or null on skip/failure
 */
export async function uploadScanObjectImageForReport({
  buffer,
  publicToken,
  lineUserId = "",
} = {}) {
  const bucket = env.SCAN_OBJECT_IMAGE_BUCKET;
  if (!bucket) {
    console.log(
      JSON.stringify({
        event: "SCAN_OBJECT_IMAGE",
        outcome: "skipped_no_bucket",
      }),
    );
    return null;
  }

  const tok = String(publicToken || "").trim();
  if (!tok) {
    console.warn(
      JSON.stringify({
        event: "SCAN_OBJECT_IMAGE",
        outcome: "skipped_no_token",
      }),
    );
    return null;
  }

  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    console.warn(
      JSON.stringify({
        event: "SCAN_OBJECT_IMAGE",
        outcome: "skipped_empty_buffer",
      }),
    );
    return null;
  }

  const uid = String(lineUserId || "").trim().slice(0, 64) || "anon";
  const { contentType, ext } = guessImageContentType(buffer);
  const objectPath = `${uid}/${tok}/object.${ext}`;

  try {
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(objectPath, buffer, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      console.error(
        JSON.stringify({
          event: "SCAN_OBJECT_IMAGE",
          outcome: "upload_error",
          message: uploadError.message,
          code: uploadError.statusCode || uploadError.code,
        }),
      );
      return null;
    }

    const { data: publicUrlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(objectPath);

    const url = publicUrlData?.publicUrl || null;
    console.log(
      JSON.stringify({
        event: "SCAN_OBJECT_IMAGE",
        outcome: "ok",
        tokenPrefix: `${tok.slice(0, 12)}…`,
        contentType,
      }),
    );
    return url;
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "SCAN_OBJECT_IMAGE",
        outcome: "exception",
        message: err?.message,
      }),
    );
    return null;
  }
}
