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
      presentationAngleId: "",
      crystalMode: crystalMode ?? "",
    });
    if (dbBundleResolved && isUsableVisibleSurface(dbBundleResolved.bundle)) {
      const b = dbBundleResolved.bundle;
      const clamped = clampFlexDbSurfaceLines(b.headline, b.fitLine, b.bullets);
      const headlineSlot = b.diagnostics?.dbWordingSlots?.find(
        (s) => s.slot === "headline",
      );
      const angleFromDb = headlineSlot?.presentationAngle ?? null;
      flexSurface = {
        headlineShort: String(clamped.headline || "").trim(),
        fitReasonShort: String(clamped.fitLine || "").trim(),
        bulletsShort: clamped.bullets,
        ctaLabel: "เปิดรายงานฉบับเต็ม",
        wordingMeta: {
          wordingVariantId: `db:${dbBundleResolved.categoryUsed}`,
          wordingBankUsed: "db:energy_copy_templates",
          presentationAngleId: angleFromDb,
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
      presentationAngleId: flexSurface.wordingMeta?.presentationAngleId ?? undefined,
      wordingVariantId: flexSurface.wordingMeta?.wordingVariantId ?? undefined,
      energyCategoryCode,
      energyCopyObjectFamily,
      crystalMode,
      openingShort: dbSurfBundle?.opening
        ? String(dbSurfBundle.opening).trim()
        : undefined,
      teaserShort: dbSurfBundle?.teaser
        ? String(dbSurfBundle.teaser).trim()
        : undefined,
      visibleMainLabel: dbSurfBundle?.mainLabel
        ? String(dbSurfBundle.mainLabel).trim()
        : undefined,
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
      enrichmentEligible: undefined,
      enrichmentUsed: undefined,
      enrichmentProvider: undefined,
      deliveryStrategy: undefined,
      lineSummaryPresent: undefined,
    },
  };
}
