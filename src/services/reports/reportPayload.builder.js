import { parseScanText } from "../flex/flex.parser.js";
import { normalizeScore, stripBullet } from "../flex/flex.utils.js";
import { REPORT_PAYLOAD_VERSION } from "./reportPayload.types.js";
import { sanitizeHttpsPublicImageUrl } from "../../utils/reports/reportImageUrl.util.js";
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
 * @param {number|null} n
 * @returns {string}
 */
function energyLevelLabelFromScore(n) {
  if (n == null || !Number.isFinite(n)) return "";
  if (n >= 7.5) return "สูง";
  if (n >= 5) return "ปานกลาง";
  return "อ่อน";
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
function emptyParsedShape() {
  return {
    energyScore: "-",
    mainEnergy: "-",
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
 * @returns {import("./reportPayload.types.js").ReportPayload}
 */
export function buildReportPayloadFromScan(opts) {
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
  } = opts;

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

  const whatItGives = mapStripBullets(parsed.supportTopics);
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

  const bestUseCases = mapStripBullets(parsed.suitable);

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

  const wording = deriveReportWordingFromParsed(parsed, {
    seed: rid || scanResultId,
    energyScore,
    compatibilityPercent: compatPct,
  });

  const compatibilityBand =
    compatibilityPayload?.band != null
      ? String(compatibilityPayload.band)
      : "";

  const flexSurface = buildFlexSummarySurfaceFields({
    wording,
    compatibilityReason,
    summaryLine,
    scanTips: whatItGives.length > 0 ? whatItGives.slice(0, 2) : undefined,
  });

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
    }),
  );

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
      energyScore,
      energyLevelLabel: energyLevelLabelFromScore(energyScore),
      mainEnergyLabel: wording.mainEnergy
        ? String(wording.mainEnergy)
        : parsed.mainEnergy && parsed.mainEnergy !== "-"
          ? String(parsed.mainEnergy)
          : "",
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
      headlineShort: flexSurface.headlineShort,
      fitReasonShort: flexSurface.fitReasonShort,
      bulletsShort: flexSurface.bulletsShort,
      ctaLabel: flexSurface.ctaLabel,
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
      ...wording,
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
  };
}
