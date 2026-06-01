import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, S3_ENABLED } from "../config/s3Storage.js";
import { supabase } from "../config/supabaseStorage.js";
import { env } from "../config/env.js";

const BUCKET = env.PAYMENT_SLIP_BUCKET || "payment-slips";

/**
 * Upload LINE slip image to object storage (R2/S3 primary, Supabase fallback).
 * @param {object} params
 * @param {Buffer} params.buffer
 * @param {string} params.lineUserId
 * @param {string} params.paymentId
 * @param {string} params.slipMessageId
 * @returns {Promise<string|null>} slipUrl
 */
export async function uploadSlipImageToStorage({ buffer, lineUserId, paymentId, slipMessageId } = {}) {
  const uid = String(lineUserId || "").trim();
  const pid = String(paymentId || "").trim();
  const mid = String(slipMessageId || "").trim();

  if (!uid) throw new Error("uploadSlip_missing_lineUserId");
  if (!pid) throw new Error("uploadSlip_missing_paymentId");
  if (!mid) throw new Error("uploadSlip_missing_slipMessageId");
  if (!buffer || !Buffer.isBuffer(buffer)) throw new Error("uploadSlip_missing_buffer");

  const objectPath = `${uid}/${pid}/${mid}.jpg`;

  if (S3_ENABLED) {
    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: objectPath,
      Body: buffer,
      ContentType: "image/jpeg",
    }));
    const base = String(env.S3_SLIP_PUBLIC_BASE_URL || env.S3_PUBLIC_BASE_URL || "").replace(/\/$/, "");
    return base ? `${base}/${objectPath}` : null;
  }

  // Supabase fallback (remove after migration complete)
  const { error } = await supabase.storage.from(BUCKET).upload(objectPath, buffer, { contentType: "image/jpeg", upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
  return data?.publicUrl || null;
}
