import { computeMoldaviteLifeAreaScoresDeterministicV1 } from "./moldaviteScores.util.js";

/**
 * Deterministic teaser copy for Flex — not from energy_copy_templates / DB hero path.
 *
 * @param {import("./moldaviteScores.util.js").MoldaviteLifeAreaKey} primary
 * @param {import("./moldaviteScores.util.js").MoldaviteLifeAreaKey} secondary
 */
function buildFlexSurfaceCopy(primary, secondary) {
  const headlines = {
    work: "มอลดาไวต์ — เน้นช่วยตั้งสมาธิและปรับจังหวะเรื่องงาน",
    money: "มอลดาไวต์ — โทนช่วยเปิดทางเรื่องโอกาสและกระแสเงิน",
    relationship:
      "มอลดาไวต์ — โทนนุ่มที่ช่วยให้ความสัมพันธ์ไหลลื่นขึ้น",
  };
  const fitByPair = {
    "money|relationship":
      "เปิดทางเรื่องความมั่นคงและบรรยากาศความสัมพันธ์",
    "money|work":
      "จังหวะเงินและงานสอดคล้องกัน — ลงมือได้ไม่สะดุด",
    "relationship|work":
      "คุยกับคนรอบตัวลื่นขึ้น ส่งผลดีต่อการลงมือเรื่องสำคัญ",
  };

  const pairKey = [primary, secondary].slice().sort().join("|");
  const fitLine =
    fitByPair[pairKey] || "โทนรวมช่วยให้ใจนิ่งและลงมือได้ชัดขึ้น";

  const bulletsPool = {
    work: [
      "เหมาะช่วงที่ต้องตัดสินใจเรื่องงานหรือโปรเจกต์สำคัญ",
      "ช่วยให้โฟกัสกลับมาอยู่กับลำดับความสำคัญ",
    ],
    money: [
      "เหมาะช่วงจัดระเบียบเรื่องเงินหรือโอกาสใหม่ ๆ",
      "ช่วยให้มองเห็นทางเลือกทางการเงินชัดขึ้น",
    ],
    relationship: [
      "เหมาะช่วงที่อยากให้บทสนทนาและบรรยากาศดูนุ่มนวลขึ้น",
      "ช่วยลดแรงตึงในเรื่องคนเมื่อใจเริ่มร้อน",
    ],
  };

  const b0 = bulletsPool[primary];
  const b1 = bulletsPool[secondary];
  const h = headlines[primary] || headlines.work;

  return {
    headline: h,
    fitLine,
    bullets: [b0[0], b1[1] || b1[0]],
    mainEnergyShort: "มอลดาไวต์",
  };
}

/**
 * @param {object} p
 * @param {string} p.scanResultId
 * @param {{ reason: string, matchedSignals?: string[] }} p.detection
 * @param {string} p.seedKey
 * @param {number|null} [p.energyScore]
 * @param {string} [p.mainEnergyLabel]
 * @returns {import("../services/reports/reportPayload.types.js").ReportMoldaviteV1}
 */
export function buildMoldaviteV1Slice({
  scanResultId,
  detection,
  seedKey,
  energyScore = null,
  mainEnergyLabel = "",
}) {
  const scores = computeMoldaviteLifeAreaScoresDeterministicV1(seedKey);
  const flexSurface = buildFlexSurfaceCopy(
    scores.primaryLifeArea,
    scores.secondaryLifeArea,
  );

  return {
    version: "1",
    scoringMode: scores.scoringMode,
    detection: {
      reason: detection.reason,
      matchedSignals:
        "matchedSignals" in detection && Array.isArray(detection.matchedSignals)
          ? detection.matchedSignals
          : [],
    },
    lifeAreas: scores.lifeAreas,
    primaryLifeArea: scores.primaryLifeArea,
    secondaryLifeArea: scores.secondaryLifeArea,
    flexSurface,
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
