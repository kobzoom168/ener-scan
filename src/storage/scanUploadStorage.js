import crypto from "crypto";
import { supabase } from "../config/supabase.js";
import { env } from "../config/env.js";

/**
 * @param {Buffer} buffer
 * @returns {string}
 */
function sha256Hex(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Upload scan image bytes to Supabase Storage (bucket from env).
 * @param {object} opts
 * @param {string} opts.lineUserId
 * @param {string} opts.lineMessageId
 * @param {Buffer} opts.buffer
 * @param {string} [opts.mimeType]
 * @returns {Promise<{ bucket: string, path: string, mimeType: string, sizeBytes: number, sha256: string }>}
 */
export async function uploadScanImageToStorage({
  lineUserId,
  lineMessageId,
  buffer,
  mimeType = "image/jpeg",
}) {
  const bucket = env.SCAN_V2_UPLOAD_BUCKET;
  const uid = String(lineUserId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || "unknown";
  const mid = String(lineMessageId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "msg";
  const path = `${uid}/${mid}-${Date.now()}.bin`;
  const body = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

  const { error } = await supabase.storage.from(bucket).upload(path, body, {
    contentType: mimeType,
    upsert: false,
  });

  if (error) {
    console.error(
      JSON.stringify({
        event: "SCAN_V2_STORAGE_UPLOAD_FAILED",
        bucket,
        pathPrefix: path.slice(0, 48),
        message: error.message,
      }),
    );
    throw error;
  }

  return {
    bucket,
    path,
    mimeType,
    sizeBytes: body.length,
    sha256: sha256Hex(body),
  };
}

/**
 * @param {string} bucket
 * @param {string} path
 * @returns {Promise<Buffer>}
 */
export async function readScanImageFromStorage(bucket, path) {
  const b = bucket || env.SCAN_V2_UPLOAD_BUCKET;
  const { data, error } = await supabase.storage.from(b).download(path);
  if (error) throw error;
  const ab = await data.arrayBuffer();
  return Buffer.from(ab);
}
