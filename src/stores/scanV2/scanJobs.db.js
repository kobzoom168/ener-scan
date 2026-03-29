import { supabase } from "../../config/supabase.js";

/**
 * @param {object} row
 * @returns {Promise<{ id: string } | null>}
 */
export async function insertScanJob(row) {
  const { data, error } = await supabase
    .from("scan_jobs")
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
export async function claimNextScanJob(workerId) {
  const { data, error } = await supabase.rpc("claim_next_scan_job", {
    p_worker_id: workerId,
  });

  if (error) throw error;
  if (data == null) return null;
  return Array.isArray(data) ? data[0] ?? null : data;
}

/**
 * @param {string} id
 * @returns {Promise<object | null>}
 */
export async function getScanJobById(id) {
  const { data, error } = await supabase
    .from("scan_jobs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * @param {string} id
 * @param {object} patch
 */
export async function updateScanJob(id, patch) {
  const { error } = await supabase.from("scan_jobs").update(patch).eq("id", id);
  if (error) throw error;
}
