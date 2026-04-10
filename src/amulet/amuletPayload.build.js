import {
  computeAmuletPowerScoresDeterministicV1,
  POWER_LABEL_THAI,
} from "./amuletScores.util.js";
import { AMULET_HTML_V2_USAGE_DISCLAIMER } from "./amuletHtmlV2.model.js";

/**
 * @param {import("./amuletScores.util.js").AmuletPowerKey} primary
 * @param {import("./amuletScores.util.js").AmuletPowerKey} secondary
 * @param {Record<string, { key: string, score: number, labelThai: string }>} powerCategories
 * @param {{ headline: string, mainEnergyShort: string, tagline: string }} surface
 */
function buildAmuletFlexSurfaceCopy(primary, secondary, powerCategories, surface) {
  const primaryLabel =
    String(powerCategories[primary]?.labelThai || "").trim() ||
    POWER_LABEL_THAI.protection;
  const secondaryLabel =
    String(powerCategories[secondary]?.labelThai || "").trim() ||
    POWER_LABEL_THAI.metta;

  const fitLine = `เด่นสุด ${primaryLabel} · รอง ${secondaryLabel}`;
  const bullets = [
    "เด่นสุด รองลงมา · ดูจากคะแนน",
    "ด้านล่างเรียงตามคะแนน สูงไปต่ำ",
  ];
  const ctaLabel = "เปิดรายงานฉบับเต็ม";

  const mainShort = String(surface.mainEnergyShort || "").trim() || "พลังมุ่งเน้นรวม";

  return {
    headline: surface.headline,
    fitLine,
    bullets,
    ctaLabel,
    mainEnergyShort: surface.mainEnergyShort,
    heroNamingLine: `${surface.headline} · ${mainShort}`,
    mainEnergyWordingLine: `โทนหลัก: ${mainShort} · หกมิติพลัง`,
    htmlOpeningLine: "เปิดจากคะแนน แล้วไล่รายละเอียดตามลำดับ",
    tagline: surface.tagline,
  };
}

function buildAmuletHtmlReportPlaceholder() {
  /** Same line as HTML ข้อจำกัด (`AMULET_HTML_V2_USAGE_DISCLAIMER` in view model). */
  const usageCautionLines = [AMULET_HTML_V2_USAGE_DISCLAIMER];

  /** Blurbs generated in `amuletHtmlV2.model` + `amuletMeaningBlurbs.util` when empty. */
  return { lifeAreaBlurbs: {}, usageCautionLines };
}

/**
 * @param {object} p
 * @param {string} p.scanResultId
 * @param {string} p.seedKey
 * @param {number|null} [p.energyScore]
 * @param {string} [p.mainEnergyLabel]
 * @returns {import("../services/reports/reportPayload.types.js").ReportAmuletV1}
 */
export function buildAmuletV1Slice({
  scanResultId,
  seedKey,
  energyScore = null,
  mainEnergyLabel = "",
}) {
  const scores = computeAmuletPowerScoresDeterministicV1(seedKey, {
    sessionKey: scanResultId,
    mainEnergyLabel,
  });
  const headline = "พระเครื่อง";
  const mainShort =
    String(mainEnergyLabel || "").trim().slice(0, 22) || "พลังมุ่งเน้นรวม";
  const tagline = "พระเครื่อง · หกมิติพลัง";

  const flexSurface = buildAmuletFlexSurfaceCopy(
    scores.primaryPower,
    scores.secondaryPower,
    scores.powerCategories,
    {
      headline,
      mainEnergyShort: mainShort,
      tagline,
    },
  );

  const htmlReport = buildAmuletHtmlReportPlaceholder();

  return {
    version: "1",
    scoringMode: scores.scoringMode,
    detection: {
      reason: "sacred_amulet_lane_v1",
      matchedSignals: [],
    },
    powerCategories: scores.powerCategories,
    primaryPower: scores.primaryPower,
    secondaryPower: scores.secondaryPower,
    flexSurface,
    htmlReport,
    context: {
      scanResultIdPrefix: String(scanResultId || "").slice(0, 8),
      energyScoreSnapshot:
        energyScore != null && Number.isFinite(Number(energyScore))
          ? Number(energyScore)
          : null,
      mainEnergyLabelSnapshot: String(mainEnergyLabel || "").trim() || null,
    },
  };
}
