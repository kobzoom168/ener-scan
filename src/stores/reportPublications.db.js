import { supabase } from "../config/supabase.js";

/**
 * MVP: one publication row per `scan_results_v2.id` (upsert on conflict).
 * Reuses the same `public_token` / `report_url` as legacy `scan_public_reports` + worker.
 *
 * @param {object} opts
 * @param {string} opts.scanResultV2Id — scan_results_v2.id
 * @param {string} opts.publicToken
 * @param {string} opts.reportUrl — absolute or path; must match GET /r/:publicToken
 * @returns {Promise<{ id: string } | null>}
 */
export async function upsertReportPublicationForScanResult({
  scanResultV2Id,
  publicToken,
  reportUrl,
}) {
  const sid = String(scanResultV2Id || "").trim();
  const tok = String(publicToken || "").trim();
  if (!sid || !tok) {
    throw new Error("report_publication_missing_scan_or_token");
  }

  const url = String(reportUrl || "").trim() || null;
  const nowIso = new Date().toISOString();

  const row = {
    scan_result_id: sid,
    public_token: tok,
    report_url: url,
    status: "published",
    published_at: nowIso,
    expires_at: null,
    last_error_code: null,
    last_error_message: null,
  };

  const { data, error } = await supabase
    .from("report_publications")
    .upsert(row, { onConflict: "scan_result_id" })
    .select("id")
    .maybeSingle();

  if (error) {
    console.error(
      JSON.stringify({
        event: "REPORT_PUBLICATION_UPSERT",
        outcome: "error",
        code: error.code,
        message: error.message,
        scanResultIdPrefix: sid.slice(0, 8),
      }),
    );
    throw error;
  }

  console.log(
    JSON.stringify({
      event: "REPORT_PUBLICATION_UPSERT",
      outcome: "ok",
      id: data?.id || null,
      scanResultIdPrefix: sid.slice(0, 8),
      tokenPrefix: `${tok.slice(0, 12)}…`,
    }),
  );

  return data?.id ? { id: data.id } : null;
}

/**
 * @param {string} scanResultV2Id
 * @returns {Promise<{ report_payload_json: unknown, created_at?: string } | null>}
 */
export async function getScanResultV2PayloadRow(scanResultV2Id) {
  const id = String(scanResultV2Id || "").trim();
  if (!id) return null;

  const { data, error } = await supabase
    .from("scan_results_v2")
    .select("report_payload_json, created_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error(
      JSON.stringify({
        event: "SCAN_RESULTS_V2_PAYLOAD_LOOKUP",
        outcome: "error",
        code: error.code,
        message: error.message,
        idPrefix: id.slice(0, 8),
      }),
    );
    return null;
  }
  return data;
}

/**
 * @param {string} publicToken
 * @returns {Promise<{
 *   publication: object,
 *   scanResultV2: { report_payload_json: unknown, created_at?: string } | null
 * } | null>}
 */
export async function getPublicationWithScanResultV2ByToken(publicToken) {
  const tok = String(publicToken || "").trim();
  if (!tok) return null;

  const { data: pub, error } = await supabase
    .from("report_publications")
    .select(
      "id, scan_result_id, status, expires_at, published_at, report_url, public_token",
    )
    .eq("public_token", tok)
    .maybeSingle();

  if (error) {
    console.error(
      JSON.stringify({
        event: "REPORT_PUBLICATION_LOOKUP",
        outcome: "error",
        code: error.code,
        message: error.message,
        tokenPrefix: `${tok.slice(0, 12)}…`,
      }),
    );
    return null;
  }

  if (!pub) return null;

  const v2 = await getScanResultV2PayloadRow(pub.scan_result_id);
  return { publication: pub, scanResultV2: v2 };
}
