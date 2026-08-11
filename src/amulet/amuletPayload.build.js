import {
  computeAmuletPowerScores,
  computeAmuletPowerScoresFromFeaturesV4,
  POWER_LABEL_THAI,
} from "./amuletScores.util.js";
import { buildAmuletStableSignature } from "./amuletFeatureProfile.util.js";

/** evidence_score_v4 (11 ส.ค. 2026): เปิดเฉพาะ staging ผ่าน env — default ปิด, ปิดแล้วกลับ v3 ทันที */
export function amuletScoreV4Enabled() {
  return String(process.env.AMULET_SCORE_V4_ENABLED ?? "false").trim().toLowerCase() === "true";
}
import { AMULET_HTML_V2_USAGE_DISCLAIMER } from "./amuletHtmlV2.model.js";

/**
 * @param {import("./amuletScores.util.js").AmuletPowerKey} primary
 * @param {import("./amuletScores.util.js").AmuletPowerKey} secondary
 * @param {Record<string, { key: string, score: number, labelThai: string }>} powerCategories
 * @param {{ headline: string, mainEnergyShort: string, tagline: string }} surface
 */
export function buildAmuletFlexSurfaceCopy(primary, secondary, powerCategories, surface) {
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
    mainEnergyWordingLine: `โทนหลัก: ${mainShort} · เจ็ดมิติพลัง`,
    htmlOpeningLine: "เปิดจากคะแนน แล้วไล่รายละเอียดตามลำดับ",
    tagline: surface.tagline,
  };
}

function buildAmuletHtmlReportPlaceholder() {
  /** Same line as HTML footer disclaimer (`AMULET_HTML_V2_USAGE_DISCLAIMER` / `usageCaution.disclaimer`). */
  const usageCautionLines = [AMULET_HTML_V2_USAGE_DISCLAIMER];

  /** Blurbs generated in `amuletHtmlV2.model` + `amuletMeaningBlurbs.util` when empty. */
  return { lifeAreaBlurbs: {}, usageCautionLines };
}

/**
 * @param {object} p
 * @param {string} p.scanResultId
 * @param {string} p.seedKey — stable feature seed (preferred). Avoid per-scan ids: they make rescans diverge.
 * @param {{ primaryColor?: string, materialType?: string, formFactor?: string, textureHint?: string }|null} [p.stableFeatureFields] — raw vision slugs; when present, angle-robust feature_blend_v3 is used
 * @param {number|null} [p.energyScore]
 * @param {string} [p.mainEnergyLabel]
 * @returns {import("../services/reports/reportPayload.types.js").ReportAmuletV1}
 */
export function buildAmuletV1Slice({
  scanResultId,
  seedKey,
  stableFeatureFields = null,
  energyScore = null,
  mainEnergyLabel = "",
  typedLabelThai = "",
}) {
  // v4: สูตรเป็นเจ้าของเลขชุดเดียว — ไม่รับ mainEnergyLabel จาก LLM (ตัด circular nudge)
  // ใช้เฉพาะชิ้นใหม่ที่มี features จริง · flag ปิด = v3 เดิมเป๊ะ · baseline reuse ของเก่าไม่ผ่านทางนี้
  const useV4 =
    amuletScoreV4Enabled() &&
    stableFeatureFields &&
    buildAmuletStableSignature(stableFeatureFields) != null;
  const scores = useV4
    ? computeAmuletPowerScoresFromFeaturesV4(stableFeatureFields, { seedKey })
    : computeAmuletPowerScores({
        features: stableFeatureFields,
        seedKey,
        sessionKey: scanResultId,
        mainEnergyLabel,
      });
  // ระบุประเภทพิมพ์: confidence-gated classifier label (เช่น พระสมเด็จ) — flows
  // to Flex headline, summary.headlineShort and the HTML report h1 together.
  const headline = String(typedLabelThai || "").trim() || "พระ/เทวรูป/เครื่องราง";
  const mainShort =
    String(mainEnergyLabel || "").trim().slice(0, 22) || "พลังมุ่งเน้นรวม";
  const tagline = `${headline} · เจ็ดมิติพลัง`;

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
    // v4 เท่านั้น: breakdown ฝั่ง admin/QA (public mapper ตัดออกก่อนถึงลูกค้า) + ความมั่นใจจากหลักฐานภาพ
    ...(useV4
      ? { scoreBreakdown: scores.breakdown, readingConfidence: scores.readingConfidence }
      : {}),
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
