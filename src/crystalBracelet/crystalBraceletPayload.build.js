import {
  CRYSTAL_BRACELET_AXIS_ORDER,
  computeCrystalBraceletAlignmentAxisKey,
  computeCrystalBraceletOwnerAxisScoresV1,
  computeCrystalBraceletScoresDeterministicV1,
} from "./crystalBraceletScores.util.js";
import {
  crystalBraceletOwnerProfileFlexTeaser,
  deriveCrystalBraceletOwnerProfile,
} from "./crystalBraceletOwnerProfile.util.js";

/**
 * @param {string} primary — พีคพลังกำไล (เดียวกับเรดาร์/HTML)
 * @param {string} alignAxis — แกนเข้ากันสุด (min |จังหวะผู้สวม − พลังกำไล|)
 * @param {Record<string, { key: string, score: number, labelThai: string }>} axes
 * @param {{
 *   headline: string,
 *   mainEnergyShort: string,
 *   tagline: string,
 *   ownerFitBand?: string|null,
 * }} surface
 */
function buildCrystalBraceletFlexSurfaceCopy(primary, alignAxis, axes, surface) {
  const primaryLabel =
    String(axes[primary]?.labelThai || "").trim() || "การงาน";
  const alignLabel =
    String(axes[alignAxis]?.labelThai || "").trim() || "การงาน";

  const fitLine =
    primary === alignAxis
      ? `ตอนนี้เด่นสุดที่ ${primaryLabel}`
      : `ตอนนี้เด่นสุดที่ ${primaryLabel} · เข้ากันสุดที่ ${alignLabel}`;
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
 * @param {string} primary — พีคพลังกำไล (คะแนนสูงสุด)
 * @param {string} secondary — มิติรองจากคะแนน
 * @param {string} _alignAxis — แกน alignment (ใช้บนเรดาร์ ไม่ใส่ใน graphSummaryRows)
 */
function buildCrystalBraceletHtmlReport(axes, primary, secondary, _alignAxis) {
  void _alignAxis;
  const primaryLabel =
    String(axes[primary]?.labelThai || "").trim() || "การงาน";
  const secondaryLabel =
    String(axes[secondary]?.labelThai || "").trim() || "การงาน";

  return {
    meaningParagraphs: [
      "กำไลหินคริสตัลเส้นนี้อ่านจากพลังรวมของวัตถุทั้งเส้น ไม่ได้ฟันธงชนิดหินรายเม็ดจากภาพเพียงอย่างเดียว",
      "การแปลผลใช้มิติพลังงานชุดใหม่หกด้าน (เสน่ห์ การเงิน การงาน โชคลาภ เซ้นส์ ความรัก) เพื่อดูว่าช่วงนี้โทนรวมของกำไลเอียงไปทางด้านใดมากที่สุด และด้านใดมาถัดไป",
    ],
    graphSummaryRows: [
      `เด่นสุดที่ ${primaryLabel}`,
      `รองลงมาที่ ${secondaryLabel}`,
    ],
    axisBlurbs: {
      charm_attraction:
        "เสน่ห์(ดึงดูด) — หนุนแรงดึงดูด ภาพลักษณ์ และความรู้สึกน่าเข้าหา",
      money:
        "การเงิน — หนุนการจัดการเงิน ช่องทางรายรับ และจังหวะเรื่องผลตอบแทน",
      career:
        "การงาน — หนุนการลงมือ ความต่อเนื่อง และความชัดในงาน",
      luck:
        "โชคลาภ — หนุนจังหวะเปิดทาง เรื่องฟลุค หรือเหตุการณ์ดี ๆ ที่เข้ามาแบบไม่คาดฝัน",
      intuition:
        "เซ้นส์ — หนุนการรับสัญญาณ ความไวต่อจังหวะ และการตัดสินใจจากความรู้สึก",
      love:
        "ความรัก — หนุนเรื่องความสัมพันธ์ ความอ่อนโยน และความรู้สึกเชื่อมโยง",
    },
    usageCautionLines: [
      "ผลนี้ใช้เป็นกรอบอ่านพลังโดยรวมของวัตถุ ไม่ใช่การยืนยันชนิดแร่เชิงวิทยาศาสตร์",
      "หากช่วงนี้ใจล้าหรือมีเรื่องกดดันมาก ควรอ่านผลแบบค่อยเป็นค่อยไปและดูร่วมกับสภาพชีวิตจริง",
      "การอ่านนี้ไม่ใช่คำแนะนำทางการแพทย์ การเงิน หรือกฎหมาย",
    ],
    interactionSummary: [
      "การอ่านค่าจากกำไลขึ้นกับบริบทการใช้งาน — ใช้เป็นแนวสังเกต ไม่ใช่คำฟันธง",
      "หากอยากเจาะลึกแต่ละด้าน ให้ดูคำอธิบายสั้น ๆ ใต้หัวข้อมิติด้านล่าง",
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
 * @param {string|null} [p.birthdateUsed]
 * @param {number} [p.confidenceDamp]
 * @returns {import("../services/reports/reportPayload.types.js").ReportCrystalBraceletV1}
 */
export function buildCrystalBraceletV1Slice({
  scanResultId,
  seedKey,
  detection,
  energyScore = null,
  mainEnergyLabel = "",
  ownerFitScore = null,
  birthdateUsed = null,
  confidenceDamp,
}) {
  const scores = computeCrystalBraceletScoresDeterministicV1(seedKey, {
    sessionKey: scanResultId,
    mainEnergyLabel,
    ownerFitScore,
    confidenceDamp,
  });

  const headline = "กำไลหินคริสตัล";
  const primaryAxisLabel =
    String(scores.axes[scores.primaryAxis]?.labelThai || "").trim();
  const mainEnergyShort =
    String(mainEnergyLabel || "").trim().slice(0, 24) ||
    primaryAxisLabel ||
    "พลังรวมของกำไล";
  const tagline = "กำไลหินคริสตัล · อ่านจากพลังรวม";

  /** @type {Record<string, number>} */
  const stoneScoresMap = {};
  for (const k of CRYSTAL_BRACELET_AXIS_ORDER) {
    const sc = scores.axes[k]?.score;
    stoneScoresMap[k] =
      sc != null && Number.isFinite(Number(sc)) ? Number(sc) : 0;
  }
  const ownerAxisForAlign = computeCrystalBraceletOwnerAxisScoresV1(
    seedKey,
    scanResultId,
    stoneScoresMap,
    scores.ownerFit?.score ?? null,
  );
  const alignAxis = computeCrystalBraceletAlignmentAxisKey(
    stoneScoresMap,
    ownerAxisForAlign,
  );

  const ownerProfile = deriveCrystalBraceletOwnerProfile({
    birthdateUsed,
    ownerFitScore: scores.ownerFit?.score ?? ownerFitScore ?? null,
    stableSeed: String(scanResultId || seedKey || "").trim(),
    stoneScores: stoneScoresMap,
    ownerAxisScores: ownerAxisForAlign,
    primaryAxis: scores.primaryAxis,
    alignAxisKey: alignAxis,
  });

  const flexSurface = {
    ...buildCrystalBraceletFlexSurfaceCopy(
      scores.primaryAxis,
      alignAxis,
      scores.axes,
      {
        headline,
        mainEnergyShort,
        tagline,
        ownerFitBand: scores.ownerFit?.band ?? null,
      },
    ),
    ownerProfileTeaser: crystalBraceletOwnerProfileFlexTeaser(ownerProfile),
  };

  const htmlReport = buildCrystalBraceletHtmlReport(
    scores.axes,
    scores.primaryAxis,
    scores.secondaryAxis,
    alignAxis,
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
    ownerProfile,
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
