import { normalizeObjectFamilyForEnergyCopy } from "../utils/energyCategoryResolve.util.js";

/** English + common Thai transliterations for Moldavite. */
const MOLDAVITE_KEYWORD_RE =
  /moldavite|มอลดา|มอลดาไวต์|มอลดาไวท์|มอลดาไวต์\s*ไทย/i;

/**
 * v1: crystal family + Moldavite keyword in classifier label and/or scan text.
 *
 * @param {object} p
 * @param {string} [p.objectFamily]
 * @param {string|null} [p.pipelineObjectCategory]
 * @param {string} [p.resultText]
 * @returns {{ isMoldavite: false, reason: string } | { isMoldavite: true, reason: string, matchedSignals: string[] }}
 */
export function detectMoldaviteV1({
  objectFamily,
  pipelineObjectCategory = null,
  resultText = "",
}) {
  const fam = normalizeObjectFamilyForEnergyCopy(String(objectFamily || ""));
  if (fam !== "crystal") {
    return { isMoldavite: false, reason: "not_crystal_family" };
  }

  const matched = [];
  const cat = String(pipelineObjectCategory || "");
  if (cat && MOLDAVITE_KEYWORD_RE.test(cat)) {
    matched.push("pipeline_object_category");
  }
  const rt = String(resultText || "");
  if (rt && MOLDAVITE_KEYWORD_RE.test(rt)) {
    matched.push("result_text");
  }

  if (matched.length === 0) {
    return { isMoldavite: false, reason: "no_moldavite_keyword" };
  }

  return {
    isMoldavite: true,
    reason: "keyword_match",
    matchedSignals: matched,
  };
}
