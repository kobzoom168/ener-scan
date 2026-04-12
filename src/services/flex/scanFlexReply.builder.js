import { buildScanFlex } from "./flex.service.js";
import { buildScanSummaryFirstFlex } from "./flex.summaryFirst.js";
import { buildMoldaviteSummaryFirstFlex } from "./flex.moldaviteSummary.js";
import { buildAmuletSummaryFirstFlex } from "./flex.amuletSummary.js";
import { buildCrystalBraceletSummaryFirstFlex } from "./flex.crystalBraceletSummary.js";

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
 * Normal summary-first lane selection: `moldavite_flex_v1` | `sacred_amulet_flex_v1` | `crystal_bracelet_flex_v1` | `summary_first_generic`.
 *
 * @param {object} options
 * @param {boolean} options.summaryFirstEnabled
 * @param {string} options.resultText
 * @param {string|null} [options.birthdate]
 * @param {string|null} [options.reportUrl]
 * @param {import("../reports/reportPayload.types.js").ReportPayload | null} [options.reportPayload]
 * @param {boolean} [options.appendReportBubble]
 * @param {{
 *   buildScanSummaryFirstFlex?: typeof buildScanSummaryFirstFlex,
 *   buildMoldaviteSummaryFirstFlex?: typeof buildMoldaviteSummaryFirstFlex,
 *   buildAmuletSummaryFirstFlex?: typeof buildAmuletSummaryFirstFlex,
 *   buildCrystalBraceletSummaryFirstFlex?: typeof buildCrystalBraceletSummaryFirstFlex,
 *   buildScanFlex?: typeof buildScanFlex,
 * }} [impl] test doubles
 * @returns {Promise<{ flex: Record<string, unknown>, summaryFirstBuildFailed: boolean, error?: unknown }>}
 */
export async function buildScanResultFlexWithFallback(options, impl = {}) {
  const buildSummary =
    impl.buildScanSummaryFirstFlex ?? buildScanSummaryFirstFlex;
  const buildMoldavite =
    impl.buildMoldaviteSummaryFirstFlex ?? buildMoldaviteSummaryFirstFlex;
  const buildAmulet =
    impl.buildAmuletSummaryFirstFlex ?? buildAmuletSummaryFirstFlex;
  const buildCrystalBracelet =
    impl.buildCrystalBraceletSummaryFirstFlex ??
    buildCrystalBraceletSummaryFirstFlex;
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

  const summaryOpts = {
    birthdate,
    reportUrl,
    reportPayload,
    appendReportBubble,
  };

  if (!summaryFirstEnabled) {
    return {
      flex: buildLegacy(resultText, { birthdate, reportUrl, objectFamily }),
      summaryFirstBuildFailed: false,
    };
  }

  try {
    let flex;
    /** @type {"moldavite_flex_v1"|"sacred_amulet_flex_v1"|"crystal_bracelet_flex_v1"|"summary_first_generic"} */
    let flexLane = "summary_first_generic";
    if (reportPayload?.moldaviteV1) {
      flexLane = "moldavite_flex_v1";
      flex = await buildMoldavite(resultText, summaryOpts);
    } else if (reportPayload?.amuletV1) {
      flexLane = "sacred_amulet_flex_v1";
      flex = await buildAmulet(resultText, summaryOpts);
    } else if (reportPayload?.crystalBraceletV1) {
      flexLane = "crystal_bracelet_flex_v1";
      flex = await buildCrystalBracelet(resultText, summaryOpts);
    } else {
      flex = await buildSummary(resultText, summaryOpts);
    }
    console.log(
      JSON.stringify({
        event: "FLEX_LANE_SELECTED",
        flexLane,
        hasMoldaviteV1: Boolean(reportPayload?.moldaviteV1),
        hasAmuletV1: Boolean(reportPayload?.amuletV1),
        hasCrystalBraceletV1: Boolean(reportPayload?.crystalBraceletV1),
      }),
    );
    return {
      flex,
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
