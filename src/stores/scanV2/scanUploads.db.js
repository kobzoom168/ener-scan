import { supabase } from "../../config/supabase.js";

/**
 * @param {object} row
 * @returns {Promise<{ id: string } | null>}
 */
export async function insertScanUpload(row) {
  const { data, error } = await supabase
    .from("scan_uploads")
    .insert(row)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * @param {string} lineMessageId
 * @returns {Promise<{ id: string } | null>}
 */
export async function getScanUploadByLineMessageId(lineMessageId) {
  const { data, error } = await supabase
    .from("scan_uploads")
    .select("id")
    .eq("line_message_id", lineMessageId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * @param {string} id
 * @returns {Promise<object | null>}
 */
export async function getScanUploadById(id) {
  const { data, error } = await supabase
    .from("scan_uploads")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Exact image match (SHA-256 of stored bytes) for the same LINE user, prior completed scans.
 * Joins: scan_uploads ← scan_jobs (upload_id) → scan_results_v2 (via result_id).
 * If `scan_uploads.sha256` is absent in DB or query fails, returns null (caller continues without crashing).
 *
 * @param {string} sha256Hex Lowercase hex digest (64 chars)
 * @param {string} lineUserId
 * @param {string} [excludeUploadId] Exclude current upload (same bytes re-ingested as new row)
 * @returns {Promise<{ scan_result_id: string, report_url: string | null } | null>}
 */
export async function findScanUploadBySha256AndUser(
  sha256Hex,
  lineUserId,
  excludeUploadId = null,
) {
  const hash = String(sha256Hex || "").trim().toLowerCase();
  const uid = String(lineUserId || "").trim();
  if (!hash || !uid) return null;

  try {
    let uploadQuery = supabase
      .from("scan_uploads")
      .select("id")
      .eq("line_user_id", uid)
      .eq("sha256", hash);

    if (excludeUploadId) {
      uploadQuery = uploadQuery.neq("id", excludeUploadId);
    }

    const { data: uploads, error: upErr } = await uploadQuery;
    if (upErr) throw upErr;
    if (!uploads || uploads.length === 0) return null;

    const uploadIds = uploads.map((u) => u.id).filter(Boolean);
    if (uploadIds.length === 0) return null;

    const { data: job, error: jobErr } = await supabase
      .from("scan_jobs")
      .select("id, result_id, created_at")
      .eq("line_user_id", uid)
      .in("upload_id", uploadIds)
      .in("status", ["completed", "delivery_queued", "delivered"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (jobErr) throw jobErr;
    if (!job?.result_id) return null;

    const { data: resV2, error: rErr } = await supabase
      .from("scan_results_v2")
      .select("id, report_url")
      .eq("id", job.result_id)
      .maybeSingle();

    if (rErr) throw rErr;
    if (!resV2?.id) return null;

    return {
      scan_result_id: resV2.id,
      report_url: resV2.report_url ?? null,
    };
  } catch (e) {
    console.error(
      JSON.stringify({
        event: "SCAN_UPLOAD_SHA256_LOOKUP_SKIP",
        reason: String(e?.message || e).slice(0, 300),
      }),
    );
    return null;
  }
}

/**
 * Original LINE-ingest files eligible for purge (free tier, not pinned, not yet deleted).
 * Does not select `thumbnail_path` for deletion — worker removes `storage_path` (original) only.
 * @param {string} beforeIso — delete where original_expires_at < beforeIso
 * @param {number} [limit]
 * @returns {Promise<Array<{ id: string, line_user_id: string, storage_bucket: string, storage_path: string }>>}
 */
export async function listScanUploadsOriginalDeletionCandidates(beforeIso, limit = 50) {
  const lim = Math.min(200, Math.max(1, Math.floor(Number(limit)) || 50));
  const { data, error } = await supabase
    .from("scan_uploads")
    .select("id, line_user_id, storage_bucket, storage_path")
    .is("original_deleted_at", null)
    .eq("is_pinned", false)
    .neq("storage_tier", "paid_future")
    .not("original_expires_at", "is", null)
    .lt("original_expires_at", beforeIso)
    .not("storage_path", "is", null)
    .neq("storage_path", "")
    .limit(lim);

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

/**
 * Retention / UI: original purge state + future thumb path (do not delete in worker v1).
 *
 * @param {string[]} uploadIds
 * @param {string} lineUserId
 * @returns {Promise<Array<{ id: string, original_deleted_at: string | null, thumbnail_path: string | null }>>}
 */
export async function listScanUploadRetentionFieldsByIds(uploadIds, lineUserId) {
  const ids = Array.from(
    new Set(
      (Array.isArray(uploadIds) ? uploadIds : [])
        .map((x) => String(x || "").trim())
        .filter(Boolean),
    ),
  );
  const uid = String(lineUserId || "").trim();
  if (!ids.length || !uid) return [];

  const { data, error } = await supabase
    .from("scan_uploads")
    .select("id, original_deleted_at, thumbnail_path")
    .eq("line_user_id", uid)
    .in("id", ids);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

/**
 * @param {string} lineUserId
 * @returns {Promise<number>}
 */
export async function countPinnedScanUploadsByLineUser(lineUserId) {
  const uid = String(lineUserId || "").trim();
  if (!uid) return 0;
  const { count, error } = await supabase
    .from("scan_uploads")
    .select("id", { count: "exact", head: true })
    .eq("line_user_id", uid)
    .eq("is_pinned", true);
  if (error) return 0;
  return typeof count === "number" ? count : 0;
}

/**
 * @param {string} uploadId
 * @param {string} lineUserId
 * @param {boolean} isPinned
 */
export async function setScanUploadPinnedForUser(uploadId, lineUserId, isPinned) {
  const id = String(uploadId || "").trim();
  const uid = String(lineUserId || "").trim();
  if (!id || !uid) throw new Error("scan_upload_pin_missing_ids");
  const { error } = await supabase
    .from("scan_uploads")
    .update({ is_pinned: Boolean(isPinned) })
    .eq("id", id)
    .eq("line_user_id", uid);
  if (error) throw error;
}

/**
 * @param {string} uploadId
 */
export async function markScanUploadOriginalDeleted(uploadId) {
  const id = String(uploadId || "").trim();
  if (!id) return;
  const { error } = await supabase
    .from("scan_uploads")
    .update({ original_deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Persist library thumbnail storage path (not the LINE original `storage_path`).
 *
 * @param {string} uploadId
 * @param {string} thumbnailPath — object path within `SCAN_V2_UPLOAD_BUCKET`
 */
export async function updateScanUploadThumbnailPath(uploadId, thumbnailPath) {
  const id = String(uploadId || "").trim();
  const path = String(thumbnailPath || "").trim();
  if (!id || !path) throw new Error("updateScanUploadThumbnailPath_missing_args");
  const { error } = await supabase
    .from("scan_uploads")
    .update({ thumbnail_path: path })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Fetch `sha256` for uploads by id (same LINE user scope).
 *
 * @param {string[]} uploadIds
 * @param {string} lineUserId
 * @returns {Promise<Array<{ id: string, sha256: string | null }>>}
 */
export async function listScanUploadsSha256ByIds(uploadIds, lineUserId) {
  const ids = Array.from(
    new Set(
      (Array.isArray(uploadIds) ? uploadIds : [])
        .map((x) => String(x || "").trim())
        .filter(Boolean),
    ),
  );
  const uid = String(lineUserId || "").trim();
  if (!ids.length || !uid) return [];

  const { data, error } = await supabase
    .from("scan_uploads")
    .select("id, sha256")
    .eq("line_user_id", uid)
    .in("id", ids);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

/**
 * Debug helper: latest scan uploads with masked user/hash prefixes only.
 *
 * @param {number} [limit]
 * @returns {Promise<Array<{ uploadId: string, lineUserIdPrefix: string, imageSha256Prefix: string|null, createdAt: string|null }>>}
 */
export async function listRecentScanUploadsDebug(limit = 20) {
  const lim = Math.min(200, Math.max(1, Math.floor(Number(limit)) || 20));
  const { data, error } = await supabase
    .from("scan_uploads")
    .select("id, line_user_id, sha256, created_at")
    .order("created_at", { ascending: false })
    .limit(lim);
  if (error) throw error;

  if (!Array.isArray(data) || !data.length) return [];
  const uploadIds = data
    .map((row) => String(row?.id || "").trim())
    .filter(Boolean);

  const { data: jobs, error: jobsErr } = await supabase
    .from("scan_jobs")
    .select("upload_id, result_id, created_at")
    .in("upload_id", uploadIds)
    .not("result_id", "is", null)
    .order("created_at", { ascending: false });
  if (jobsErr) throw jobsErr;

  const newestResultByUpload = new Map();
  for (const row of Array.isArray(jobs) ? jobs : []) {
    const uploadId = String(row?.upload_id || "").trim();
    const resultId = String(row?.result_id || "").trim();
    if (!uploadId || !resultId || newestResultByUpload.has(uploadId)) continue;
    newestResultByUpload.set(uploadId, resultId);
  }

  const resultIds = Array.from(new Set(Array.from(newestResultByUpload.values()))).filter(Boolean);
  let phashByResult = new Map();
  if (resultIds.length) {
    const { data: phRows, error: phErr } = await supabase
      .from("scan_image_phashes")
      .select("scan_result_id, image_phash, created_at")
      .in("scan_result_id", resultIds)
      .order("created_at", { ascending: false });
    if (phErr) throw phErr;
    phashByResult = new Map(
      (Array.isArray(phRows) ? phRows : [])
        .map((row) => [
          String(row?.scan_result_id || "").trim(),
          String(row?.image_phash || "")
            .trim()
            .toLowerCase(),
        ])
        .filter(([k, v]) => k && /^[0-9a-f]{16}$/.test(v)),
    );
  }

  return data.map((row) => {
    const uploadId = String(row?.id || "").trim();
    const resultId = newestResultByUpload.get(uploadId) || "";
    const imagePhash = resultId ? phashByResult.get(resultId) || null : null;
    return {
    uploadId: String(row?.id || "").trim(),
    lineUserIdPrefix: String(row?.line_user_id || "").trim().slice(0, 8),
    imageSha256Prefix: row?.sha256 ? String(row.sha256).trim().toLowerCase().slice(0, 12) : null,
    imagePhash,
    imagePhashPrefix: imagePhash ? imagePhash.slice(0, 8) : null,
    createdAt: row?.created_at ? String(row.created_at) : null,
    };
  });
}
