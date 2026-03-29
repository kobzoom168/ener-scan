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
