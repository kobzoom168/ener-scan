/**
 * Phase 2A: build a fresh public report payload from a stored global object baseline
 * plus the current user's birthdate / URLs / tokens (no cross-user owner copy).
 */

import { REPORT_PAYLOAD_VERSION } from "../reports/reportPayload.types.js";
import { sanitizeHttpsPublicImageUrl } from "../../utils/reports/reportImageUrl.util.js";
import { parseScanText } from "../flex/flex.parser.js";
import { deriveReportWordingFromParsed } from "../reports/reportWording.derive.js";
import { buildCompatibilityPayload } from "../reportPayload/buildCompatibilityPayload.js";
import { buildObjectEnergyPayload } from "../reportPayload/buildObjectEnergyPayload.js";
import { scanDimensionsFromObjectEnergyStars } from "../../utils/objectEnergyFormula.util.js";
import {
  AMULET_PEAK_SHORT_THAI,
  deriveSacredAmuletEnergyScore10FromPowerCategories,
  POWER_ORDER,
  POWER_LABEL_THAI,
} from "../../amulet/amuletScores.util.js";
import { buildAmuletFlexSurfaceCopy } from "../../amulet/amuletPayload.build.js";
import { score10ToEnergyGrade } from "../../utils/reports/energyLevelGrade.util.js";
import { computeTimingV1 } from "../timing/timingEngine.service.js";
import {
  normalizeBirthdateIso,
  parseIsoYmd,
} from "../../utils/compatibilityFormula.util.js";
import { formatScanBirthdayLabelThai } from "../../utils/scanBirthdayLabel.util.js";
import { inferEnergyCategoryCodeFromMainEnergy } from "../../utils/energyCategoryResolve.util.js";
import { normalizeObjectFamilyForEnergyCopy } from "../../utils/energyCategoryResolve.util.js";
import { resolveCrystalMode } from "../../utils/energyCategoryResolve.util.js";

/** @typedef {import("../../stores/scanV2/globalObjectBaselines.db.js").GlobalObjectBaselineRow} GlobalObjectBaselineRow */

/**
 * @param {GlobalObjectBaselineRow} baselineRow
 * @returns {Record<string, number>}
 */
function axisScoresFromBaseline(baselineRow) {
  const ax = baselineRow.axisScoresJson;
  if (ax && typeof ax === "object" && !Array.isArray(ax)) {
    /** @type {Record<string, number>} */
    const out = {};
    for (const k of POWER_ORDER) {
      const n = Number(/** @type {Record<string, unknown>} */ (ax)[k]);
      out[k] = Number.isFinite(n) ? Math.round(Math.min(100, Math.max(0, n))) : 0;
    }
    if (POWER_ORDER.some((k) => out[k] > 0)) return out;
  }
  const ob = baselineRow.objectBaselineJson;
  if (ob && typeof ob === "object" && !Array.isArray(ob)) {
    const pc = /** @type {Record<string, unknown>} */ (ob).powerCategories;
    if (pc && typeof pc === "object" && !Array.isArray(pc)) {
      /** @type {Record<string, number>} */
      const out = {};
      for (const k of POWER_ORDER) {
        const e = /** @type {Record<string, unknown>} */ (pc)[k];
        const sc =
          e && typeof e === "object" && e !== null && "score" in e
            ? Number(/** @type {{ score?: unknown }} */ (e).score)
            : NaN;
        out[k] = Number.isFinite(sc) ? Math.round(Math.min(100, Math.max(0, sc))) : 0;
      }
      return out;
    }
  }
  throw new Error("baseline_axis_scores_missing");
}

/**
 * @param {import("../../amulet/amuletScores.util.js").AmuletPowerKey} peak
 * @param {Record<string, number>} axisScores
 * @returns {{ primary: import("../../amulet/amuletScores.util.js").AmuletPowerKey, secondary: import("../../amulet/amuletScores.util.js").AmuletPowerKey }}
 */
function primarySecondaryFromPeakAndAxes(peak, axisScores) {
  const sorted = [...POWER_ORDER].sort((a, b) => axisScores[b] - axisScores[a]);
  const peakOk = peak && POWER_ORDER.includes(peak);
  const primary =
    peakOk && sorted.includes(peak)
      ? peak
      : /** @type {import("../../amulet/amuletScores.util.js").AmuletPowerKey} */ (sorted[0]);
  const secondary = /** @type {import("../../amulet/amuletScores.util.js").AmuletPowerKey} */ (
    sorted.find((k) => k !== primary) || sorted[1]
  );
  return { primary, secondary };
}

/**
 * @param {object} p
 * @param {GlobalObjectBaselineRow} p.baselineRow
 * @param {string} p.lineUserId
 * @param {string} p.birthdate
 * @param {string} p.publicToken
 * @param {string} p.objectImageUrl
 * @param {string} p.scannedAtIso
 * @param {string} p.scanRequestId
 * @param {string} p.legacyScanResultId
 * @returns {Promise<import("../reports/reportPayload.types.js").ReportPayload>}
 */
export async function buildReportPayloadFromGlobalBaseline(p) {
  const {
    baselineRow,
    lineUserId,
    birthdate,
    publicToken,
    objectImageUrl: objectImageUrlRaw,
    scannedAtIso,
    scanRequestId,
    legacyScanResultId,
  } = p;

  const rid = String(legacyScanResultId || "").trim();
  const tok = String(publicToken || "").trim();
  const objectImageUrl = sanitizeHttpsPublicImageUrl(objectImageUrlRaw);

  const axisScores = axisScoresFromBaseline(baselineRow);
  /** @type {import("../../amulet/amuletScores.util.js").AmuletPowerKey} */
  const peakKey =
    baselineRow.peakPowerKey && POWER_ORDER.includes(String(baselineRow.peakPowerKey))
      ? /** @type {import("../../amulet/amuletScores.util.js").AmuletPowerKey} */ (
          String(baselineRow.peakPowerKey)
        )
      : /** @type {import("../../amulet/amuletScores.util.js").AmuletPowerKey} */ (
          [...POWER_ORDER].sort((a, b) => axisScores[b] - axisScores[a])[0]
        );

  const { primary, secondary } = primarySecondaryFromPeakAndAxes(peakKey, axisScores);

  /** @type {Record<string, { key: string, score: number, labelThai: string }>} */
  const powerCategories = {};
  for (const k of POWER_ORDER) {
    powerCategories[k] = {
      key: k,
      score: axisScores[k] ?? 0,
      labelThai: POWER_LABEL_THAI[k],
    };
  }

  const mainEnergyShort = String(AMULET_PEAK_SHORT_THAI[primary] || "").trim() || "คุ้มครอง";
  const flexSurface = buildAmuletFlexSurfaceCopy(primary, secondary, powerCategories, {
    headline: "พระเครื่อง",
    mainEnergyShort,
    tagline: "พระเครื่อง · หกมิติพลัง",
  });

  const amuletV1 = {
    version: "1",
    scoringMode: String(baselineRow.scoringVersion || "").trim() || "deterministic_v2",
    detection: {
      reason: "global_object_baseline_reuse_v1",
      matchedSignals: [],
    },
    powerCategories,
    primaryPower: primary,
    secondaryPower: secondary,
    flexSurface,
    htmlReport: {
      lifeAreaBlurbs: {},
      usageCautionLines: [],
    },
    context: {
      scanResultIdPrefix: rid.slice(0, 8),
      energyScoreSnapshot: null,
      mainEnergyLabelSnapshot: mainEnergyShort,
    },
  };

  const summaryEnergyScore = deriveSacredAmuletEnergyScore10FromPowerCategories(powerCategories);
  const summaryEnergyLevelLabel =
    summaryEnergyScore != null && Number.isFinite(Number(summaryEnergyScore))
      ? score10ToEnergyGrade(Number(summaryEnergyScore))
      : "";

  const ob = baselineRow.objectBaselineJson;
  const vis =
    ob && typeof ob === "object" && !Array.isArray(ob)
      ? /** @type {Record<string, unknown>} */ (ob).visual
      : null;
  const materialFamily =
    vis && typeof vis === "object" && vis !== null && "materialType" in vis
      ? String(/** @type {{ materialType?: unknown }} */ (vis).materialType || "").trim() || undefined
      : undefined;
  const shapeFamily =
    vis && typeof vis === "object" && vis !== null && "formFactor" in vis
      ? String(/** @type {{ formFactor?: unknown }} */ (vis).formFactor || "").trim() || "unknown"
      : "unknown";
  const dominantColor =
    vis && typeof vis === "object" && vis !== null && "dominantColor" in vis
      ? String(/** @type {{ dominantColor?: unknown }} */ (vis).dominantColor || "").trim() || undefined
      : undefined;

  const scannedAt = String(scannedAtIso || "").trim() || new Date().toISOString();
  const compatPayload = buildCompatibilityPayload({
    birthdate: String(birthdate || "").trim(),
    scannedAt,
    objectFamily: "sacred_amulet",
    materialFamily,
    shapeFamily,
    mainEnergy: mainEnergyShort,
    energyScore: summaryEnergyScore,
    dominantColor,
    objectCategory: null,
    conditionClass: undefined,
  });

  const compatPct = compatPayload.score;
  const synthetic = [
    `[GLOBAL_OBJECT_BASELINE_REUSE]`,
    `baseline_id=${String(baselineRow.id).slice(0, 8)}`,
    `peak_power_key=${primary}`,
    "",
    "พลังหลัก:",
    mainEnergyShort,
    "ระดับพลัง:",
    String(summaryEnergyScore ?? "-"),
    "ความสอดคล้องกับเจ้าของ:",
    `${compatPct}%`,
    "ลักษณะพลัง",
    "สรุปจากคลังพลังวัตถุส่วนกลาง คะแนนหกแกนคงที่กับภาพเดิม",
    "ภาพรวม",
    "รายงานนี้ประกอบจากพลังวัตถุที่บันทึกไว้ และคำนวณความเข้ากันกับวันเกิดของคุณใหม่",
    "เหตุผลที่เข้ากับเจ้าของ",
    "จับคู่พลังหลักกับแนวโน้มเจ้าของจากวันเกิดปัจจุบัน",
  ].join("\n");

  const parsed = parseScanText(synthetic);
  const wording = deriveReportWordingFromParsed(parsed, {
    energyScore: summaryEnergyScore,
    compatibilityPercent: compatPct,
    objectFamily: "sacred_amulet",
    seed: tok || rid,
  });

  const objectEnergyPayload = buildObjectEnergyPayload({
    objectFamily: "sacred_amulet",
    materialFamily,
    dominantColor,
    conditionClass: undefined,
    shapeFamily,
    energyScore: summaryEnergyScore,
    mainEnergy: mainEnergyShort,
    objectCheckResult: "single_supported",
    objectCheckConfidence: 0.95,
  });

  const energyCategoryCode = inferEnergyCategoryCodeFromMainEnergy(
    mainEnergyShort,
    "sacred_amulet",
  );
  const crystalMode = resolveCrystalMode("sacred_amulet", mainEnergyShort);
  const famNorm = normalizeObjectFamilyForEnergyCopy("sacred_amulet");

  /** @type {import("../reports/reportPayload.types.js").ReportTimingV1 | undefined} */
  let timingV1;
  const bdIso = normalizeBirthdateIso(String(birthdate || "").trim());
  if (bdIso && parseIsoYmd(bdIso)) {
    const fit = Math.round(
      Math.min(100, Math.max(0, Number.isFinite(Number(compatPct)) ? Number(compatPct) : 0)),
    );
    timingV1 = computeTimingV1({
      birthdateIso: bdIso,
      lane: "sacred_amulet",
      primaryKey: String(primary),
      secondaryKey: String(secondary),
      scannedAtIso: scannedAt,
      compatibilityScore: Number.isFinite(Number(compatPct)) ? Math.round(Number(compatPct)) : undefined,
      ownerFitScore: fit,
    });
  }

  const birthdayLabel = formatScanBirthdayLabelThai(String(birthdate || "").trim());

  return {
    reportId: rid,
    publicToken: tok,
    scanId: String(scanRequestId || "").trim(),
    userId: String(lineUserId || "").trim(),
    birthdateUsed: String(birthdate || "").trim() || null,
    generatedAt: new Date().toISOString(),
    scannedAt,
    reportVersion: REPORT_PAYLOAD_VERSION,
    object: {
      objectImageUrl,
      objectLabel: "วัตถุจากการสแกน",
      objectType: "",
    },
    summary: {
      energyScore: summaryEnergyScore,
      energyLevelLabel: summaryEnergyLevelLabel,
      mainEnergyLabel: mainEnergyShort,
      compatibilityPercent: compatPct,
      compatibilityBand: compatPayload.band,
      summaryLine: wording.summaryLine,
      wordingFamily: wording.wordingFamily || undefined,
      clarityLevel: wording.clarityLevel || undefined,
      birthdayLabel: birthdayLabel || undefined,
      compatibilityReason: wording.compatibilityReason || undefined,
      secondaryEnergyLabel: wording.secondaryEnergyLabel || undefined,
      scanDimensions: objectEnergyPayload?.stars
        ? scanDimensionsFromObjectEnergyStars(objectEnergyPayload.stars)
        : undefined,
      scanTips: [],
      headlineShort: flexSurface.headline,
      fitReasonShort: flexSurface.fitLine,
      bulletsShort: flexSurface.bullets,
      ctaLabel: flexSurface.ctaLabel,
      presentationAngleId: "sacred_amulet_v1_summary_first",
      wordingVariantId: "sacred_amulet_v1_summary_first",
      energyCategoryCode,
      energyCopyObjectFamily: famNorm,
      crystalMode,
      openingShort: undefined,
      teaserShort: undefined,
      visibleMainLabel: flexSurface.headline,
    },
    sections: {
      whatItGives: [],
      messagePoints: [],
      ownerMatchReason: [],
      roleDescription: [],
      bestUseCases: [],
      weakMoments: [],
      guidanceTips: [],
      careNotes: [],
      miniRitual: [],
    },
    trust: {
      modelLabel: "global_object_baseline_reuse",
      trustNote:
        "รายงานนี้ใช้คะแนนพลังวัตถุจากคลังส่วนกลางของภาพเดียวกัน และคำนวณความเข้ากันกับวันเกิดของคุณใหม่",
      rendererVersion: "html-1.0.0",
    },
    actions: {
      historyUrl: "",
      rescanUrl: "",
      changeBirthdateUrl: "",
      lineHomeUrl: "",
    },
    wording: {
      ...wording,
      objectLabel: "วัตถุจากการสแกน",
      heroNaming: String(flexSurface.heroNamingLine || "พระเครื่อง").trim(),
      mainEnergy: String(flexSurface.mainEnergyWordingLine || "").trim(),
      htmlOpeningLine: String(flexSurface.htmlOpeningLine || "").trim(),
    },
    compatibility: {
      score: compatPayload.score,
      band: compatPayload.band,
      formulaVersion: compatPayload.formulaVersion,
      factors: compatPayload.factors,
      inputs: compatPayload.inputs,
      explain: compatPayload.explain,
    },
    objectEnergy: objectEnergyPayload
      ? {
          formulaVersion: objectEnergyPayload.formulaVersion,
          profile: objectEnergyPayload.profile,
          stars: objectEnergyPayload.stars,
          mainEnergyResolved: objectEnergyPayload.mainEnergyResolved,
          confidence: objectEnergyPayload.confidence,
          inputs: objectEnergyPayload.inputs,
          explain: objectEnergyPayload.explain,
        }
      : undefined,
    parsed: {
      crystal_mode: crystalMode,
    },
    diagnostics: {
      objectFamily: "sacred_amulet",
      resolvedCategoryCode: energyCategoryCode,
      crossAccountBaselineReuse: true,
      baselineIdPrefix: String(baselineRow.id).slice(0, 8),
      baselineReuseCount: baselineRow.reuseCount,
    },
    amuletV1,
    ...(timingV1 ? { timingV1 } : {}),
  };
}
