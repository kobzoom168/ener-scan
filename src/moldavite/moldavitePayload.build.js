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
 * Deeper HTML-only blocks (public report). Not used by Flex; stays in Moldavite semantic lane.
 *
 * @param {"high"|"medium"|"low"} level
 * @param {string} displaySubtypeLabel
 */
function buildMoldaviteHtmlReport(level, displaySubtypeLabel) {
  /** @type {string[]} */
  let meaningParagraphs;
  if (level === "low") {
    meaningParagraphs = [
      `${displaySubtypeLabel} — อ่านเป็นภาพรวมว่าโทนไปทางการขยับและเปลี่ยนแปลง ไม่ใช่การยืนยันชนิดแร่จากภาพเพียงอย่างเดียว`,
      "ในสายหินเทคไทต์ มอลดาไวต์มักถูกอ่านเป็นพลังที่เร่งจังหวะเปลี่ยนแปลง — ช่วยให้จุดที่ติดขัดขยับ ปล่อยของเก่า และเริ่มรอบใหม่เมื่อพร้อม ไม่ใช่พลังเน้นความนิ่งหรือปลอบใจอย่างเดียว",
    ];
  } else if (level === "medium") {
    meaningParagraphs = [
      `${displaySubtypeLabel} — โทนเร่งการเปลี่ยนแปลง ช่วยดันให้สิ่งที่ค้างขยับ เข้ารอบใหม่ได้เร็วขึ้นเมื่อพร้อม`,
      "โทนนี้เน้นการเคลื่อนไหวและแปลงสภาพ มากกว่าการหลบหรือรักษาสภาวะเดิม — ใช้เป็นกรอบอ่านชีวิต ไม่ใช่คำทำนายแน่นอน",
    ];
  } else {
    meaningParagraphs = [
      "มอลดาไวต์ — หินเทคไทต์ที่มักถูกอ่านในมุมเร่งการเปลี่ยนแปลง: ช่วยให้สิ่งที่ค้างขยับ ปล่อยของเก่าได้ตรงจังหวะ และเริ่มรอบใหม่ได้เร็วขึ้นเมื่อใจพร้อม",
      "พลังนี้ไม่ได้สัญญาผลลัพธ์ — แต่ชี้โครงสร้างของประสบการณ์ว่า ‘ขยับและเปลี่ยน’ มักชัดกว่า ‘นิ่งและประคอง’ เมื่อเทียบกับพลังสายอื่น",
    ];
  }

  const lifeAreaBlurbs = {
    work:
      "ด้านงาน — บทบาท เป้าหมาย หรือโครงสร้างที่ค้าง พลังโทนนี้มักไปกระตุ้นให้ปรับกรอบหรือเริ่มขั้นตอนใหม่เมื่อพร้อมรับความเปลี่ยนแปลง",
    relationship:
      "ด้านความสัมพันธ์ — รูปแบบการสื่อสารหรือขอบเขตที่ต้องเคลียร์ เน้นการขยับดีลหรือความชัดเจนมากกว่าการหลบหรือประคองอย่างเดียว",
    money:
      "ด้านการเงิน — กระแสรายรับรายจ่ายหรือการตัดสินใจเชิงโครงสร้าง ช่วยให้เห็นจุดที่ควรปรับก่อนเร่ง ไม่ใช่คำแนะนำการลงทุน",
  };

  const usageCautionLines = [
    "เหมาะเมื่อต้องการเร่งให้เรื่องที่ค้างขยับ หรือเปลี่ยนกรอบเดิมในจังหวะที่พร้อมรับความไม่แน่นอน",
    "อาจรู้สึกเข้มหรือเร่งเกินจังหวะเมื่อใจยังไม่พร้อมปล่อย — ลดจังหวะ แยกแยะความรู้สึก และใช้เป็นกรอบอ่าน ไม่ใช่คำสั่ง",
    "การอ่านนี้ไม่ใช่คำแนะนำทางการแพทย์หรือการเงิน — หากมีสุขภาพหรือหนี้สินรุนแรง ควรปรึกษาผู้เชี่ยวชาญ",
  ];

  return {
    meaningParagraphs,
    lifeAreaBlurbs,
    usageCautionLines,
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

  const fitLine = `ตอนนี้เด่นสุด: ${primaryLabel} → ${secondaryLabel}`;

  const bullets = [
    `เด่นเรื่อง${primaryLabel} ช่วยให้ขยับชัดขึ้นก่อน`,
    "เหมาะเมื่ออยากเริ่มขยับจากเรื่องที่ค้างอยู่",
  ];

  const ctaLabel = "ดูว่าชิ้นนี้ช่วยคุณยังไง";

  const tierWording = buildMoldaviteWordingByLevel(
    level,
    displaySubtypeLabel,
    displayMainEnergyLabel,
  );

  return {
    headline,
    fitLine,
    bullets,
    ctaLabel,
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

  const htmlReport = buildMoldaviteHtmlReport(
    displayNaming.displayNamingConfidenceLevel,
    displayNaming.displaySubtypeLabel,
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
    htmlReport,
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
