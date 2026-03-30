import { resolvePublicReportPayload } from "../services/reports/reportQuery.service.js";
import { mapLegacyReportPayloadToPublicReportView } from "../services/reports/publicReportPayload.mapper.js";

/**
 * GET /api/public-report/:publicToken
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
export async function getPublicReportJson(req, res) {
  const publicToken = String(req.params?.publicToken || "").trim();
  const resolved = await resolvePublicReportPayload(publicToken);

  if (resolved.kind === "error") {
    const body = {
      ok: false,
      code: resolved.code,
      message:
        resolved.code === "REPORT_NOT_FOUND"
          ? "report not found"
          : resolved.code === "REPORT_EXPIRED"
            ? "report link expired"
            : "report temporarily unavailable",
    };
    return res.status(resolved.httpStatus).json(body);
  }

  const report = mapLegacyReportPayloadToPublicReportView({
    publicationId: resolved.publicationId,
    scanResultId: resolved.scanResultIdForApi,
    payload: resolved.payload,
  });

  return res.status(200).json({
    ok: true,
    report,
  });
}
