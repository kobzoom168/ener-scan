/**
 * DB store for perceptual image hash deduplication.
 * Table: scan_image_phashes
 *   id              uuid PK default gen_random_uuid()
 *   image_phash     text NOT NULL         -- 16-char hex dHash
 *   scan_result_id  uuid NOT NULL         -- references scan_results_v2(id)
 *   report_url      text                  -- cached public report URL
 *   line_user_id    text NOT NULL
 *   created_at      timestamptz default now()
 */
import { supabase } from "../../config/supabase.js";
import { hammingDistance, DEDUP_HAMMING_THRESHOLD } from "../../services/imageDedup/imagePhash.util.js";

/**
 * Find a previously cached result whose hash is within Hamming distance threshold.
 * Returns the closest match or null.
 *
 * NOTE: Supabase does not support native Hamming distance queries on text,
 * so we fetch recent candidates and filter in JS. We limit to 200 rows (recent scans)
 * to keep this cheap.
 *
 * @param {string} phash             16-char hex
 * @param {string} lineUserId        restrict to same user (prevent cross-user leakage)
 * @param {number} [threshold]
 * @returns {Promise<{ scan_result_id: string, report_url: string | null, image_phash: string } | null>}
 */
export async function findDuplicateScanByPhash(phash, lineUserId, threshold = DEDUP_HAMMING_THRESHOLD) {
  const { data, error } = await supabase
    .from("scan_image_phashes")
    .select("scan_result_id, report_url, image_phash")
    .eq("line_user_id", lineUserId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;
  if (!data || data.length === 0) return null;

  let bestMatch = null;
  let bestDist = threshold + 1;

  for (const row of data) {
    const dist = hammingDistance(phash, row.image_phash);
    if (dist <= threshold && dist < bestDist) {
      bestDist = dist;
      bestMatch = row;
    }
  }

  return bestMatch;
}

/**
 * Store a new phash → scan_result mapping after a successful scan.
 *
 * @param {{
 *   image_phash: string,
 *   scan_result_id: string,
 *   report_url?: string | null,
 *   line_user_id: string,
 * }} row
 * @returns {Promise<void>}
 */
export async function insertScanPhash(row) {
  const { error } = await supabase.from("scan_image_phashes").insert({
    image_phash: row.image_phash,
    scan_result_id: row.scan_result_id,
    report_url: row.report_url ?? null,
    line_user_id: row.line_user_id,
  });
  if (error) throw error;
}

/**
 * Read stored pHash rows for specific scan_result ids.
 *
 * @param {string[]} scanResultIds
 * @param {string} lineUserId
 * @returns {Promise<Array<{ scan_result_id: string, image_phash: string }>>}
 */
export async function listScanPhashesByScanResultIds(scanResultIds, lineUserId) {
  const ids = Array.from(
    new Set(
      (Array.isArray(scanResultIds) ? scanResultIds : [])
        .map((x) => String(x || "").trim())
        .filter(Boolean),
    ),
  );
  const uid = String(lineUserId || "").trim();
  if (!ids.length || !uid) return [];

  const { data, error } = await supabase
    .from("scan_image_phashes")
    .select("scan_result_id, image_phash")
    .eq("line_user_id", uid)
    .in("scan_result_id", ids);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}
