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

  // Supabase RPC can return a NULL composite that is deserialized into an object
  // whose fields are all `null` (or sometimes string "null"). Normalize that to `null`
  // so the worker can treat it as "no job".
  const row = Array.isArray(data) ? (data[0] ?? null) : data;
  if (row == null) return null;

  const norm = (v) => {
    if (v == null) return null;
    if (typeof v === "string" && v.trim().toLowerCase() === "null") return null;
    return v;
  };

  if (typeof row === "object" && row !== null) {
    const id = norm(row.id);
    const lineUserId = norm(row.line_user_id);
    const appUserId = norm(row.app_user_id);
    const uploadId = norm(row.upload_id);
    const status = norm(row.status);

    if (
      id == null &&
      lineUserId == null &&
      appUserId == null &&
      uploadId == null &&
      status == null
    ) {
      return null;
    }
  }

  return row;
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
