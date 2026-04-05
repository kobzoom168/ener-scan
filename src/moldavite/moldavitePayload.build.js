import { computeMoldaviteLifeAreaScoresDeterministicV1 } from "./moldaviteScores.util.js";
import { resolveMoldaviteDisplayNaming } from "./moldaviteDisplayNaming.util.js";

/** @typedef {import("./moldaviteScores.util.js").MoldaviteLifeAreaKey} MoldaviteLifeAreaKey */

/**
 * @param {MoldaviteDisplayNamingLevel} level
 * @param {string} displaySubtypeLabel
 * @param {string} displayMainEnergyLabel
 */
function buildMoldaviteWordingByLevel(level, displaySubtypeLabel, displayMainEnergyLabel) {
  if (level === "low") {
    return {
      mainEnergyWordingLine: `${displaySubtypeLabel} — โทนอ่านโดยรวมไปทางการขยับและเปลี่ยนแปลง ไม่ได้ยืนยันชนิดแร่เฉพาะเจาะจงจากภาพเพียงอย่างเดียว ใช้เป็นภาพรวมและอ่านเชิงลึกเพิ่มในรายงานฉบับเต็ม`,
      htmlOpeningLine: `วัตถุชิ้นนี้อยู่ในกลุ่มหินและคริสตัล — ช่วงนี้โฟกัสไปที่มุมการขยับและเปลี่ยนแปลงมากกว่าการนิ่งหรือปลอบใจอย่างเดียว รายละเอียดการใช้และข้อควรระวังอยู่ในรายงานฉบับเต็ม`,
      tagline: "อ่านเป็นภาพรวมในกลุ่มหิน/คริสตัล",
    };
  }
  if (level === "medium") {
    return {
      mainEnergyWordingLine: `${displaySubtypeLabel} — โทนเร่งการเปลี่ยนแปลง ช่วยดันให้สิ่งที่ค้างขยับ เข้ารอบใหม่ได้เร็วขึ้นเมื่อพร้อม พลังนี้เน้นการเคลื่อนไหวมากกว่าการนิ่งหรือปลอบใจอย่างเดียว`,
      htmlOpeningLine: `หิน/คริสตัลโทนเขียว — มุมการอ่านโดยรวมไปทางเร่งการเปลี่ยนแปลง รายละเอียดการใช้ การอ่านเชิงลึก และข้อควรระวังอยู่ในรายงานฉบับเต็ม`,
      tagline: "โทนเขียว · แนวเปลี่ยนแปลง",
    };
  }
  return {
    mainEnergyWordingLine:
      "มอลดาไวต์ — หินเทคไทต์โทนเร่งการเปลี่ยนแปลง ช่วยดันให้สิ่งที่ค้างขยับ เข้ารอบใหม่ได้เร็วขึ้นเมื่อพร้อมปล่อยของเก่า พลังนี้เน้นการเคลื่อนไหวและแปลงสภาพ มากกว่าการนิ่งหรือปลอบใจอย่างเดียว",
    htmlOpeningLine:
      "มอลดาไวต์เป็นหินเทคไทต์ที่มักถูกอ่านในมุมเร่งการเปลี่ยนแปลง — ช่วยให้จุดที่ติดขัดขยับ ปล่อยของเก่าได้ตรงจังหวะ และเริ่มรอบใหม่ได้เร็วขึ้นเมื่อใจพร้อม รายละเอียดการใช้ การอ่านเชิงลึก และข้อควรระวังอยู่ในรายงานฉบับเต็ม",
    tagline: "หินเทคไทต์ · โทนเขียว",
  };
}

/**
 * Moldavite Flex v1 — summary-first: identity, main-energy label, life-area scores on Flex;
 * deeper native-energy copy lives in htmlOpeningLine / mainEnergyWordingLine for HTML/report.
 *
 * @param {MoldaviteLifeAreaKey} primary
 * @param {MoldaviteLifeAreaKey} secondary
 * @param {Record<MoldaviteLifeAreaKey, { key: MoldaviteLifeAreaKey, score: number, labelThai: string }>} lifeAreas
 * @param {ReturnType<typeof resolveMoldaviteDisplayNaming>} naming
 */
function buildFlexSurfaceCopy(primary, secondary, lifeAreas, naming) {
  const displaySubtypeLabel = naming.displaySubtypeLabel;
  const displayMainEnergyLabel = naming.displayMainEnergyLabel;
  const level = naming.displayNamingConfidenceLevel;

  const headline = displaySubtypeLabel;
  const mainEnergyShort = displayMainEnergyLabel;
  const heroNamingLine = `${displaySubtypeLabel} — ${displayMainEnergyLabel}`;

  const primaryLabel = String(lifeAreas[primary]?.labelThai || "").trim() || "งาน";
  const secondaryLabel = String(lifeAreas[secondary]?.labelThai || "").trim() || "การเงิน";

  const fitLine = `โฟกัสช่วงนี้: ${primaryLabel} → ${secondaryLabel}`;

  const tierWording = buildMoldaviteWordingByLevel(
    level,
    displaySubtypeLabel,
    displayMainEnergyLabel,
  );

  return {
    headline,
    fitLine,
    bullets: [],
    mainEnergyShort,
    heroNamingLine,
    mainEnergyWordingLine: tierWording.mainEnergyWordingLine,
    htmlOpeningLine: tierWording.htmlOpeningLine,
    tagline: tierWording.tagline,
  };
}

/**
 * @param {object} p
 * @param {string} p.scanResultId
 * @param {{ reason: string, matchedSignals?: string[] }} p.detection
 * @param {string} p.seedKey
 * @param {number|null} [p.energyScore]
 * @param {string} [p.mainEnergyLabel]
 * @param {ReturnType<import("./moldaviteDisplayNaming.util.js").resolveMoldaviteDisplayNaming>} p.displayNaming
 * @returns {import("../services/reports/reportPayload.types.js").ReportMoldaviteV1}
 */
export function buildMoldaviteV1Slice({
  scanResultId,
  detection,
  seedKey,
  energyScore = null,
  mainEnergyLabel = "",
  displayNaming = resolveMoldaviteDisplayNaming({
    geminiSubtypeConfidence: null,
    moldaviteDecisionSource: "heuristic",
    detectionReason: detection?.reason || "",
  }),
}) {
  const scores = computeMoldaviteLifeAreaScoresDeterministicV1(seedKey);
  const flexSurface = buildFlexSurfaceCopy(
    scores.primaryLifeArea,
    scores.secondaryLifeArea,
    scores.lifeAreas,
    displayNaming,
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
    displayNaming: {
      displayNamingConfidenceLevel: displayNaming.displayNamingConfidenceLevel,
      effectiveSubtypeConfidenceForNaming:
        displayNaming.effectiveSubtypeConfidenceForNaming,
    },
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
