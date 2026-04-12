import { computeCrystalBraceletScoresDeterministicV1 } from "./crystalBraceletScores.util.js";

/**
 * @param {string} primary
 * @param {string} secondary
 * @param {Record<string, { key: string, score: number, labelThai: string }>} axes
 * @param {{
 *   headline: string,
 *   mainEnergyShort: string,
 *   tagline: string,
 *   ownerFitBand?: string|null,
 * }} surface
 */
function buildCrystalBraceletFlexSurfaceCopy(primary, secondary, axes, surface) {
  const primaryLabel =
    String(axes[primary]?.labelThai || "").trim() || "งานและเป้าหมาย";
  const secondaryLabel =
    String(axes[secondary]?.labelThai || "").trim() || "การเงินและโอกาส";

  const fitLine = `ตอนนี้เด่นสุด: ${primaryLabel} → ${secondaryLabel}`;
  const bullets = [];
  const ctaLabel = "ดูรายงานพลังของกำไลเส้นนี้";

  return {
    headline: surface.headline,
    fitLine,
    bullets,
    ctaLabel,
    mainEnergyShort: surface.mainEnergyShort,
    heroNamingLine: `${surface.headline} — ${surface.mainEnergyShort}`,
    mainEnergyWordingLine:
      "กำไลเส้นนี้อ่านจากโทนพลังรวมของชิ้น ไม่ได้ยืนยันชนิดหินเฉพาะจากภาพเพียงอย่างเดียว",
    htmlOpeningLine:
      "ผลนี้เน้นการอ่านภาพรวมของพลังในกำไลหินคริสตัล โดยดูว่าช่วงนี้พลังไปเด่นในมิติใดของชีวิตมากกว่า",
    tagline: surface.tagline,
  };
}

/**
 * @param {Record<string, { key: string, score: number, labelThai: string }>} axes
 * @param {string} primary
 * @param {string} secondary
 */
function buildCrystalBraceletHtmlReport(axes, primary, secondary) {
  const primaryLabel =
    String(axes[primary]?.labelThai || "").trim() || "งานและเป้าหมาย";
  const secondaryLabel =
    String(axes[secondary]?.labelThai || "").trim() || "การเงินและโอกาส";

  return {
    meaningParagraphs: [
      "กำไลหินคริสตัลเส้นนี้อ่านจากพลังรวมของวัตถุทั้งเส้น ไม่ได้ฟันธงชนิดหินรายเม็ดจากภาพเพียงอย่างเดียว",
      "การแปลผลจึงเน้นว่าในช่วงนี้พลังของกำไลไปหนุนมิติไหนของชีวิตมากที่สุด และเข้ากับจังหวะของผู้สวมอย่างไร",
    ],
    graphSummaryRows: [
      `พลังของกำไลเส้นนี้ไปเด่นสุดที่ ${primaryLabel}`,
      `รองลงมาคือ ${secondaryLabel}`,
    ],
    axisBlurbs: {
      money:
        "ด้านการเงินและโอกาส — หนุนการเปิดทาง การมองเห็นช่องทางใหม่ และการขยับเรื่องผลลัพธ์ให้ชัดขึ้น",
      work:
        "ด้านงานและเป้าหมาย — ช่วยให้มีแรงจัดระเบียบ เป้าหมายชัด และเดินหน้าได้ต่อเนื่องขึ้น",
      relationship:
        "ด้านความสัมพันธ์ — ช่วยให้การสื่อสารนุ่มขึ้น เปิดใจง่ายขึ้น และลดแรงตึงในความสัมพันธ์",
      balance:
        "ด้านสมดุลใจ — เน้นการประคองอารมณ์ ลดความฟุ้ง และทำให้ใจกลับมาตั้งหลักได้ง่ายขึ้น",
      drive:
        "ด้านพลังขับเคลื่อน — หนุนแรงลงมือ ความมั่นใจ และความต่อเนื่องในการขยับสิ่งที่ตั้งใจไว้",
      owner_fit:
        "ด้านความเข้ากันกับผู้สวม — ดูว่าพลังของกำไลเข้ากับจังหวะชีวิตและสภาพใจของเจ้าของมากน้อยแค่ไหน",
    },
    usageCautionLines: [
      "ผลนี้ใช้เป็นกรอบอ่านพลังโดยรวมของวัตถุ ไม่ใช่การยืนยันชนิดแร่เชิงวิทยาศาสตร์",
      "หากช่วงนี้ใจล้าหรือมีเรื่องกดดันมาก ควรอ่านผลแบบค่อยเป็นค่อยไปและดูร่วมกับสภาพชีวิตจริง",
      "การอ่านนี้ไม่ใช่คำแนะนำทางการแพทย์ การเงิน หรือกฎหมาย",
    ],
    ownerProfile: {
      summaryLabel: "โปรไฟล์ผู้สวม",
      traits: [],
      sensitiveAxes: [],
    },
    interactionSummary: [
      "กำไลเส้นนี้ไม่ได้ทำงานกับทุกคนเหมือนกัน",
      "พลังจะเด่นขึ้นในมิติที่ตรงกับจังหวะชีวิตของผู้สวมช่วงนี้",
    ],
  };
}

/**
 * @param {object} p
 * @param {string} p.scanResultId
 * @param {string} p.seedKey
 * @param {{ reason: string, matchedSignals?: string[] }} p.detection
 * @param {number|null} [p.energyScore]
 * @param {string} [p.mainEnergyLabel]
 * @param {number|null} [p.ownerFitScore]
 * @returns {import("../services/reports/reportPayload.types.js").ReportCrystalBraceletV1}
 */
export function buildCrystalBraceletV1Slice({
  scanResultId,
  seedKey,
  detection,
  energyScore = null,
  mainEnergyLabel = "",
  ownerFitScore = null,
}) {
  const scores = computeCrystalBraceletScoresDeterministicV1(seedKey, {
    sessionKey: scanResultId,
    mainEnergyLabel,
    ownerFitScore,
  });

  const headline = "กำไลหินคริสตัล";
  const mainEnergyShort =
    String(mainEnergyLabel || "").trim().slice(0, 24) || "พลังรวมของกำไล";
  const tagline = "กำไลหินคริสตัล · อ่านจากพลังรวม";

  const flexSurface = buildCrystalBraceletFlexSurfaceCopy(
    scores.primaryAxis,
    scores.secondaryAxis,
    scores.axes,
    {
      headline,
      mainEnergyShort,
      tagline,
      ownerFitBand: scores.ownerFit?.band ?? null,
    },
  );

  const htmlReport = buildCrystalBraceletHtmlReport(
    scores.axes,
    scores.primaryAxis,
    scores.secondaryAxis,
  );

  return {
    version: "1",
    scoringMode: scores.scoringMode,
    detection: {
      reason: detection?.reason || "crystal_bracelet_lane_v1",
      matchedSignals:
        detection?.matchedSignals && Array.isArray(detection.matchedSignals)
          ? detection.matchedSignals
          : [],
    },
    lane: "crystal_bracelet",
    identity: {
      objectFamily: "crystal",
      formFactor: "bracelet",
      compositionMode: "mixed",
    },
    axes: scores.axes,
    primaryAxis: scores.primaryAxis,
    secondaryAxis: scores.secondaryAxis,
    ownerFit: scores.ownerFit,
    flexSurface,
    htmlReport,
    display: {
      displayLabel: "กำไลหินคริสตัล",
      visibleMainEnergyLabel: mainEnergyShort,
      namingPolicy: "generic_crystal_bracelet",
    },
    context: {
      scanResultIdPrefix: String(scanResultId || "").slice(0, 8),
      energyScoreSnapshot:
        energyScore != null && Number.isFinite(Number(energyScore))
          ? Number(energyScore)
          : null,
      mainEnergyLabelSnapshot: String(mainEnergyLabel || "").trim() || null,
    },
    internalHints: {
      internalStoneHints: [],
      internalToneSignals: [],
      subtypeConfidenceHidden: null,
    },
  };
}
