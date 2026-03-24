import { renderMobileReportHtml } from "../../templates/reports/mobileReport.template.js";
import { normalizeReportPayloadForRender } from "../../utils/reports/reportPayloadNormalize.util.js";
import {
  BANGKOK_TIME_ZONE,
  formatBangkokDateTime,
} from "../../utils/dateTime.util.js";
import { REPORT_ROLLOUT_SCHEMA_VERSION } from "../../utils/reports/reportRolloutTelemetry.util.js";

/**
 * @param {import("./reportPayload.types.js").ReportPayload} payload
 * @returns {string}
 */
export function renderReportHtmlPage(payload) {
  const { payload: normalized, warnings } =
    normalizeReportPayloadForRender(payload);
  if (warnings.length) {
    console.warn(
      JSON.stringify({
        event: "REPORT_RENDER_NORMALIZE",
        warnings,
        warningsCount: warnings.length,
      }),
    );
  }
  const formattedAt = formatBangkokDateTime(normalized.generatedAt);
  console.log(
    JSON.stringify({
      event: "REPORT_RENDER_TIMEZONE_OK",
      schemaVersion: REPORT_ROLLOUT_SCHEMA_VERSION,
      timeZone: BANGKOK_TIME_ZONE,
      locale: "th-TH",
      generatedAtRaw: normalized.generatedAt,
      generatedAtBangkok: formattedAt,
    }),
  );
  return renderMobileReportHtml(normalized);
}
