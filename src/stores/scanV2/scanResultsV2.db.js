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

/**
 * Recent scan rows for a LINE user (service role; server-only).
 * Used to build “คลังพลัง” summaries — payload shape varies by lane.
 *
 * @param {string} lineUserId
 * @param {number} [limit]
 * @returns {Promise<Array<{ id: string, scan_job_id?: string | null, created_at?: string, report_payload_json?: unknown, html_public_token?: string | null }>>}
 */
export async function listScanResultsV2PayloadRowsForLineUser(lineUserId, limit = 80) {
  const uid = String(lineUserId || "").trim();
  if (!uid) return [];

  const lim = Math.min(200, Math.max(1, Math.floor(Number(limit)) || 80));
  const { data, error } = await supabase
    .from("scan_results_v2")
    .select("id, scan_job_id, created_at, report_payload_json, html_public_token")
    .eq("line_user_id", uid)
    .order("created_at", { ascending: false })
    .limit(lim);

  if (error) {
    console.error(
      JSON.stringify({
        event: "SCAN_RESULTS_V2_LIST_BY_LINE_USER",
        outcome: "error",
        code: error.code,
        message: error.message,
        lineUserIdPrefix: uid.slice(0, 8),
      }),
    );
    return [];
  }
  return Array.isArray(data) ? data : [];
}

/**
 * Resolve scan_uploads.id for a completed scan result (same LINE user).
 * @param {string} scanResultV2Id
 * @param {string} lineUserId
 * @returns {Promise<string | null>}
 */
export async function getUploadIdForScanResultV2AndLineUser(
  scanResultV2Id,
  lineUserId,
) {
  const rid = String(scanResultV2Id || "").trim();
  const uid = String(lineUserId || "").trim();
  if (!rid || !uid) return null;

  const { data: res, error } = await supabase
    .from("scan_results_v2")
    .select("scan_job_id")
    .eq("id", rid)
    .eq("line_user_id", uid)
    .maybeSingle();

  if (error || !res?.scan_job_id) return null;

  const { data: job, error: jErr } = await supabase
    .from("scan_jobs")
    .select("upload_id")
    .eq("id", res.scan_job_id)
    .maybeSingle();

  if (jErr || !job?.upload_id) return null;
  const up = String(job.upload_id || "").trim();
  return up || null;
}
