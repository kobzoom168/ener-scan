import { renderMobileReportHtml } from "../../templates/reports/mobileReport.template.js";
import { normalizeReportPayloadForRender } from "../../utils/reports/reportPayloadNormalize.util.js";

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
  return renderMobileReportHtml(normalized);
}
