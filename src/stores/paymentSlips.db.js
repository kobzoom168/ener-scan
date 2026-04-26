import { supabase } from "../config/supabase.js";

/**
 * Upsert retention row when a slip image is stored (90-day default expiry).
 * @param {string} paymentId
 * @param {{ slipExpiresAtIso?: string, slipHash?: string | null }} [opts]
 */
export async function upsertPaymentSlipRetentionRow(paymentId, opts = {}) {
  const id = String(paymentId || "").trim();
  if (!id) throw new Error("payment_slips_missing_payment_id");

  const slipExpiresAtIso =
    opts.slipExpiresAtIso ||
    new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

  const row = {
    payment_id: id,
    slip_expires_at: slipExpiresAtIso,
    slip_hash: opts.slipHash != null ? String(opts.slipHash) : null,
  };

  const { error } = await supabase.from("payment_slips").upsert(row, {
    onConflict: "payment_id",
  });
  if (error) throw error;
  return true;
}

/**
 * Slip rows whose raw file should be removed (expires_at passed, not yet deleted).
 * @param {string} beforeIso
 * @param {number} [limit]
 * @returns {Promise<Array<{ payment_id: string, slip_expires_at: string }>>}
 */
export async function listPaymentSlipsExpiredBefore(beforeIso, limit = 80) {
  const lim = Math.min(500, Math.max(1, Math.floor(Number(limit)) || 80));
  const { data, error } = await supabase
    .from("payment_slips")
    .select("payment_id, slip_expires_at")
    .is("slip_deleted_at", null)
    .lt("slip_expires_at", beforeIso)
    .order("slip_expires_at", { ascending: true })
    .limit(lim);

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

/**
 * @param {string} paymentId
 */
export async function markPaymentSlipDeleted(paymentId) {
  const id = String(paymentId || "").trim();
  if (!id) return;
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("payment_slips")
    .update({ slip_deleted_at: nowIso })
    .eq("payment_id", id);
  if (error) throw error;
}
