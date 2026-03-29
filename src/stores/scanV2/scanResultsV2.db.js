import { supabase } from "../../config/supabase.js";

/**
 * @param {object} row
 * @returns {Promise<{ id: string } | null>}
 */
export async function insertScanResultV2(row) {
  const { data, error } = await supabase
    .from("scan_results_v2")
    .insert(row)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * @param {string} scanJobId
 * @returns {Promise<object | null>}
 */
export async function getScanResultV2ByJobId(scanJobId) {
  const { data, error } = await supabase
    .from("scan_results_v2")
    .select("*")
    .eq("scan_job_id", scanJobId)
    .maybeSingle();

  if (error) throw error;
  return data;
}
