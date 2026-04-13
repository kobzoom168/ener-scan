import { env } from "../../config/env.js";
import { parseScanText } from "../flex/flex.parser.js";
import { normalizeScore, stripBullet } from "../flex/flex.utils.js";
import { REPORT_PAYLOAD_VERSION } from "./reportPayload.types.js";
import { sanitizeHttpsPublicImageUrl } from "../../utils/reports/reportImageUrl.util.js";
import { resolveConfidenceDampMultiplier } from "../../utils/reports/confidenceDamp.util.js";
import { formatScanBirthdayLabelThai } from "../../utils/scanBirthdayLabel.util.js";
import { deriveReportWordingFromParsed } from "./reportWording.derive.js";
import { buildCompatibilityPayload } from "../reportPayload/buildCompatibilityPayload.js";
import { buildObjectEnergyPayload } from "../reportPayload/buildObjectEnergyPayload.js";
import { scanDimensionsFromObjectEnergyStars } from "../../utils/objectEnergyFormula.util.js";
import { countThreadedReportSignalFields } from "../../utils/reports/scanPipelineReportSignals.util.js";
import {
  resolveConditionClassPipelineSource,
  resolveDominantColorPipelineSource,
} from "../../utils/reports/reportPipelineVisualSignals.util.js";
import { buildFlexSummarySurfaceFields } from "../../utils/reports/flexSummarySurface.util.js";
import { getFallbackFlexSurfaceLines } from "../../utils/reports/flexSummaryShortCopy.js";
import {
  extractCrystalSpiritualSignalTags,
  inferEnergyCategoryCodeFromMainEnergy,
  inferEnergyCategoryInferenceTrace,
  normalizeObjectFamilyForEnergyCopy,
  resolveCrystalMode,
} from "../../utils/energyCategoryResolve.util.js";
import {
  resolveVisibleWordingBundleFromDb,
  logFieldsFromDbBundle,
} from "../dbWordingBundle.service.js";
import { isUsableVisibleSurface } from "../../utils/visibleWordingSelect.util.js";
import { clampFlexDbSurfaceLines } from "../energyCopyFlex.service.js";
import { resolveCrystalVisibleWordingPriority } from "../../utils/crystalVisibleWordingPriority.util.js";
import {
  buildVisibleWordingTelemetryCorrelation,
  buildVisibleWordingTelemetryFields,
} from "../../utils/visibleWordingTelemetry.util.js";
import { buildCrystalRoutingWordingMetrics } from "../../utils/crystalRoutingWordingMetrics.util.js";
import { deriveVisiblePresentationAngleForDbHydrate } from "../../utils/reports/deriveVisiblePresentationAngle.util.js";
import {
  buildGptCrystalSubtypeInferenceText,
  detectMoldaviteV1,
} from "../../moldavite/moldaviteDetect.util.js";
import { resolveMoldaviteDetectionWithGeminiCrystalSubtype } from "../../moldavite/geminiCrystalSubtypeBranch.util.js";
import {
  buildMoldaviteV1Slice,
  MOLDAVITE_DEFAULT_TRUST_NOTE,
} from "../../moldavite/moldavitePayload.build.js";
import { resolveMoldaviteDisplayNaming } from "../../moldavite/moldaviteDisplayNaming.util.js";
import { buildAmuletV1Slice } from "../../amulet/amuletPayload.build.js";
import { buildCrystalBraceletV1Slice } from "../../crystalBracelet/crystalBraceletPayload.build.js";
import { crystalBraceletCompatibilityBandFromPercent } from "../../crystalBracelet/crystalBraceletScores.util.js";
import { deriveSacredAmuletEnergyScore10FromPowerCategories } from "../../amulet/amuletScores.util.js";
import { score10ToEnergyGrade } from "../../utils/reports/energyLevelGrade.util.js";
import { computeTimingV1 } from "../timing/timingEngine.service.js";
import {
  normalizeBirthdateIso,
  parseIsoYmd,
} from "../../utils/compatibilityFormula.util.js";

/**
 * Compatibility line may be "78%", "78 %", "7.8" (0–10 scale), or Thai prose with a number.
 * Picks the first plausible percentage: 0–100, or 0–10 scaled to percent.
 * @param {string} raw
 * @returns {number|null}
 */
export function parseCompatibilityPercent(raw) {
  const s = String(raw || "").trim();
  if (!s || s === "-") return null;

  const matches = s.match(/(\d+(?:\.\d+)?)/g);
  if (!matches || !matches.length) return null;

  for (const m of matches) {
    const n = Number(m);
    if (!Number.isFinite(n)) continue;
    if (n >= 0 && n <= 10) return Math.round(n * 10);
    if (n > 10 && n <= 100) return Math.round(n);
  }

  const n = Number(matches[0]);
  if (!Number.isFinite(n)) return null;
  if (n >= 0 && n <= 10) return Math.round(n * 10);
  if (n <= 100) return Math.round(n);
  return null;
}

/**
 * @param {string} text
 * @param {number} max
 * @returns {string[]}
 */
function linesFromText(text, max = 6) {
  if (text == null) return [];
  if (String(text).trim() === "-") return [];
  return String(text)
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l && l !== "-")
    .slice(0, max);
}

/**
 * Crystal reports: never ship empty support / suitable sections when we can compose from category sync.
 *
 * @param {object} p
 * @param {string[]} p.whatItGives
 * @param {string[]} p.bestUseCases
 * @param {string} p.energyCategoryCode
 * @param {"general"|"spiritual_growth"|null} p.crystalMode
 * @param {string} p.objectFamilyRaw
 * @returns {{ whatItGives: string[], bestUseCases: string[], applied: boolean }}
 */
function applyCrystalMinimumSections({
  whatItGives,
  bestUseCases,
  energyCategoryCode,
  crystalMode,
  objectFamilyRaw,
}) {
  const fam = normalizeObjectFamilyForEnergyCopy(objectFamilyRaw || "");
  if (fam !== "crystal") {
    return { whatItGives, bestUseCases, applied: false };
  }
  const codeForFill =
    crystalMode === "spiritual_growth" ? "spiritual_growth" : energyCategoryCode;
  const fb = getFallbackFlexSurfaceLines(codeForFill, "crystal");
  let w = [...whatItGives];
  let b = [...bestUseCases];
  let applied = false;
  if (w.length === 0) {
    const first =
      (fb.bullets?.length && String(fb.bullets[0]).trim()) ||
      String(fb.headline || "").trim();
    if (first) {
      w.push(first);
      applied = true;
    } else if (fb.fitLine) {
      w.push(String(fb.fitLine).trim());
      applied = true;
    }
  }
  if (b.length === 0) {
    const second =
      (fb.bullets?.length > 1 && String(fb.bullets[1]).trim()) ||
      String(fb.fitLine || "").trim() ||
      "เหมาะใช้เมื่ออยากให้โทนพลังชัดขึ้นและใช้งานได้จริงในชีวิตประจำวัน";
    b.push(second);
    applied = true;
  }
  return { whatItGives: w, bestUseCases: b, applied };
}

/**
 * @param {unknown} bulletLines
 * @returns {string[]}
 */
function mapStripBullets(bulletLines) {
  if (!Array.isArray(bulletLines)) return [];
  return bulletLines
    .map((line) => stripBullet(String(line || "").replace(/^•\s*/, "")))
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Same shape as parseScanText output when everything is missing. */
/**
 * Prefer vision-stable hash seed for deterministic scores; fallback to scan result id.
 * @param {string|null|undefined} stableFeatureSeed
 * @param {string} scanResultId
 * @returns {string}
 */
function resolveScoreSeedKey(stableFeatureSeed, scanResultId) {
  const s = String(stableFeatureSeed ?? "").trim();
  if (s) return s;
  return String(scanResultId || "").trim();
}

function emptyParsedShape() {
  return {
    energyScore: "-",
    mainEnergy: "-",
    mainEnergyResolution: { source: "missing", raw: "" },
    compatibility: "-",
    personality: "-",
    tone: "-",
    hidden: "-",
    overview: "-",
    fitReason: "-",
    supportTopics: [],
    suitable: [],
    notStrong: "-",
    usageGuide: "-",
    closing: "-",
    crystal_mode: null,
  };
}

/**
 * Strict `crystal_bracelet` lane: build only {@link buildCrystalBraceletV1Slice} — no generic crystal
 * energy-copy inference, DB wording hydrate, or `applyCrystalMinimumSections`.
 *
 * @param {object} opts — same options object as {@link buildReportPayloadFromScan}
 * @param {number} confidenceDamp — from {@link resolveConfidenceDampMultiplier}
 * @returns {Promise<import("./reportPayload.types.js").ReportPayload>}
 */
async function buildCrystalBraceletStrictLaneReportPayload(opts, confidenceDamp) {
  const {
    resultText,
    scanResultId,
    scanRequestId,
    lineUserId,
    birthdateUsed = null,
    publicToken,
    modelLabel = "",
    objectImageUrl: objectImageUrlRaw = "",
    scannedAt: scannedAtOpt = "",
    objectFamily: objectFamilyOpt = "",
    materialFamily: materialFamilyOpt = "",
    shapeFamily: shapeFamilyOpt = "",
    dominantColor: dominantColorOpt = "",
    conditionClass: conditionClassOpt = "",
    objectCheckResult: objectCheckResultOpt = "",
    objectCheckConfidence: objectCheckConfidenceOpt,
    pipelineObjectCategory: pipelineObjectCategoryOpt = null,
    pipelineObjectCategorySource: pipelineObjectCategorySourceOpt = "unspecified",
    pipelineDominantColorSource: pipelineDominantColorSourceOpt,
    stableFeatureSeed: stableFeatureSeedOpt,
  } = opts;

  const objectImageUrl = sanitizeHttpsPublicImageUrl(objectImageUrlRaw);
  const rid = String(scanResultId || "").trim();
  const scoreSeedKey = resolveScoreSeedKey(stableFeatureSeedOpt, rid);
  const tok = String(publicToken || "").trim();

  let parsed;
  let parseException = false;
  try {
    parsed = parseScanText(String(resultText || ""));
  } catch (err) {
    parseException = true;
    console.warn(
      JSON.stringify({
        event: "REPORT_PAYLOAD_PARSE_EXCEPTION",
        scanResultId: String(scanResultId || "").slice(0, 8),
        message: err?.message,
      }),
    );
    parsed = null;
  }
  if (!parsed) {
    parsed = emptyParsedShape();
  }

  const scoreInfo = normalizeScore(parsed.energyScore);
  const energyScore =
    scoreInfo.numeric != null && Number.isFinite(scoreInfo.numeric)
      ? scoreInfo.numeric
      : null;

  const scannedAtEffective =
    String(scannedAtOpt || "").trim() || new Date().toISOString();

  const dominantColorResolved = resolveDominantColorPipelineSource(
    dominantColorOpt,
    pipelineDominantColorSourceOpt === "vision_v1"
      ? "vision_v1"
      : pipelineDominantColorSourceOpt === "cache_persisted"
        ? "cache_persisted"
        : undefined,
  );
  const conditionClassResolved = resolveConditionClassPipelineSource(
    conditionClassOpt,
  );

  /** @type {ReturnType<typeof buildCompatibilityPayload> | null} */
  let compatibilityPayload = null;
  if (birthdateUsed) {
    try {
      compatibilityPayload = buildCompatibilityPayload({
        birthdate: String(birthdateUsed),
        scannedAt: scannedAtEffective,
        objectFamily: String(objectFamilyOpt || "generic").trim() || "generic",
        materialFamily: String(materialFamilyOpt || "").trim() || undefined,
        shapeFamily: String(shapeFamilyOpt || "unknown").trim() || "unknown",
        mainEnergy:
          (parsed.mainEnergy && parsed.mainEnergy !== "-"
            ? String(parsed.mainEnergy)
            : "") || "",
        energyScore: energyScore ?? 0,
        dominantColor: dominantColorResolved.normalized || undefined,
        objectCategory:
          pipelineObjectCategoryOpt &&
          String(pipelineObjectCategoryOpt).trim()
            ? String(pipelineObjectCategoryOpt).trim()
            : undefined,
        conditionClass: conditionClassResolved.normalized || undefined,
      });
    } catch (err) {
      console.warn(
        JSON.stringify({
          event: "COMPATIBILITY_V1_BUILD_FAILED",
          message: err?.message,
        }),
      );
    }
  }

  let compatPct = parseCompatibilityPercent(parsed.compatibility);
  if (compatibilityPayload != null) {
    compatPct = compatibilityPayload.score;
  }

  const mainEnergyLabel =
    parsed.mainEnergy && parsed.mainEnergy !== "-"
      ? String(parsed.mainEnergy).trim()
      : "";

  /* `compatPct` is the display SSOT for “เข้ากับคุณ”; slice.ownerFit.score stays internal-only (blended rhythm weight). */
  const crystalBraceletV1 = buildCrystalBraceletV1Slice({
    scanResultId: rid,
    seedKey: scoreSeedKey || rid || String(scanResultId || ""),
    detection: {
      reason: "crystal_bracelet_strict_lane_v1",
      matchedSignals: [],
    },
    energyScore,
    mainEnergyLabel,
    ownerFitScore:
      compatPct != null && Number.isFinite(Number(compatPct))
        ? Math.round(Number(compatPct))
        : null,
    birthdateUsed: birthdateUsed ? String(birthdateUsed) : null,
    confidenceDamp,
  });

  const fs = crystalBraceletV1.flexSurface;
  const hr = crystalBraceletV1.htmlReport;

  console.log(
    JSON.stringify({
      event: "REPORT_PAYLOAD_CRYSTAL_BRACELET_EARLY_EXIT",
      scanResultIdPrefix: String(scanResultId || "").slice(0, 8),
      lane: "crystal_bracelet",
      reportLane: "crystal_bracelet_v1",
      parseException,
    }),
  );

  const overview =
    parsed.overview && parsed.overview !== "-"
      ? String(parsed.overview)
      : "";
  const fitReason =
    parsed.fitReason && parsed.fitReason !== "-"
      ? String(parsed.fitReason)
      : "";

  let summaryLine = "";
  if (overview) {
    const firstLine = overview.split(/\n/)[0]?.trim() || overview;
    summaryLine =
      firstLine.length > 220 ? `${firstLine.slice(0, 217)}…` : firstLine;
  } else if (fitReason) {
    const fl = fitReason.split(/\n/)[0]?.trim() || fitReason;
    summaryLine = fl.length > 220 ? `${fl.slice(0, 217)}…` : fl;
  } else {
    const mp0 = hr?.meaningParagraphs?.[0];
    summaryLine = mp0
      ? String(mp0).trim().slice(0, 220)
      : String(fs.tagline || "").trim() || "สรุปผลการสแกนพลังวัตถุ — ดูรายละเอียดด้านล่าง";
  }

  const birthdayLabel = birthdateUsed
    ? formatScanBirthdayLabelThai(birthdateUsed)
    : "";
  const compatibilityReason = fitReason;
  const compatibilityBandFromPayload =
    compatibilityPayload?.band != null
      ? String(compatibilityPayload.band).trim()
      : "";
  const compatibilityBandFromPct =
    compatPct != null && Number.isFinite(Number(compatPct))
      ? crystalBraceletCompatibilityBandFromPercent(
          Math.round(Number(compatPct)),
        )
      : "";
  const compatibilityBand =
    compatibilityBandFromPayload || compatibilityBandFromPct || "";

  const secondaryEnergyLabel =
    parsed.secondaryEnergy && parsed.secondaryEnergy !== "-"
      ? String(parsed.secondaryEnergy).trim()
      : "";

  const messagePoints = Array.isArray(hr?.meaningParagraphs)
    ? hr.meaningParagraphs.map((p) => String(p || "").trim()).filter(Boolean)
    : [];

  const summaryEnergyScore = energyScore;
  const summaryEnergyLevelLabel =
    summaryEnergyScore != null &&
    Number.isFinite(Number(summaryEnergyScore))
      ? score10ToEnergyGrade(Number(summaryEnergyScore))
      : "";

  return {
    reportId: rid,
    publicToken: tok,
    scanId: String(scanRequestId || "").trim(),
    userId: String(lineUserId || "").trim(),
    birthdateUsed: birthdateUsed ? String(birthdateUsed) : null,
    generatedAt: new Date().toISOString(),
    reportVersion: REPORT_PAYLOAD_VERSION,
    object: {
      objectImageUrl,
      objectLabel: "วัตถุจากการสแกน",
      objectType: "",
    },
    summary: {
      energyScore: summaryEnergyScore,
      energyLevelLabel: summaryEnergyLevelLabel,
      mainEnergyLabel: String(fs.mainEnergyShort || "").trim() || mainEnergyLabel,
      compatibilityPercent: compatPct,
      compatibilityBand: compatibilityBand || undefined,
      summaryLine,
      wordingFamily: undefined,
      clarityLevel: undefined,
      birthdayLabel: birthdayLabel || undefined,
      compatibilityReason: compatibilityReason || undefined,
      secondaryEnergyLabel: secondaryEnergyLabel || undefined,
      scanDimensions: undefined,
      scanTips:
        Array.isArray(fs.bullets) && fs.bullets.length > 0
          ? fs.bullets.slice(0, 2)
          : undefined,
      headlineShort: fs.headline,
      fitReasonShort: fs.fitLine,
      bulletsShort: fs.bullets,
      ctaLabel: String(fs.ctaLabel || "").trim() || "เปิดรายงานฉบับเต็ม",
      presentationAngleId: "crystal_bracelet_v1_summary_first",
      wordingVariantId: "crystal_bracelet_v1_summary_first",
      energyCategoryCode: undefined,
      energyCopyObjectFamily: "crystal",
      crystalMode: undefined,
      openingShort: undefined,
      teaserShort: undefined,
      visibleMainLabel: String(fs.headline || "").trim() || undefined,
    },
    sections: {
      whatItGives: [],
      messagePoints,
      ownerMatchReason: [],
      roleDescription: "",
      bestUseCases: [],
      weakMoments: [],
      guidanceTips: [],
      careNotes: [],
      miniRitual: [],
    },
    trust: {
      modelLabel: modelLabel || undefined,
      trustNote:
        "รายงานนี้จัดทำจากข้อความวิเคราะห์ที่สร้างจากภาพและข้อมูลที่คุณให้ ไม่ใช่คำแนะนำทางการแพทย์หรือการเงิน",
      rendererVersion: "html-1.0.0",
    },
    actions: {
      historyUrl: "",
      rescanUrl: "",
      changeBirthdateUrl: "",
      lineHomeUrl: "",
    },
    wording: {
      heroNaming: String(fs.heroNamingLine || "").trim(),
      mainEnergy: String(fs.mainEnergyWordingLine || "").trim(),
      htmlOpeningLine: String(fs.htmlOpeningLine || "").trim(),
      objectLabel: "วัตถุจากการสแกน",
    },
    compatibility: compatibilityPayload
      ? {
          score: compatibilityPayload.score,
          band: compatibilityPayload.band,
          formulaVersion: compatibilityPayload.formulaVersion,
          factors: compatibilityPayload.factors,
          inputs: compatibilityPayload.inputs,
          explain: compatibilityPayload.explain,
        }
      : undefined,
    objectEnergy: undefined,
    parsed: {
      crystal_mode: null,
    },
    diagnostics: {
      objectFamily: String(objectFamilyOpt || "").trim() || undefined,
      crystalBraceletStrictLaneEarlyExit: true,
      reportLane: "crystal_bracelet_v1",
      wordingPrimarySource: "crystal_bracelet_lane",
      dbWordingSelected: false,
      resolvedCategoryCode: undefined,
      diversificationApplied: false,
      wordingBankUsed: undefined,
      wordingVariantId: undefined,
      flexPresentationAngleId: undefined,
      crystalMode: undefined,
      matchedSignalsCount: 0,
      parsedMainEnergyRaw: mainEnergyLabel.slice(0, 240),
      mainEnergySource: parsed.mainEnergyResolution?.source ?? "missing",
      crystalGenericSafeActive: false,
      pipelineObjectCategorySource: pipelineObjectCategorySourceOpt,
      enrichmentEligible: undefined,
      enrichmentUsed: undefined,
      enrichmentProvider: undefined,
      deliveryStrategy: undefined,
      lineSummaryPresent: undefined,
    },
    crystalBraceletV1,
  };
}

/**
 * Build canonical ReportPayload from scan output + context.
 * Uses {@link parseScanText} (same source as Flex) for section mapping.
 *
 * Fragile assumptions (parseScanText / prompts):
 * - Section headings must match model output; renamed headings => empty sections.
 * - supportTopics / suitable are limited by extractBulletSection (max 2 lines in parser).
 * - notStrong is a single merged line, not a bullet list.
 *
 * @param {object} opts
 * @param {string} opts.resultText
 * @param {string} opts.scanResultId — scan_results.id (UUID)
 * @param {string} opts.scanRequestId — scan_requests.id
 * @param {string} opts.lineUserId — LINE user id
 * @param {string|null} [opts.birthdateUsed]
 * @param {string} opts.publicToken — pre-generated token to embed in payload
 * @param {string} [opts.modelLabel] — e.g. gpt-4.1-mini
 * @param {string} [opts.objectImageUrl] — optional HTTPS URL for public hero image (from storage)
 * @param {string} [opts.scannedAt] — ISO time for compatibility v1 (defaults to build time)
 * @param {string} [opts.objectFamily] — e.g. somdej (default generic)
 * @param {string} [opts.materialFamily] — e.g. powder
 * @param {string} [opts.shapeFamily] — e.g. rectangular (default unknown)
 * @param {string} [opts.dominantColor] — slug for formula when supplied by non-LLM upstream (never from parsed `tone`)
 * @param {string} [opts.conditionClass] — slug when supplied by non-LLM upstream (not from object-gate enum alone)
 * @param {string} [opts.objectCheckResult] — short note from object check pipeline
 * @param {number} [opts.objectCheckConfidence] — 0–1
 * @param {string|null} [opts.pipelineObjectCategory] — Thai classifier label when known (telemetry only)
 * @param {"deep_scan"|"cache_classify"|"cache_persisted"|"missing"|"unspecified"} [opts.pipelineObjectCategorySource] — how category was obtained
 * @param {"vision_v1"|"cache_persisted"|"pipeline_opts"|"none"|undefined} [opts.pipelineDominantColorSource]
 * @param {object|null} [opts.geminiCrystalSubtypeResult] — optional Gemini crystal subtype pass (crystal scans only)
 * @param {"moldavite"|"sacred_amulet"|"crystal_bracelet"|null} [opts.strictSupportedLane] — when set (Scan V2 worker), only this lane slice may attach (3-lane closed world)
 * @param {string|null|undefined} [opts.stableFeatureSeed] — vision-stable seed for Moldavite/crystal-bracelet deterministic scores (falls back to scanResultId)
 * @returns {Promise<import("./reportPayload.types.js").ReportPayload>}
 */
export async function buildReportPayloadFromScan(opts) {
  const {
    resultText,
    scanResultId,
    scanRequestId,
    lineUserId,
    birthdateUsed = null,
    publicToken,
    modelLabel = "",
    objectImageUrl: objectImageUrlRaw = "",
    scannedAt: scannedAtOpt = "",
    objectFamily: objectFamilyOpt = "",
    materialFamily: materialFamilyOpt = "",
    shapeFamily: shapeFamilyOpt = "",
    dominantColor: dominantColorOpt = "",
    conditionClass: conditionClassOpt = "",
    objectCheckResult: objectCheckResultOpt = "",
    objectCheckConfidence: objectCheckConfidenceOpt,
    pipelineObjectCategory: pipelineObjectCategoryOpt = null,
    pipelineObjectCategorySource: pipelineObjectCategorySourceOpt = "unspecified",
    pipelineDominantColorSource: pipelineDominantColorSourceOpt,
    geminiCrystalSubtypeResult: geminiCrystalSubtypeResultOpt = null,
    strictSupportedLane: strictSupportedLaneOpt = null,
    stableFeatureSeed: stableFeatureSeedOpt,
  } = opts;

  const confidenceDamp = resolveConfidenceDampMultiplier(
    objectCheckConfidenceOpt != null &&
      Number.isFinite(Number(objectCheckConfidenceOpt))
      ? Number(objectCheckConfidenceOpt)
      : undefined,
  );

  if (strictSupportedLaneOpt === "crystal_bracelet") {
    return buildCrystalBraceletStrictLaneReportPayload(opts, confidenceDamp);
  }

  const objectImageUrl = sanitizeHttpsPublicImageUrl(objectImageUrlRaw);

  let parsed;
  let parseException = false;
  try {
    parsed = parseScanText(String(resultText || ""));
  } catch (err) {
    parseException = true;
    console.warn(
      JSON.stringify({
        event: "REPORT_PAYLOAD_PARSE_EXCEPTION",
        scanResultId: String(scanResultId || "").slice(0, 8),
        message: err?.message,
      }),
    );
    parsed = null;
  }

  if (!parsed) {
    parsed = emptyParsedShape();
  }

  const scoreInfo = normalizeScore(parsed.energyScore);
  const energyScore =
    scoreInfo.numeric != null && Number.isFinite(scoreInfo.numeric)
      ? scoreInfo.numeric
      : null;

  const scannedAtEffective =
    String(scannedAtOpt || "").trim() || new Date().toISOString();

  const dominantColorResolved = resolveDominantColorPipelineSource(
    dominantColorOpt,
    pipelineDominantColorSourceOpt === "vision_v1"
      ? "vision_v1"
      : pipelineDominantColorSourceOpt === "cache_persisted"
        ? "cache_persisted"
        : undefined,
  );
  const conditionClassResolved = resolveConditionClassPipelineSource(
    conditionClassOpt,
  );

  /** @type {ReturnType<typeof buildCompatibilityPayload> | null} */
  let compatibilityPayload = null;
  if (birthdateUsed) {
    try {
      compatibilityPayload = buildCompatibilityPayload({
        birthdate: String(birthdateUsed),
        scannedAt: scannedAtEffective,
        objectFamily: String(objectFamilyOpt || "generic").trim() || "generic",
        materialFamily: String(materialFamilyOpt || "").trim() || undefined,
        shapeFamily: String(shapeFamilyOpt || "unknown").trim() || "unknown",
        mainEnergy:
          (parsed.mainEnergy && parsed.mainEnergy !== "-"
            ? String(parsed.mainEnergy)
            : "") || "",
        energyScore: energyScore ?? 0,
        dominantColor: dominantColorResolved.normalized || undefined,
        objectCategory:
          pipelineObjectCategoryOpt &&
          String(pipelineObjectCategoryOpt).trim()
            ? String(pipelineObjectCategoryOpt).trim()
            : undefined,
        conditionClass: conditionClassResolved.normalized || undefined,
      });
    } catch (err) {
      console.warn(
        JSON.stringify({
          event: "COMPATIBILITY_V1_BUILD_FAILED",
          message: err?.message,
        }),
      );
    }
  }

  let compatPct = parseCompatibilityPercent(parsed.compatibility);
  if (compatibilityPayload != null) {
    compatPct = compatibilityPayload.score;
  }

  /** @type {ReturnType<typeof buildObjectEnergyPayload> | null} */
  let objectEnergyPayload = null;
  try {
    objectEnergyPayload = buildObjectEnergyPayload({
      objectFamily: String(objectFamilyOpt || "generic").trim() || "generic",
      materialFamily: String(materialFamilyOpt || "").trim() || undefined,
      shapeFamily: String(shapeFamilyOpt || "unknown").trim() || "unknown",
      dominantColor: dominantColorResolved.normalized,
      conditionClass: conditionClassResolved.normalized,
      energyScore: energyScore ?? 5,
      mainEnergy:
        parsed.mainEnergy && parsed.mainEnergy !== "-"
          ? String(parsed.mainEnergy)
          : "",
      objectCheckResult: String(objectCheckResultOpt || "").trim() || undefined,
      objectCheckConfidence:
        objectCheckConfidenceOpt != null &&
        Number.isFinite(Number(objectCheckConfidenceOpt))
          ? Number(objectCheckConfidenceOpt)
          : undefined,
    });
  } catch (err) {
    console.warn(
      JSON.stringify({
        event: "OBJECT_ENERGY_V1_BUILD_FAILED",
        message: err?.message,
      }),
    );
  }

  const overview =
    parsed.overview && parsed.overview !== "-" ? String(parsed.overview) : "";
  const fitReason =
    parsed.fitReason && parsed.fitReason !== "-" ? String(parsed.fitReason) : "";

  const birthdayLabel = birthdateUsed
    ? formatScanBirthdayLabelThai(birthdateUsed)
    : "";
  const compatibilityReason = fitReason;
  const secondaryEnergyLabel =
    parsed.secondaryEnergy && parsed.secondaryEnergy !== "-"
      ? String(parsed.secondaryEnergy).trim()
      : "";
  const scanDimensionsParsed =
    parsed.dimensions && typeof parsed.dimensions === "object"
      ? parsed.dimensions
      : {};

  let summaryLine = "";
  if (overview) {
    const firstLine = overview.split(/\n/)[0]?.trim() || overview;
    summaryLine =
      firstLine.length > 220 ? `${firstLine.slice(0, 217)}…` : firstLine;
  } else if (fitReason) {
    const fl = fitReason.split(/\n/)[0]?.trim() || fitReason;
    summaryLine = fl.length > 220 ? `${fl.slice(0, 217)}…` : fl;
  } else {
    summaryLine = "สรุปผลการสแกนพลังวัตถุ — ดูรายละเอียดด้านล่าง";
  }

  let whatItGives = mapStripBullets(parsed.supportTopics);
  const messagePoints = linesFromText(overview, 5);
  const ownerMatchReason = linesFromText(fitReason, 6);

  let roleDescription = "";
  const pers =
    parsed.personality && parsed.personality !== "-"
      ? String(parsed.personality)
      : "";
  const tone = parsed.tone && parsed.tone !== "-" ? String(parsed.tone) : "";
  if (pers && tone) roleDescription = `${pers} · ${tone}`;
  else roleDescription = pers || tone || "";

  let bestUseCases = mapStripBullets(parsed.suitable);

  const weakMoments = [];
  const ns =
    parsed.notStrong && parsed.notStrong !== "-"
      ? String(parsed.notStrong).trim()
      : "";
  if (ns) weakMoments.push(ns);

  const guidanceTips = [];
  const ug =
    parsed.usageGuide && parsed.usageGuide !== "-"
      ? String(parsed.usageGuide).trim()
      : "";
  if (ug) guidanceTips.push(ug);
  const cl =
    parsed.closing && parsed.closing !== "-"
      ? String(parsed.closing).trim()
      : "";
  if (cl) guidanceTips.push(cl);

  const rid = String(scanResultId || "").trim();
  const tok = String(publicToken || "").trim();
  const scoreSeedKey = resolveScoreSeedKey(stableFeatureSeedOpt, rid);

  let wording = deriveReportWordingFromParsed(parsed, {
    seed: rid || scanResultId,
    energyScore,
    compatibilityPercent: compatPct,
    objectFamily: objectFamilyOpt,
  });

  const compatibilityBand =
    compatibilityPayload?.band != null
      ? String(compatibilityPayload.band)
      : "";

  const mainEnergyLabelForCategory =
    wording.mainEnergy
      ? String(wording.mainEnergy)
      : parsed.mainEnergy && parsed.mainEnergy !== "-"
        ? String(parsed.mainEnergy)
        : "";

  const mainEnergyRawForCrystalMode =
    parsed.mainEnergy && parsed.mainEnergy !== "-"
      ? String(parsed.mainEnergy).replace(/\s+/g, " ").trim()
      : mainEnergyLabelForCategory;

  const famNorm = normalizeObjectFamilyForEnergyCopy(
    String(objectFamilyOpt || ""),
  );
  console.log(
    JSON.stringify({
      event: "OBJECT_FAMILY_NORMALIZED",
      scanResultIdPrefix: String(scanResultId || "").slice(0, 8),
      objectFamilyRaw: String(objectFamilyOpt || "").slice(0, 96),
      objectFamilyNormalized: famNorm,
    }),
  );
  const mainEnergyForCategoryInference =
    famNorm === "crystal" && mainEnergyRawForCrystalMode
      ? mainEnergyRawForCrystalMode
      : mainEnergyLabelForCategory;

  const energyCategoryCode = inferEnergyCategoryCodeFromMainEnergy(
    mainEnergyForCategoryInference,
    String(objectFamilyOpt || ""),
  );

  const energyCategoryInferenceTrace = inferEnergyCategoryInferenceTrace(
    mainEnergyForCategoryInference,
    String(objectFamilyOpt || ""),
  );

  console.log(
    JSON.stringify({
      event: "REPORT_PAYLOAD_MAIN_ENERGY_INFERENCE",
      scanResultIdPrefix: String(scanResultId || "").slice(0, 8),
      objectFamily: String(objectFamilyOpt || "").slice(0, 48),
      parsedMainEnergyRaw: String(mainEnergyForCategoryInference || "").slice(
        0,
        160,
      ),
      mainEnergySource:
        parsed.mainEnergyResolution?.source ?? "missing",
      resolveEnergyTypeResult:
        energyCategoryInferenceTrace.resolveEnergyTypeResult,
      protectKeywordMatched:
        energyCategoryInferenceTrace.protectKeywordMatched,
      protectWeakKeywordMatched:
        energyCategoryInferenceTrace.protectWeakKeywordMatched,
      protectSignalStrength:
        energyCategoryInferenceTrace.protectSignalStrength,
      energyTypeResolverMode:
        energyCategoryInferenceTrace.energyTypeResolverMode,
      energyTypeResolverFamily:
        energyCategoryInferenceTrace.energyTypeResolverFamily,
      resolvedEnergyTypeBeforeCategoryMap:
        energyCategoryInferenceTrace.resolvedEnergyTypeBeforeCategoryMap,
      crystalWeakProtectOutcome:
        energyCategoryInferenceTrace.crystalWeakProtectOutcome,
      crystalNonProtectRoutingReason:
        energyCategoryInferenceTrace.crystalNonProtectRoutingReason,
      crystalPostResolverCategoryDecision:
        energyCategoryInferenceTrace.crystalPostResolverCategoryDecision,
      crystalRoutingRuleId:
        energyCategoryInferenceTrace.crystalRoutingRuleId,
      crystalRoutingReason:
        energyCategoryInferenceTrace.crystalRoutingReason,
      crystalRoutingStrategy:
        energyCategoryInferenceTrace.crystalRoutingStrategy,
      energyCategoryInferenceBranch:
        energyCategoryInferenceTrace.inferenceBranch,
      energyCategoryCode,
    }),
  );

  const crystalMode = resolveCrystalMode(
    String(objectFamilyOpt || ""),
    mainEnergyRawForCrystalMode,
  );
  parsed.crystal_mode = crystalMode;

  const crystalSignalTags =
    extractCrystalSpiritualSignalTags(mainEnergyRawForCrystalMode);

  const minSectionResult = applyCrystalMinimumSections({
    whatItGives,
    bestUseCases,
    energyCategoryCode,
    crystalMode,
    objectFamilyRaw: objectFamilyOpt,
  });
  whatItGives = minSectionResult.whatItGives;
  bestUseCases = minSectionResult.bestUseCases;

  if (famNorm === "crystal") {
    console.log(
      JSON.stringify({
        event: "CRYSTAL_MODE_RESOLVED",
        scanResultIdPrefix: String(scanResultId || "").slice(0, 8),
        objectFamily: String(objectFamilyOpt || ""),
        crystalMode,
        energyCategoryCode,
        matchedSignals: crystalSignalTags,
      }),
    );
    if (crystalMode === "spiritual_growth") {
      console.log(
        JSON.stringify({
          event: "CRYSTAL_SPIRITUAL_GROWTH_MATCHED",
          scanResultIdPrefix: String(scanResultId || "").slice(0, 8),
          matchedSignals: crystalSignalTags,
        }),
      );
    }
    if (minSectionResult.applied) {
      console.log(
        JSON.stringify({
          event: "CRYSTAL_MIN_SECTION_FILL_APPLIED",
          scanResultIdPrefix: String(scanResultId || "").slice(0, 8),
          energyCategoryCode,
          crystalMode,
        }),
      );
    }
  }

  const energyCopyObjectFamily = normalizeObjectFamilyForEnergyCopy(
    String(objectFamilyOpt || ""),
  );

  /**
   * Stored summary.headlineShort / fitReasonShort / bulletsShort: DB-first via
   * {@link resolveVisibleWordingBundleFromDb}; composed pools only when DB surface incomplete.
   */
  const dbPresentationAngleForHydrate = deriveVisiblePresentationAngleForDbHydrate({
    categoryCode: energyCategoryCode,
    objectFamilyRaw: objectFamilyOpt || "",
    seed: rid || String(scanResultId || ""),
  });

  const flexSurfaceFallback = buildFlexSummarySurfaceFields({
    wording,
    compatibilityReason,
    summaryLine,
    scanTips: whatItGives.length > 0 ? whatItGives.slice(0, 2) : undefined,
    mainEnergyLabel: wording.mainEnergy
      ? String(wording.mainEnergy)
      : parsed.mainEnergy && parsed.mainEnergy !== "-"
        ? String(parsed.mainEnergy)
        : "",
    wordingFamily: wording.wordingFamily,
    seed: rid || String(scanResultId || ""),
    objectFamily: objectFamilyOpt || "",
    energyCategoryCode,
    crystalMode: crystalMode ?? "",
    lineUserId: String(lineUserId || "").trim(),
  });

  let flexSurface = flexSurfaceFallback;
  /** @type {Awaited<ReturnType<typeof resolveVisibleWordingBundleFromDb>> | null} */
  let dbBundleResolved = null;
  try {
    dbBundleResolved = await resolveVisibleWordingBundleFromDb({
      categoryCode: energyCategoryCode,
      objectFamilyRaw: objectFamilyOpt || "",
      presentationAngleId: dbPresentationAngleForHydrate,
      crystalMode: crystalMode ?? "",
    });
    if (dbBundleResolved && isUsableVisibleSurface(dbBundleResolved.bundle)) {
      const b = dbBundleResolved.bundle;
      const clamped = clampFlexDbSurfaceLines(b.headline, b.fitLine, b.bullets);
      const headlineSlot = b.diagnostics?.dbWordingSlots?.find(
        (s) => s.slot === "headline",
      );
      const angleFromDb = headlineSlot?.presentationAngle ?? null;
      const presentationAngleResolved =
        angleFromDb != null && String(angleFromDb).trim()
          ? String(angleFromDb).trim()
          : dbPresentationAngleForHydrate || null;
      flexSurface = {
        headlineShort: String(clamped.headline || "").trim(),
        fitReasonShort: String(clamped.fitLine || "").trim(),
        bulletsShort: clamped.bullets,
        ctaLabel: "เปิดรายงานฉบับเต็ม",
        wordingMeta: {
          wordingVariantId: `db:${dbBundleResolved.categoryUsed}`,
          wordingBankUsed: "db:energy_copy_templates",
          presentationAngleId: presentationAngleResolved,
          diversificationApplied: Boolean(
            b.diagnostics?.usedClusterTags?.size &&
              b.diagnostics.usedClusterTags.size > 1,
          ),
          avoidedRepeat: Boolean(b.diagnostics?.usedClusterTags?.size),
        },
      };
      if (String(b.opening || "").trim()) {
        wording = {
          ...wording,
          htmlOpeningLine: String(b.opening).trim(),
        };
      }
      console.log(
        JSON.stringify({
          event: "REPORT_PAYLOAD_DB_WORDING_HYDRATE",
          scanResultIdPrefix: String(scanResultId || "").slice(0, 8),
          categoryUsed: dbBundleResolved.categoryUsed,
          rowSource: dbBundleResolved.rowSource,
          ...logFieldsFromDbBundle(dbBundleResolved),
          visibleMainLabelSource: String(b.mainLabel || "").trim()
            ? "db"
            : "truth_or_absent",
          visibleCopyUsedCodeFallback: false,
        }),
      );
    }
  } catch (e) {
    console.warn(
      JSON.stringify({
        event: "REPORT_PAYLOAD_DB_WORDING_HYDRATE_FAIL",
        scanResultIdPrefix: String(scanResultId || "").slice(0, 8),
        message: String(e?.message || e),
      }),
    );
  }

  const dbSurfaceOk =
    Boolean(
      dbBundleResolved &&
        isUsableVisibleSurface(dbBundleResolved.bundle),
    );
  const dbSurfBundle = dbSurfaceOk ? dbBundleResolved.bundle : null;

  const visibleWordingPriorityDiag = resolveCrystalVisibleWordingPriority({
    objectFamilyNormalized: famNorm,
    energyCategoryCode,
    dbSurfaceOk,
    dbRowSource: dbBundleResolved?.rowSource ?? null,
    categoryUsedForSurface:
      dbBundleResolved?.categoryUsed ?? energyCategoryCode,
    presentationAngleId: flexSurface.wordingMeta?.presentationAngleId ?? null,
    dbWordingFallbackLevel: dbSurfBundle?.diagnostics?.dbWordingFallbackLevel ?? null,
  });

  const visibleWordingTelemetryFields =
    buildVisibleWordingTelemetryFields(visibleWordingPriorityDiag);
  const visibleWordingTelemetryCorrelation =
    buildVisibleWordingTelemetryCorrelation({
      energyCategoryCode,
      visibleWordingDiag: visibleWordingPriorityDiag,
      crystalRoutingRuleId: energyCategoryInferenceTrace.crystalRoutingRuleId,
      objectFamilyNormalized: famNorm,
    });

  const routingWordingMetrics = buildCrystalRoutingWordingMetrics({
    objectFamily: famNorm,
    energyCategoryCode,
    crystalRoutingRuleId: energyCategoryInferenceTrace.crystalRoutingRuleId,
    crystalRoutingStrategy: energyCategoryInferenceTrace.crystalRoutingStrategy,
    crystalRoutingReason: energyCategoryInferenceTrace.crystalRoutingReason,
    protectSignalStrength: energyCategoryInferenceTrace.protectSignalStrength,
    visibleWordingDecisionSource: visibleWordingPriorityDiag.visibleWordingDecisionSource,
    visibleWordingObjectFamilyUsed: visibleWordingPriorityDiag.visibleWordingObjectFamilyUsed,
    visibleWordingCrystalSpecific: visibleWordingPriorityDiag.visibleWordingCrystalSpecific,
    visibleWordingCategoryUsed: visibleWordingPriorityDiag.visibleWordingCategoryUsed,
    visibleWordingPresentationAngle: visibleWordingPriorityDiag.visibleWordingPresentationAngle,
    visibleWordingFallbackLevel: visibleWordingPriorityDiag.visibleWordingFallbackLevel,
    visibleWordingReason: visibleWordingPriorityDiag.visibleWordingReason,
  });

  console.log(
    JSON.stringify({
      event: "REPORT_PAYLOAD_VISIBLE_WORDING_TELEMETRY",
      scanResultIdPrefix: String(scanResultId || "").slice(0, 8),
      objectFamily: String(objectFamilyOpt || "").slice(0, 48),
      energyCategoryCode,
      crystalRoutingRuleId:
        energyCategoryInferenceTrace.crystalRoutingRuleId ?? null,
      energyCategoryInferenceBranch: energyCategoryInferenceTrace.inferenceBranch,
      dbSurfaceOk,
      wordingPrimarySource: dbSurfaceOk ? "db" : "code_bank",
      ...visibleWordingTelemetryFields,
      ...visibleWordingTelemetryCorrelation,
      routingWordingMetrics,
    }),
  );

  const threadedSignalCount = countThreadedReportSignalFields({
    dominantColor: dominantColorResolved.normalized,
    conditionClass: conditionClassResolved.normalized,
    materialFamily: materialFamilyOpt,
    objectFamily: objectFamilyOpt,
    shapeFamily: shapeFamilyOpt,
    objectCheckResult: objectCheckResultOpt,
    objectCheckConfidence: objectCheckConfidenceOpt,
    objectCategory: pipelineObjectCategoryOpt,
  });

  const domPresent = Boolean(dominantColorResolved.normalized);
  const condPresent = Boolean(conditionClassResolved.normalized);
  const occPresent =
    objectCheckConfidenceOpt != null &&
    Number.isFinite(Number(objectCheckConfidenceOpt));
  console.log(
    JSON.stringify({
      event: "REPORT_PIPELINE_SIGNALS",
      scanResultIdPrefix: rid ? `${rid.slice(0, 8)}` : "",
      objectCategorySource: pipelineObjectCategorySourceOpt,
      hasPipelineObjectCategory: Boolean(
        pipelineObjectCategoryOpt && String(pipelineObjectCategoryOpt).trim(),
      ),
      hasObjectCheckResult: Boolean(String(objectCheckResultOpt || "").trim()),
      dominantColorPresent: domPresent,
      dominantColorPipelineSource: dominantColorResolved.source,
      conditionClassPresent: condPresent,
      conditionClassPipelineSource: conditionClassResolved.source,
      objectCheckConfidencePresent: occPresent,
    }),
  );

  console.log(
    JSON.stringify({
      event: "REPORT_PAYLOAD_BUILT",
      scanResultIdPrefix: rid ? `${rid.slice(0, 8)}…` : "",
      hasOverview: Boolean(overview),
      hasFitReason: Boolean(fitReason),
      sectionCounts: {
        whatItGives: whatItGives.length,
        messagePoints: messagePoints.length,
        ownerMatch: ownerMatchReason.length,
        bestUse: bestUseCases.length,
      },
      parseException,
      energyScorePresent: energyScore != null,
      compatPresent: compatPct != null,
      hasObjectImage: Boolean(objectImageUrl),
      hasWording: Boolean(wording?.mainEnergy),
      threadedSignalCount,
      hasObjectEnergy: Boolean(objectEnergyPayload),
      pipelineObjectCategorySource: pipelineObjectCategorySourceOpt,
      dbSurfaceOk,
      wordingPrimarySource: dbSurfaceOk ? "db" : "code_bank",
      ...visibleWordingTelemetryFields,
      ...visibleWordingTelemetryCorrelation,
      routingWordingMetrics,
    }),
  );

  if (famNorm === "crystal") {
    console.log(
      JSON.stringify({
        event: "CRYSTAL_PAYLOAD_SECTION_COUNTS",
        scanResultIdPrefix: rid ? `${rid.slice(0, 8)}` : "",
        objectFamily: String(objectFamilyOpt || ""),
        crystalMode,
        energyCategoryCode,
        matchedSignals: crystalSignalTags,
        sectionCounts: {
          whatItGives: whatItGives.length,
          bestUse: bestUseCases.length,
        },
      }),
    );
  }

  const gptSubtypeInferenceText = buildGptCrystalSubtypeInferenceText({
    overview: parsed.overview,
    mainEnergy: parsed.mainEnergy,
    fitReason: parsed.fitReason,
    pipelineObjectCategory: pipelineObjectCategoryOpt,
  });

  const runMoldaviteHeuristic = () =>
    detectMoldaviteV1({
      objectFamily: objectFamilyOpt,
      pipelineObjectCategory: pipelineObjectCategoryOpt,
      resultText: String(resultText || ""),
      dominantColorNormalized: dominantColorResolved.normalized ?? null,
      scanResultIdPrefix: rid ? String(rid).slice(0, 8) : "",
      gptSubtypeInferenceText,
      pipelineObjectCategorySource: pipelineObjectCategorySourceOpt,
    });

  const { detection: moldaviteDetection, moldaviteDecisionSource } =
    resolveMoldaviteDetectionWithGeminiCrystalSubtype({
      famNorm,
      geminiCrystalSubtypeResult: geminiCrystalSubtypeResultOpt,
      minConfidence: env.GEMINI_CRYSTAL_SUBTYPE_MIN_CONFIDENCE,
      runHeuristic: runMoldaviteHeuristic,
    });

  if (famNorm === "crystal" && geminiCrystalSubtypeResultOpt) {
    console.log(
      JSON.stringify({
        event: "REPORT_PAYLOAD_MOLDAVITE_BRANCH",
        scanResultIdPrefix: String(scanResultId || "").slice(0, 8),
        moldaviteDecisionSource,
        geminiMode: geminiCrystalSubtypeResultOpt.mode ?? null,
        moldaviteActive: Boolean(moldaviteDetection.isMoldavite),
      }),
    );
  }

  const moldaviteDisplayNaming = moldaviteDetection.isMoldavite
    ? resolveMoldaviteDisplayNaming({
        geminiSubtypeConfidence:
          geminiCrystalSubtypeResultOpt?.mode === "ok"
            ? geminiCrystalSubtypeResultOpt.subtypeConfidence
            : null,
        moldaviteDecisionSource,
        detectionReason: moldaviteDetection.reason,
      })
    : null;

  let moldaviteV1 = moldaviteDetection.isMoldavite
    ? buildMoldaviteV1Slice({
        scanResultId: rid,
        detection: moldaviteDetection,
        seedKey: scoreSeedKey || rid || String(scanResultId || ""),
        energyScore,
        mainEnergyLabel: wording.mainEnergy
          ? String(wording.mainEnergy)
          : parsed.mainEnergy && parsed.mainEnergy !== "-"
            ? String(parsed.mainEnergy)
            : "",
        displayNaming: moldaviteDisplayNaming,
        confidenceDamp,
      })
    : undefined;

  const baseMainEnergyLabel = wording.mainEnergy
    ? String(wording.mainEnergy)
    : parsed.mainEnergy && parsed.mainEnergy !== "-"
      ? String(parsed.mainEnergy)
      : "";

  let amuletV1 =
    famNorm === "sacred_amulet"
      ? buildAmuletV1Slice({
          scanResultId: rid,
          seedKey: rid || String(scanResultId || ""),
          energyScore,
          mainEnergyLabel: baseMainEnergyLabel,
        })
      : undefined;

  const shapeFamilyNorm = String(shapeFamilyOpt || "")
    .trim()
    .toLowerCase();
  let crystalBraceletV1 =
    famNorm === "crystal" &&
    shapeFamilyNorm === "bracelet" &&
    !moldaviteDetection.isMoldavite
      ? buildCrystalBraceletV1Slice({
          scanResultId: rid,
          seedKey: scoreSeedKey || rid || String(scanResultId || ""),
          detection: {
            reason: "crystal_bracelet_lane_v1",
            matchedSignals: [],
          },
          energyScore,
          mainEnergyLabel: baseMainEnergyLabel,
          ownerFitScore:
            compatPct != null && Number.isFinite(Number(compatPct))
              ? Math.round(Number(compatPct))
              : null,
          birthdateUsed: birthdateUsed ? String(birthdateUsed) : null,
          confidenceDamp,
        })
      : undefined;

  const strictThreeLane =
    strictSupportedLaneOpt === "moldavite" ||
    strictSupportedLaneOpt === "sacred_amulet" ||
    strictSupportedLaneOpt === "crystal_bracelet";

  if (strictThreeLane) {
    if (strictSupportedLaneOpt === "moldavite") {
      amuletV1 = undefined;
      crystalBraceletV1 = undefined;
    } else if (strictSupportedLaneOpt === "sacred_amulet") {
      moldaviteV1 = undefined;
      crystalBraceletV1 = undefined;
    } else if (strictSupportedLaneOpt === "crystal_bracelet") {
      moldaviteV1 = undefined;
      amuletV1 = undefined;
    }
    if (!moldaviteV1 && !amuletV1 && !crystalBraceletV1) {
      console.log(
        JSON.stringify({
          event: "SUPPORTED_LANE_LEGACY_PATH_BLOCKED",
          scanResultIdPrefix: String(scanResultId || "").slice(0, 8),
          reason: "strict_lane_payload_missing",
          strictSupportedLane: strictSupportedLaneOpt,
        }),
      );
    }
  }

  /** @type {"moldavite_v1"|"sacred_amulet_v1"|"crystal_bracelet_v1"|"summary_first_default"} */
  let reportLane = "summary_first_default";
  if (moldaviteV1) reportLane = "moldavite_v1";
  else if (amuletV1) reportLane = "sacred_amulet_v1";
  else if (crystalBraceletV1) reportLane = "crystal_bracelet_v1";
  console.log(
    JSON.stringify({
      event: "REPORT_LANE_SELECTED",
      scanResultIdPrefix: String(scanResultId || "").slice(0, 8),
      objectFamilyRaw: String(objectFamilyOpt || "").slice(0, 96),
      objectFamilyNormalized: famNorm,
      reportLane,
      strictSupportedLane: strictSupportedLaneOpt,
      energyCopyObjectFamilyWillBe: famNorm,
    }),
  );

  const summaryMainEnergyLabel = moldaviteV1
    ? String(moldaviteV1.flexSurface.mainEnergyShort || "").trim() ||
      baseMainEnergyLabel
    : amuletV1
      ? String(amuletV1.flexSurface.mainEnergyShort || "").trim() ||
        baseMainEnergyLabel
      : crystalBraceletV1
        ? String(crystalBraceletV1.flexSurface.mainEnergyShort || "").trim() ||
          baseMainEnergyLabel
        : baseMainEnergyLabel;

  const summaryHeadlineShort = moldaviteV1
    ? moldaviteV1.flexSurface.headline
    : amuletV1
      ? amuletV1.flexSurface.headline
      : crystalBraceletV1
        ? crystalBraceletV1.flexSurface.headline
        : flexSurface.headlineShort;

  const summaryFitReasonShort = moldaviteV1
    ? moldaviteV1.flexSurface.fitLine
    : amuletV1
      ? amuletV1.flexSurface.fitLine
      : crystalBraceletV1
        ? crystalBraceletV1.flexSurface.fitLine
        : flexSurface.fitReasonShort;

  const summaryBulletsShort = moldaviteV1
    ? moldaviteV1.flexSurface.bullets
    : amuletV1
      ? amuletV1.flexSurface.bullets
      : crystalBraceletV1
        ? crystalBraceletV1.flexSurface.bullets
        : flexSurface.bulletsShort;

  const summaryPresentationAngleId = moldaviteV1
    ? "moldavite_v1_summary_first"
    : amuletV1
      ? "sacred_amulet_v1_summary_first"
      : crystalBraceletV1
        ? "crystal_bracelet_v1_summary_first"
        : flexSurface.wordingMeta?.presentationAngleId ?? undefined;

  const summaryWordingVariantId = moldaviteV1
    ? "moldavite_v1_summary_first"
    : amuletV1
      ? "sacred_amulet_v1_summary_first"
      : crystalBraceletV1
        ? "crystal_bracelet_v1_summary_first"
        : flexSurface.wordingMeta?.wordingVariantId ?? undefined;

  const summaryVisibleMainLabel = moldaviteV1
    ? String(moldaviteV1.flexSurface.headline || "").trim() || undefined
    : amuletV1
      ? String(amuletV1.flexSurface.headline || "").trim() || undefined
      : crystalBraceletV1
        ? String(crystalBraceletV1.flexSurface.headline || "").trim() ||
          undefined
        : dbSurfBundle?.mainLabel
          ? String(dbSurfBundle.mainLabel).trim()
          : undefined;

  const summaryOpeningShort =
    moldaviteV1 || amuletV1 || crystalBraceletV1
      ? undefined
      : dbSurfBundle?.opening
        ? String(dbSurfBundle.opening).trim()
        : undefined;

  const summaryTeaserShort =
    moldaviteV1 || amuletV1 || crystalBraceletV1
      ? undefined
      : dbSurfBundle?.teaser
        ? String(dbSurfBundle.teaser).trim()
        : undefined;

  const summaryCtaLabel = moldaviteV1
    ? "เปิดรายงานฉบับเต็ม"
    : amuletV1
      ? String(amuletV1.flexSurface.ctaLabel || "").trim() ||
        "เปิดรายงานฉบับเต็ม"
      : crystalBraceletV1
        ? String(crystalBraceletV1.flexSurface.ctaLabel || "").trim() ||
          "เปิดรายงานฉบับเต็ม"
        : flexSurface.ctaLabel;

  /** Hero `คะแนนพลัง` / `ระดับ` for sacred_amulet: derived from six axis scores (same as graph), not parsed scan text. */
  const summaryEnergyScore =
    amuletV1 != null
      ? deriveSacredAmuletEnergyScore10FromPowerCategories(amuletV1.powerCategories)
      : energyScore;
  const summaryEnergyLevelLabel =
    summaryEnergyScore != null && Number.isFinite(Number(summaryEnergyScore))
      ? score10ToEnergyGrade(Number(summaryEnergyScore))
      : "";

  /** @type {import("./reportPayload.types.js").ReportTimingV1 | undefined} */
  let timingV1 = undefined;
  if (amuletV1 && birthdateUsed) {
    const bdIso = normalizeBirthdateIso(String(birthdateUsed));
    if (bdIso && parseIsoYmd(bdIso)) {
      const fit =
        compatPct != null && Number.isFinite(Number(compatPct))
          ? Math.round(Number(compatPct))
          : Math.round(
              Math.min(
                100,
                Math.max(0, (Number(summaryEnergyScore) || 5) * 10),
              ),
            );
      timingV1 = computeTimingV1({
        birthdateIso: bdIso,
        lane: "sacred_amulet",
        primaryKey: String(amuletV1.primaryPower || "").trim() || "protection",
        secondaryKey: String(amuletV1.secondaryPower || "").trim() || undefined,
        scannedAtIso: new Date().toISOString(),
        compatibilityScore:
          compatPct != null && Number.isFinite(Number(compatPct))
            ? Math.round(Number(compatPct))
            : undefined,
        ownerFitScore: fit,
      });
    }
  }

  return {
    reportId: rid,
    publicToken: tok,
    scanId: String(scanRequestId || "").trim(),
    userId: String(lineUserId || "").trim(),
    birthdateUsed: birthdateUsed ? String(birthdateUsed) : null,
    generatedAt: new Date().toISOString(),
    reportVersion: REPORT_PAYLOAD_VERSION,
    object: {
      objectImageUrl,
      objectLabel: "วัตถุจากการสแกน",
      objectType: "",
    },
    summary: {
      energyScore: summaryEnergyScore,
      energyLevelLabel: summaryEnergyLevelLabel,
      mainEnergyLabel: summaryMainEnergyLabel,
      compatibilityPercent: compatPct,
      compatibilityBand: compatibilityBand || undefined,
      summaryLine,
      wordingFamily: wording.wordingFamily || undefined,
      clarityLevel: wording.clarityLevel || undefined,
      birthdayLabel: birthdayLabel || undefined,
      compatibilityReason: compatibilityReason || undefined,
      secondaryEnergyLabel: secondaryEnergyLabel || undefined,
      scanDimensions: (() => {
        if (objectEnergyPayload?.stars) {
          return scanDimensionsFromObjectEnergyStars(objectEnergyPayload.stars);
        }
        return Object.keys(scanDimensionsParsed).length > 0
          ? scanDimensionsParsed
          : undefined;
      })(),
      scanTips: whatItGives.length > 0 ? whatItGives.slice(0, 2) : undefined,
      headlineShort: summaryHeadlineShort,
      fitReasonShort: summaryFitReasonShort,
      bulletsShort: summaryBulletsShort,
      ctaLabel: summaryCtaLabel,
      presentationAngleId: summaryPresentationAngleId,
      wordingVariantId: summaryWordingVariantId,
      energyCategoryCode,
      energyCopyObjectFamily,
      crystalMode,
      openingShort: summaryOpeningShort,
      teaserShort: summaryTeaserShort,
      visibleMainLabel: summaryVisibleMainLabel,
    },
    sections: {
      whatItGives,
      messagePoints,
      ownerMatchReason,
      roleDescription,
      bestUseCases,
      weakMoments,
      guidanceTips,
      careNotes: [],
      miniRitual: [],
    },
    trust: {
      modelLabel: modelLabel || undefined,
      trustNote: moldaviteV1
        ? MOLDAVITE_DEFAULT_TRUST_NOTE
        : "รายงานนี้จัดทำจากข้อความวิเคราะห์ที่สร้างจากภาพและข้อมูลที่คุณให้ ไม่ใช่คำแนะนำทางการแพทย์หรือการเงิน",
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
      ...(moldaviteV1
        ? {
            heroNaming: String(
              moldaviteV1.flexSurface.heroNamingLine ||
                "มอลดาไวต์ — เร่งการเปลี่ยนแปลง",
            ).trim(),
            mainEnergy: String(
              moldaviteV1.flexSurface.mainEnergyWordingLine ||
                "มอลดาไวต์ — หินเทคไทต์โทนเร่งการเปลี่ยนแปลง",
            ).trim(),
            htmlOpeningLine: String(
              moldaviteV1.flexSurface.htmlOpeningLine ||
                moldaviteV1.flexSurface.mainEnergyWordingLine ||
                "",
            ).trim(),
          }
        : {}),
      ...(amuletV1 && !moldaviteV1
        ? {
            heroNaming: String(
              amuletV1.flexSurface.heroNamingLine || "พระเครื่อง",
            ).trim(),
            mainEnergy: String(
              amuletV1.flexSurface.mainEnergyWordingLine || "",
            ).trim(),
            htmlOpeningLine: String(
              amuletV1.flexSurface.htmlOpeningLine || "",
            ).trim(),
          }
        : {}),
      ...(crystalBraceletV1 && !moldaviteV1 && !amuletV1
        ? {
            heroNaming: String(
              crystalBraceletV1.flexSurface.heroNamingLine || "",
            ).trim(),
            mainEnergy: String(
              crystalBraceletV1.flexSurface.mainEnergyWordingLine || "",
            ).trim(),
            htmlOpeningLine: String(
              crystalBraceletV1.flexSurface.htmlOpeningLine || "",
            ).trim(),
          }
        : {}),
    },
    compatibility: compatibilityPayload
      ? {
          score: compatibilityPayload.score,
          band: compatibilityPayload.band,
          formulaVersion: compatibilityPayload.formulaVersion,
          factors: compatibilityPayload.factors,
          inputs: compatibilityPayload.inputs,
          explain: compatibilityPayload.explain,
        }
      : undefined,
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
      objectFamily: String(objectFamilyOpt || "").trim() || undefined,
      resolvedCategoryCode: energyCategoryCode,
      diversificationApplied: Boolean(flexSurface.wordingMeta?.diversificationApplied),
      wordingBankUsed: flexSurface.wordingMeta?.wordingBankUsed,
      wordingVariantId: flexSurface.wordingMeta?.wordingVariantId,
      flexPresentationAngleId: flexSurface.wordingMeta?.presentationAngleId,
      crystalMode: crystalMode ?? undefined,
      matchedSignalsCount: crystalSignalTags.length,
      parsedMainEnergyRaw: String(mainEnergyForCategoryInference || "").slice(
        0,
        240,
      ),
      mainEnergySource: parsed.mainEnergyResolution?.source ?? "missing",
      resolveEnergyTypeResult:
        energyCategoryInferenceTrace.resolveEnergyTypeResult,
      protectKeywordMatched:
        energyCategoryInferenceTrace.protectKeywordMatched ?? undefined,
      protectWeakKeywordMatched:
        energyCategoryInferenceTrace.protectWeakKeywordMatched ?? undefined,
      protectSignalStrength:
        energyCategoryInferenceTrace.protectSignalStrength,
      energyTypeResolverMode:
        energyCategoryInferenceTrace.energyTypeResolverMode,
      energyTypeResolverFamily:
        energyCategoryInferenceTrace.energyTypeResolverFamily,
      resolvedEnergyTypeBeforeCategoryMap:
        energyCategoryInferenceTrace.resolvedEnergyTypeBeforeCategoryMap,
      crystalWeakProtectOutcome:
        energyCategoryInferenceTrace.crystalWeakProtectOutcome ?? undefined,
      crystalNonProtectRoutingReason:
        energyCategoryInferenceTrace.crystalNonProtectRoutingReason,
      crystalPostResolverCategoryDecision:
        energyCategoryInferenceTrace.crystalPostResolverCategoryDecision,
      crystalRoutingRuleId:
        energyCategoryInferenceTrace.crystalRoutingRuleId,
      crystalRoutingReason:
        energyCategoryInferenceTrace.crystalRoutingReason,
      crystalRoutingStrategy:
        energyCategoryInferenceTrace.crystalRoutingStrategy,
      energyCategoryInferenceBranch:
        energyCategoryInferenceTrace.inferenceBranch,
      ...(dbSurfaceOk && dbBundleResolved
        ? {
            ...logFieldsFromDbBundle(dbBundleResolved),
            visibleMainLabelSource: String(dbSurfBundle?.mainLabel || "").trim()
              ? "db"
              : "truth_or_absent",
            visibleCopyUsedCodeFallback: false,
          }
        : {
            wordingPrimarySource: "code_bank",
            visibleMainLabelSource: "truth_or_composed",
            visibleCopyUsedCodeFallback: true,
            dbWordingSelected: false,
            dbWordingRowId: null,
            dbWordingSlot: null,
            dbWordingPresentationAngle: null,
            dbWordingClusterTag: null,
            dbWordingFallbackLevel: null,
          }),
      visibleWordingDecisionSource:
        visibleWordingPriorityDiag.visibleWordingDecisionSource,
      visibleWordingObjectFamilyUsed:
        visibleWordingPriorityDiag.visibleWordingObjectFamilyUsed,
      visibleWordingCrystalSpecific:
        visibleWordingPriorityDiag.visibleWordingCrystalSpecific,
      visibleWordingCategoryUsed:
        visibleWordingPriorityDiag.visibleWordingCategoryUsed,
      visibleWordingPresentationAngle:
        visibleWordingPriorityDiag.visibleWordingPresentationAngle ?? undefined,
      visibleWordingFallbackLevel:
        visibleWordingPriorityDiag.visibleWordingFallbackLevel ?? undefined,
      visibleWordingReason: visibleWordingPriorityDiag.visibleWordingReason,
      routingWordingMetrics,
      enrichmentEligible: undefined,
      enrichmentUsed: undefined,
      enrichmentProvider: undefined,
      deliveryStrategy: undefined,
      lineSummaryPresent: undefined,
      crystalGenericSafeActive: false,
      moldaviteDecisionSource:
        famNorm === "crystal" ? moldaviteDecisionSource : undefined,
      geminiCrystalSubtypeMode:
        geminiCrystalSubtypeResultOpt?.mode ?? undefined,
      geminiCrystalSubtypeSummary:
        geminiCrystalSubtypeResultOpt &&
        geminiCrystalSubtypeResultOpt.mode === "ok"
          ? {
              crystalSubtype: geminiCrystalSubtypeResultOpt.crystalSubtype,
              subtypeConfidence: geminiCrystalSubtypeResultOpt.subtypeConfidence,
              moldaviteLikely: geminiCrystalSubtypeResultOpt.moldaviteLikely,
              durationMs: geminiCrystalSubtypeResultOpt.durationMs,
            }
          : undefined,
    },
    ...(moldaviteV1 ? { moldaviteV1 } : {}),
    ...(amuletV1 ? { amuletV1 } : {}),
    ...(crystalBraceletV1 ? { crystalBraceletV1 } : {}),
    ...(timingV1 ? { timingV1 } : {}),
  };
}
