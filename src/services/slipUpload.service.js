import { supabase } from "../config/supabase.js";

const BUCKET_NAME = process.env.PAYMENT_SLIP_BUCKET || "payment-slips";

/**
 * Upload LINE slip image to Supabase Storage.
 * @param {object} params
 * @param {Buffer} params.buffer
 * @param {string} params.lineUserId
 * @param {string} params.paymentId
 * @param {string} params.slipMessageId
 * @returns {Promise<string>} slipUrl
 */
export async function uploadSlipImageToStorage({
  buffer,
  lineUserId,
  paymentId,
  slipMessageId,
} = {}) {
  const lineUserIdStr = String(lineUserId || "").trim();
  const paymentIdStr = String(paymentId || "").trim();
  const slipMessageIdStr = String(slipMessageId || "").trim();

  if (!lineUserIdStr) throw new Error("uploadSlip_missing_lineUserId");
  if (!paymentIdStr) throw new Error("uploadSlip_missing_paymentId");
  if (!slipMessageIdStr) throw new Error("uploadSlip_missing_slipMessageId");
  if (!buffer || !Buffer.isBuffer(buffer)) throw new Error("uploadSlip_missing_buffer");

  const objectPath = `${lineUserIdStr}/${paymentIdStr}/${slipMessageIdStr}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(objectPath, buffer, {
      contentType: "image/jpeg",
      upsert: true,
    });

  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(objectPath);

  return publicUrlData?.publicUrl || null;
}

