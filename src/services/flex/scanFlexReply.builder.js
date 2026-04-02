import { buildScanFlex } from "./flex.service.js";
import { buildScanSummaryFirstFlex } from "./flex.summaryFirst.js";

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

  if (!summaryFirstEnabled) {
    return {
      flex: buildLegacy(resultText, { birthdate, reportUrl }),
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
      flex: buildLegacy(resultText, { birthdate, reportUrl }),
      summaryFirstBuildFailed: true,
      error: err,
    };
  }
}
