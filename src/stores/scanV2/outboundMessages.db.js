import { supabase } from "../../config/supabase.js";

/**
 * @param {object} row
 * @returns {Promise<{ id: string } | null>}
 */
export async function insertOutboundMessage(row) {
  const { data, error } = await supabase
    .from("outbound_messages")
    .insert(row)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * @param {string} workerId
 * @returns {Promise<object | null>}
 */
export async function claimNextOutboundMessage(workerId) {
  const { data, error } = await supabase.rpc("claim_next_outbound_message", {
    p_worker_id: workerId,
  });

  if (error) throw error;
  if (data == null) return null;
  return Array.isArray(data) ? data[0] ?? null : data;
}

/**
 * @param {string} id
 * @param {object} patch
 */
export async function updateOutboundMessage(id, patch) {
  const { error } = await supabase
    .from("outbound_messages")
    .update(patch)
    .eq("id", id);

  if (error) throw error;
}

/**
 * Active = not yet terminal (sent/failed/dead).
 * @param {string} paymentId UUID
 * @param {string} kind
 * @returns {Promise<{ id: string, status: string } | null>}
 */
export async function findActiveOutboundByPaymentAndKind(paymentId, kind) {
  const pid = String(paymentId || "").trim();
  if (!pid) return null;

  const { data, error } = await supabase
    .from("outbound_messages")
    .select("id,status")
    .eq("related_payment_id", pid)
    .eq("kind", kind)
    .in("status", ["queued", "sending", "retry_wait"])
    .maybeSingle();

  if (error) throw error;
  return data;
}
