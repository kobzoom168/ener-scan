import { normalizeObjectFamilyForEnergyCopy } from "../utils/energyCategoryResolve.util.js";

/**
 * Explicit mineral / marketing names (EN + TH). Does not include tektite-only (handled separately).
 */
const MOLDAVITE_LITERAL_RE =
  /moldavite|moldavites|moldervite|มอลดา|มอลดาไวต์|มอลดาไวท์|มอลดาไวต์\s*ไทย|หินมอลดา|มอลดาวี|มอลดา\s*ไวต์|มอลดา\s*ไวท์/i;

/** Tektite class — Moldavite is the common green tektite in scans; combo with green is conservative. */
const TEKTITE_RE = /tektites?|เทคไทต์|แทคไทต์|เทคไทท์|ตัวเทคไทต์/i;

/**
 * Classifier/cache labels often bundle color (vision slug may be missing).
 * @param {string} cat
 */
function categoryHintsGreen(cat) {
  return /สีเขียว|สีโทนเขียว|โทนเขียว|สีมรกต|\bgreen\b/i.test(String(cat || ""));
}

/**
 * @param {object} p
 * @param {string} [p.objectFamily]
 * @param {string|null} [p.pipelineObjectCategory]
 * @param {string} [p.resultText]
 * @param {string|null|undefined} [p.dominantColorNormalized] — slug from vision/cache, e.g. "green"
 * @param {string} [p.scanResultIdPrefix] — for telemetry only
 * @returns {{ isMoldavite: false, reason: string } | { isMoldavite: true, reason: string, matchedSignals: string[] }}
 */
export function detectMoldaviteV1({
  objectFamily,
  pipelineObjectCategory = null,
  resultText = "",
  dominantColorNormalized = null,
  scanResultIdPrefix = "",
}) {
  const fam = normalizeObjectFamilyForEnergyCopy(String(objectFamily || ""));
  if (fam !== "crystal") {
    const out = { isMoldavite: false, reason: "not_crystal_family" };
    logMoldaviteDetection(scanResultIdPrefix, out, {
      objectFamilyNormalized: fam,
      dominantColorNormalized: dominantColorNormalized ?? null,
    });
    return out;
  }

  const cat = String(pipelineObjectCategory || "");
  const rt = String(resultText || "");
  const colorSlug = String(dominantColorNormalized || "")
    .trim()
    .toLowerCase();

  /** @type {string[]} */
  const matchedSignals = [];

  if (cat && MOLDAVITE_LITERAL_RE.test(cat)) {
    matchedSignals.push("pipeline_object_category_literal");
  }
  if (rt && MOLDAVITE_LITERAL_RE.test(rt)) {
    matchedSignals.push("result_text_literal");
  }

  const hasTektite = (s) => Boolean(s && TEKTITE_RE.test(s));
  const tektiteInCategory = hasTektite(cat);
  const tektiteInResult = hasTektite(rt);
  const greenFromSlug = colorSlug === "green";
  const greenFromCategory = categoryHintsGreen(cat);

  if (
    (tektiteInCategory || tektiteInResult) &&
    (greenFromSlug || greenFromCategory)
  ) {
    if (tektiteInCategory) matchedSignals.push("pipeline_object_category_tektite");
    if (tektiteInResult) matchedSignals.push("result_text_tektite");
    if (greenFromSlug) matchedSignals.push("dominant_color_green");
    if (greenFromCategory) matchedSignals.push("category_green_hint");
  }

  let reason = "no_moldavite_signal";
  let isMoldavite = false;

  const literalHit =
    matchedSignals.includes("pipeline_object_category_literal") ||
    matchedSignals.includes("result_text_literal");

  if (literalHit) {
    isMoldavite = true;
    reason = "literal_moldavite_label";
  } else if (
    (tektiteInCategory || tektiteInResult) &&
    (greenFromSlug || greenFromCategory)
  ) {
    isMoldavite = true;
    reason = "tektite_with_green_signal";
  }

  const out = isMoldavite
    ? {
        isMoldavite: true,
        reason,
        matchedSignals: [...new Set(matchedSignals)].filter(Boolean),
      }
    : { isMoldavite: false, reason };

  logMoldaviteDetection(scanResultIdPrefix, out, {
    objectFamilyNormalized: fam,
    dominantColorNormalized: colorSlug || null,
    pipelineCategoryLen: cat.length,
    resultTextLen: rt.length,
    tektiteInCategory,
    tektiteInResult,
    greenFromSlug,
    greenFromCategory,
  });

  return out;
}

/**
 * @param {string} scanResultIdPrefix
 * @param {{ isMoldavite: boolean, reason: string, matchedSignals?: string[] }} result
 * @param {Record<string, unknown>} [extra]
 */
function logMoldaviteDetection(scanResultIdPrefix, result, extra = {}) {
  console.log(
    JSON.stringify({
      event: "MOLDAVITE_V1_DETECTION",
      scanResultIdPrefix: String(scanResultIdPrefix || "").slice(0, 8),
      isMoldavite: result.isMoldavite,
      reason: result.reason,
      matchedSignals:
        result.isMoldavite && Array.isArray(result.matchedSignals)
          ? result.matchedSignals
          : [],
      ...extra,
    }),
  );
}
