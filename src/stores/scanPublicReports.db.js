import { supabase } from "../config/supabase.js";

/**
 * @param {object} row
 * @param {string} row.scanResultId
 * @param {string} row.publicToken
 * @param {object} row.reportPayload
 * @param {string} row.reportVersion
 * @returns {Promise<string|null>} new row id or null
 */
export async function insertScanPublicReport({
  scanResultId,
  publicToken,
  reportPayload,
  reportVersion,
}) {
  const sid = String(scanResultId || "").trim();
  const tok = String(publicToken || "").trim();
  if (!sid || !tok || !reportPayload) {
    throw new Error("insertScanPublicReport_missing_fields");
  }

  const { data, error } = await supabase
    .from("scan_public_reports")
    .insert({
      scan_result_id: sid,
      public_token: tok,
      report_payload: reportPayload,
      report_version: String(reportVersion || ""),
    })
    .select("id")
    .maybeSingle();

  if (error) {
    console.error(
      JSON.stringify({
        event: "REPORT_DB_INSERT",
        outcome: "error",
        code: error.code,
        message: error.message,
        hint: error.hint,
      }),
    );
    throw error;
  }

  console.log(
    JSON.stringify({
      event: "REPORT_DB_INSERT",
      outcome: "ok",
      rowId: data?.id || null,
      scanResultIdPrefix: `${sid.slice(0, 8)}…`,
      tokenPrefix: `${tok.slice(0, 12)}…`,
    }),
  );

  return data?.id || null;
}

/**
 * @param {string} publicToken
 * @returns {Promise<{ report_payload: object, report_version: string } | null>}
 */
export async function getScanPublicReportByToken(publicToken) {
  const tok = String(publicToken || "").trim();
  if (!tok) return null;

  const { data, error } = await supabase
    .from("scan_public_reports")
    .select("report_payload, report_version")
    .eq("public_token", tok)
    .maybeSingle();

  if (error) {
    console.error(
      JSON.stringify({
        event: "REPORT_DB_SELECT",
        outcome: "error",
        code: error.code,
        message: error.message,
        tokenPrefix: `${tok.slice(0, 12)}…`,
      }),
    );
    return null;
  }

  if (!data?.report_payload) return null;
  return {
    report_payload: data.report_payload,
    report_version: data.report_version || "",
  };
}
