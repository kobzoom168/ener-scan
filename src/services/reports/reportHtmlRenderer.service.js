import { renderMobileReportHtml } from "../../templates/reports/mobileReport.template.js";
import { renderMoldaviteReportV2Html } from "../../templates/reports/moldaviteReportV2.template.js";
import { renderAmuletReportV2Html } from "../../templates/reports/amuletReportV2.template.js";
import { renderCrystalBraceletReportV2Html } from "../../templates/reports/crystalBraceletReportV2.template.js";
import { normalizeReportPayloadForRender } from "../../utils/reports/reportPayloadNormalize.util.js";
import {
  BANGKOK_TIME_ZONE,
  formatBangkokDateTime,
} from "../../utils/dateTime.util.js";
import { REPORT_ROLLOUT_SCHEMA_VERSION } from "../../utils/reports/reportRolloutTelemetry.util.js";

/**
 * @param {import("./reportPayload.types.js").ReportPayload} payload
 * @param {object} [renderOpts]
 * @param {import("./sacredAmuletLibrary.service.js").SacredAmuletLibraryView | null | undefined} [renderOpts.sacredAmuletLibrary]
 * @returns {string}
 */
export function renderReportHtmlPage(payload, renderOpts = {}) {
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
  if (
    normalized.amuletV1 &&
    typeof normalized.amuletV1 === "object" &&
    !Array.isArray(normalized.amuletV1)
  ) {
    console.log(
      JSON.stringify({
        event: "REPORT_HTML_RENDERER_SELECTED",
        lane: "amulet_html_v2",
        reportIdPrefix: String(normalized.reportId || "").slice(0, 8),
      }),
    );
    return renderAmuletReportV2Html(normalized, {
      sacredAmuletLibrary: renderOpts.sacredAmuletLibrary ?? null,
    });
  }
  if (
    normalized.moldaviteV1 &&
    typeof normalized.moldaviteV1 === "object" &&
    !Array.isArray(normalized.moldaviteV1)
  ) {
    console.log(
      JSON.stringify({
        event: "REPORT_HTML_RENDERER_SELECTED",
        lane: "moldavite_html_v2",
        reportIdPrefix: String(normalized.reportId || "").slice(0, 8),
      }),
    );
    return renderMoldaviteReportV2Html(normalized);
  }
  if (
    normalized.crystalBraceletV1 &&
    typeof normalized.crystalBraceletV1 === "object" &&
    !Array.isArray(normalized.crystalBraceletV1)
  ) {
    console.log(
      JSON.stringify({
        event: "REPORT_HTML_RENDERER_SELECTED",
        lane: "crystal_bracelet_html_v2",
        reportIdPrefix: String(normalized.reportId || "").slice(0, 8),
      }),
    );
    return renderCrystalBraceletReportV2Html(normalized);
  }
  console.log(
    JSON.stringify({
      event: "REPORT_HTML_RENDERER_SELECTED",
      lane: "mobile_report_legacy",
      reportIdPrefix: String(normalized.reportId || "").slice(0, 8),
    }),
  );
  return renderMobileReportHtml(normalized);
}
