import {
  computeAmuletPowerScoresDeterministicV1,
  POWER_LABEL_THAI,
} from "./amuletScores.util.js";

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
    "กราฟหกมิติชี้จุดแรงของชิ้นนี้ชัด",
    "อ่านคะแนนก่อน แล้วค่อยไล่รายละเอียดด้านล่าง",
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
    mainEnergyWordingLine: `โทนหลัก: ${mainShort} · สรุปจากหกมิติพลัง`,
    htmlOpeningLine:
      "รายงานนี้เริ่มจากกราฟหกมิติ แล้วสรุปเป็นข้อความสั้นให้อ่านเร็ว",
    tagline: surface.tagline,
  };
}

function buildAmuletHtmlReportPlaceholder() {
  const lifeAreaBlurbs = {
    protection:
      "เด่นเรื่องกันแรงปะทะ ตั้งขอบเขต และพยุงตัวเวลาเจอเรื่องหนัก",
    metta:
      "ช่วยให้คนรอบตัวเปิดใจ คุยง่าย และรับพลังจากคุณมากขึ้น",
    baramee:
      "ส่งเรื่องภาพลักษณ์ ความน่าเชื่อถือ และแรงนำในบทบาทที่รับอยู่",
    luck: "หนุนโอกาสใหม่ จังหวะใหม่ และทางเลือกที่เริ่มเปิดเข้ามา",
    fortune_anchor:
      "ช่วยประคองใจ ตั้งหลักไว และไม่ไหลตามสถานการณ์ง่าย",
    specialty:
      "เด่นกับงานที่ต้องใช้ฝีมือ ความถนัด หรือบทบาทเฉพาะตัว",
  };

  const usageCautionLines = [
    "ผลลัพธ์ขึ้นกับบริบทคุณ ไม่ใช่คำแนะนำทางการแพทย์หรือการเงิน",
  ];

  return { lifeAreaBlurbs, usageCautionLines };
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
  const scores = computeAmuletPowerScoresDeterministicV1(seedKey);
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
