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
 * Debounce window: the user's queued job still waiting for its process_after
 * (images arriving now should attach to it, not create a new job/score).
 * @param {string} lineUserId
 * @returns {Promise<object | null>}
 */
export async function findPendingDebounceJobForUser(lineUserId) {
  const uid = String(lineUserId || "").trim();
  if (!uid) return null;
  const { data, error } = await supabase
    .from("scan_jobs")
    .select("id, extra_upload_ids, process_after, status")
    .eq("line_user_id", uid)
    .eq("status", "queued")
    .gt("process_after", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data || null;
}

/**
 * Attach an extra upload (another photo in the same debounce window) to a job.
 * @param {string} jobId
 * @param {string} uploadId
 * @param {string[]} currentExtras
 */
export async function appendExtraUploadToScanJob(jobId, uploadId, currentExtras) {
  const extras = Array.isArray(currentExtras) ? [...currentExtras] : [];
  extras.push(String(uploadId));
  const { error } = await supabase
    .from("scan_jobs")
    .update({ extra_upload_ids: extras, updated_at: new Date().toISOString() })
    .eq("id", String(jobId));
  if (error) throw error;
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

/**
 * Fetch `upload_id` by `scan_jobs.id` for a user.
 *
 * @param {string[]} scanJobIds
 * @param {string} lineUserId
 * @returns {Promise<Array<{ id: string, upload_id: string | null }>>}
 */
export async function listScanJobsUploadIdsByIds(scanJobIds, lineUserId) {
  const ids = Array.from(
    new Set(
      (Array.isArray(scanJobIds) ? scanJobIds : [])
        .map((x) => String(x || "").trim())
        .filter(Boolean),
    ),
  );
  const uid = String(lineUserId || "").trim();
  if (!ids.length || !uid) return [];

  const { data, error } = await supabase
    .from("scan_jobs")
    .select("id, upload_id")
    .eq("line_user_id", uid)
    .in("id", ids);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}
