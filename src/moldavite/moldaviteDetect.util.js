import { normalizeObjectFamilyForEnergyCopy } from "../utils/energyCategoryResolve.util.js";

/**
 * Explicit mineral / marketing names (EN + TH). Does not include tektite-only (handled separately).
 */
const MOLDAVITE_LITERAL_RE =
  /moldavite|moldavites|moldervite|มอลดา|มอลดาไวต์|มอลดาไวท์|มอลดาไวต์\s*ไทย|หินมอลดา|มอลดาวี|มอลดา\s*ไวต์|มอลดา\s*ไวท์/i;

/** Tektite class — Moldavite is the common green tektite in scans. */
const TEKTITE_RE = /tektites?|เทคไทต์|แทคไทต์|เทคไทท์|ตัวเทคไทต์/i;

/**
 * GPT/vision often describes Moldavite without the Latin token "tektite" (Thai prose).
 * Matched only against structured inference text — not full resultText — to avoid footer/noise.
 */
const GPT_INFERENCE_MOLDAVITE_DESCRIPTIVE_RE =
  /หินแก้วจากอุกกาบาต|แก้วจากอุกกาบาต|แก้วอุกกาบาต|หินกระจกจากอุกกาบาต|หินกระจก\s*อุกกาบาต|bohemian\s+tektite|czech\s+tektite|green\s+tektite/i;

/**
 * Strong subtype line: Moldavite or green tektite called out in narrative (inference fields only).
 */
const GPT_INFERENCE_MOLDAVITE_OR_GREEN_TEKTITE_RE =
  /(มอลดาไวต์|มอลดาไวท์|มอลดา|Moldavite|moldavite)[^\n]{0,48}(เทคไทต์|tektite|อุกกาบาต)|(เทคไทต์|tektite)[^\n]{0,64}(สีเขียว|เขียว|มรกต|green|โทนเขียว|มอลดา)/i;

/**
 * Build a single string from GPT-structured scan sections + vision category (subtype inference surface).
 * Excludes closing/footer-only lines — reduces weight of incidental mentions.
 *
 * @param {object} p
 * @param {string} [p.overview]
 * @param {string} [p.mainEnergy]
 * @param {string} [p.fitReason]
 * @param {string|null} [p.pipelineObjectCategory]
 * @returns {string}
 */
export function buildGptCrystalSubtypeInferenceText({
  overview = "",
  mainEnergy = "",
  fitReason = "",
  pipelineObjectCategory = null,
} = {}) {
  const ov = String(overview || "").trim();
  const me = String(mainEnergy || "").trim();
  const fr = String(fitReason || "").trim();
  const cat = String(pipelineObjectCategory || "").trim();

  const parts = [];
  if (cat) parts.push(cat);
  if (me && me !== "-") parts.push(me);
  if (ov && ov !== "-") parts.push(ov.slice(0, 2000));
  if (fr && fr !== "-") parts.push(fr.slice(0, 600));

  return parts.join("\n").trim();
}

/**
 * Classifier/cache labels often bundle color (vision slug may be missing).
 * @param {string} cat
 */
function categoryHintsGreen(cat) {
  return /สีเขียว|สีโทนเขียว|โทนเขียว|สีมรกต|\bgreen\b/i.test(String(cat || ""));
}

/**
 * Green cues inside narrative (ภาพรวม / เหตุผล) — supports descriptive Moldavite path.
 * @param {string} text
 */
function greenHintInInferenceText(text) {
  return /สีเขียว|สีโทนเขียว|โทนเขียว|สีมรกต|เขียวอม|มรกต|\bgreen\b/i.test(
    String(text || ""),
  );
}

/**
 * Color / tone support for conservative Moldavite inference (not used alone).
 * @param {string} colorSlug
 * @param {string} cat
 * @param {string} inferenceText
 */
function colorSupportsMoldaviteInference(colorSlug, cat, inferenceText) {
  if (colorSlug === "green" || colorSlug === "mixed") return true;
  if (categoryHintsGreen(cat)) return true;
  if (greenHintInInferenceText(inferenceText)) return true;
  return false;
}

/**
 * Vision v1 / cache often emits `mixed` for green-heavy specimens (skin/background).
 * Never sufficient alone — must pair with tektite or category green hint (see detect).
 * @param {string} colorSlug
 */
function slugSupportsTektiteColorCombo(colorSlug) {
  return colorSlug === "green" || colorSlug === "mixed";
}

/**
 * GPT subtype inference: descriptive Moldavite / green tektite prose in structured fields.
 * @param {object} p
 * @param {string} p.inferenceText
 * @param {string} p.colorSlug
 * @param {string} p.cat
 * @param {string} p.pipelineObjectCategorySource
 */
function evaluateGptSubtypeInferenceMoldavite({
  inferenceText,
  colorSlug,
  cat,
  pipelineObjectCategorySource,
}) {
  const inf = String(inferenceText || "").trim();
  if (!inf) {
    return {
      isMoldavite: false,
      reason: "",
      signals: [],
      descriptiveMatch: false,
      strongLineMatch: false,
      colorSupports: false,
    };
  }

  const colorSupports = colorSupportsMoldaviteInference(colorSlug, cat, inf);
  /** @type {string[]} */
  const signals = [];

  if (MOLDAVITE_LITERAL_RE.test(inf)) {
    signals.push("gpt_inference_literal_moldavite_name");
    return {
      isMoldavite: true,
      reason: "gpt_subtype_inference_literal",
      signals,
      descriptiveMatch: false,
      strongLineMatch: true,
      colorSupports: true,
    };
  }

  const descriptive =
    GPT_INFERENCE_MOLDAVITE_DESCRIPTIVE_RE.test(inf) && colorSupports;
  if (descriptive) {
    signals.push("gpt_inference_descriptive_prose");
    if (String(pipelineObjectCategorySource || "").trim() === "deep_scan") {
      signals.push("gpt_inference_category_source_deep_scan");
    }
    return {
      isMoldavite: true,
      reason: "gpt_subtype_inference_descriptive_prose",
      signals,
      descriptiveMatch: true,
      strongLineMatch: false,
      colorSupports,
    };
  }

  const strongLine =
    GPT_INFERENCE_MOLDAVITE_OR_GREEN_TEKTITE_RE.test(inf) && colorSupports;
  if (strongLine) {
    signals.push("gpt_inference_strong_subtype_line");
    return {
      isMoldavite: true,
      reason: "gpt_subtype_inference_strong_line",
      signals,
      descriptiveMatch: false,
      strongLineMatch: true,
      colorSupports,
    };
  }

  return {
    isMoldavite: false,
    reason: "",
    signals: [],
    descriptiveMatch: false,
    strongLineMatch: false,
    colorSupports,
  };
}

/**
 * @param {object} p
 * @param {string} [p.objectFamily]
 * @param {string|null} [p.pipelineObjectCategory]
 * @param {string} [p.resultText]
 * @param {string|null|undefined} [p.dominantColorNormalized] — slug from vision/cache, e.g. "green", "mixed"
 * @param {string} [p.scanResultIdPrefix] — for telemetry only
 * @param {string} [p.gptSubtypeInferenceText] — structured GPT sections + category; see {@link buildGptCrystalSubtypeInferenceText}
 * @param {string} [p.pipelineObjectCategorySource] — e.g. deep_scan, vision_v1, cache_classify
 * @returns {{ isMoldavite: false, reason: string } | { isMoldavite: true, reason: string, matchedSignals: string[] }}
 */
export function detectMoldaviteV1({
  objectFamily,
  pipelineObjectCategory = null,
  resultText = "",
  dominantColorNormalized = null,
  scanResultIdPrefix = "",
  gptSubtypeInferenceText = "",
  pipelineObjectCategorySource = "unspecified",
}) {
  const fam = normalizeObjectFamilyForEnergyCopy(String(objectFamily || ""));
  if (fam !== "crystal") {
    const out = { isMoldavite: false, reason: "not_crystal_family" };
    logMoldaviteDetection(scanResultIdPrefix, out, {
      objectFamilyNormalized: fam,
      dominantColorNormalized: dominantColorNormalized ?? null,
      activationPath: "none",
    });
    return out;
  }

  const cat = String(pipelineObjectCategory || "");
  const rt = String(resultText || "");
  const colorSlug = String(dominantColorNormalized || "")
    .trim()
    .toLowerCase();
  const inf = String(gptSubtypeInferenceText || "").trim();

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
  const mixedFromSlug = colorSlug === "mixed";
  const slugSupportsCombo = slugSupportsTektiteColorCombo(colorSlug);
  const greenFromCategory = categoryHintsGreen(cat);

  if (
    (tektiteInCategory || tektiteInResult) &&
    (slugSupportsCombo || greenFromCategory)
  ) {
    if (tektiteInCategory) matchedSignals.push("pipeline_object_category_tektite");
    if (tektiteInResult) matchedSignals.push("result_text_tektite");
    if (greenFromSlug) matchedSignals.push("dominant_color_green");
    if (mixedFromSlug) matchedSignals.push("dominant_color_mixed");
    if (greenFromCategory) matchedSignals.push("category_green_hint");
  }

  let reason = "no_moldavite_signal";
  let isMoldavite = false;
  /** @type {"none"|"legacy_literal"|"legacy_tektite_color"|"gpt_subtype_inference"} */
  let activationPath = "none";

  const literalHit =
    matchedSignals.includes("pipeline_object_category_literal") ||
    matchedSignals.includes("result_text_literal");

  const tektiteColorHit =
    (tektiteInCategory || tektiteInResult) &&
    (slugSupportsCombo || greenFromCategory);

  const gptEval = inf
    ? evaluateGptSubtypeInferenceMoldavite({
        inferenceText: inf,
        colorSlug,
        cat,
        pipelineObjectCategorySource: String(pipelineObjectCategorySource || ""),
      })
    : null;

  if (literalHit) {
    isMoldavite = true;
    reason = "literal_moldavite_label";
    activationPath = "legacy_literal";
  } else if (tektiteColorHit) {
    isMoldavite = true;
    reason = "tektite_with_color_signal";
    activationPath = "legacy_tektite_color";
  } else if (gptEval?.isMoldavite) {
    isMoldavite = true;
    reason = gptEval.reason;
    activationPath = "gpt_subtype_inference";
    for (const s of gptEval.signals) {
      if (s && !matchedSignals.includes(s)) matchedSignals.push(s);
    }
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
    mixedFromSlug,
    slugSupportsTektiteCombo: slugSupportsCombo,
    greenFromCategory,
    gptSubtypeInferenceCharCount: inf.length,
    pipelineObjectCategorySource: String(
      pipelineObjectCategorySource || "unspecified",
    ).slice(0, 32),
    activationPath,
    gptInferenceDescriptiveProbe: Boolean(gptEval?.descriptiveMatch),
    gptInferenceStrongLineProbe: Boolean(gptEval?.strongLineMatch),
    gptInferenceColorSupports: Boolean(gptEval?.colorSupports),
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
