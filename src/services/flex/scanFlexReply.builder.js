import { buildScanFlex } from "./flex.service.js";
import { buildScanSummaryFirstFlex } from "./flex.summaryFirst.js";

/**
 * Prefer `summary.energyCopyObjectFamily` (normalized slug) then diagnostics.
 * @param {import("../reports/reportPayload.types.js").ReportPayload | null | undefined} reportPayload
 * @returns {string}
 */
function objectFamilyFromReportPayload(reportPayload) {
  if (!reportPayload || typeof reportPayload !== "object") return "";
  const s = reportPayload.summary;
  const fromSummary =
    s && typeof s === "object" && "energyCopyObjectFamily" in s
      ? String(s.energyCopyObjectFamily || "").trim()
      : "";
  const fromDx = String(reportPayload.diagnostics?.objectFamily || "").trim();
  return fromSummary || fromDx || "";
}

/**
 * Builds scan-result Flex: summary-first when enabled, legacy {@link buildScanFlex} on disable or on throw.
 * Extracted for unit tests (fallback path) without changing scan pipeline behavior.
 *
 * @param {object} options
 * @param {boolean} options.summaryFirstEnabled
 * @param {string} options.resultText
 * @param {string|null} [options.birthdate]
 * @param {string|null} [options.reportUrl]
 * @param {import("../reports/reportPayload.types.js").ReportPayload | null} [options.reportPayload]
 * @param {boolean} [options.appendReportBubble]
 * @param {{ buildScanSummaryFirstFlex?: typeof buildScanSummaryFirstFlex, buildScanFlex?: typeof buildScanFlex }} [impl] test doubles
 * @returns {Promise<{ flex: Record<string, unknown>, summaryFirstBuildFailed: boolean, error?: unknown }>}
 */
export async function buildScanResultFlexWithFallback(options, impl = {}) {
  const buildSummary =
    impl.buildScanSummaryFirstFlex ?? buildScanSummaryFirstFlex;
  const buildLegacy = impl.buildScanFlex ?? buildScanFlex;

  const {
    summaryFirstEnabled,
    resultText,
    birthdate,
    reportUrl,
    reportPayload,
    appendReportBubble,
  } = options;

  const objectFamily = objectFamilyFromReportPayload(reportPayload);

  if (!summaryFirstEnabled) {
    return {
      flex: buildLegacy(resultText, { birthdate, reportUrl, objectFamily }),
      summaryFirstBuildFailed: false,
    };
  }

  try {
    return {
      flex: await buildSummary(resultText, {
        birthdate,
        reportUrl,
        reportPayload,
        appendReportBubble,
      }),
      summaryFirstBuildFailed: false,
    };
  } catch (err) {
    return {
      flex: buildLegacy(resultText, { birthdate, reportUrl, objectFamily }),
      summaryFirstBuildFailed: true,
      error: err,
    };
  }
}
