/**
 * Combines Gemini crystal subtype output with legacy Moldavite heuristics for report routing.
 * @module
 */

/**
 * @typedef {object} HeuristicDetection
 * @property {boolean} isMoldavite
 * @property {string} reason
 * @property {string[]} [matchedSignals]
 */

/**
 * @param {object} p
 * @param {string} p.famNorm — normalized object family (e.g. crystal)
 * @param {object|null|undefined} p.geminiCrystalSubtypeResult
 * @param {number} p.minConfidence — 0..1
 * @param {() => HeuristicDetection} p.runHeuristic — call detectMoldaviteV1
 * @returns {{
 *   detection: HeuristicDetection,
 *   moldaviteDecisionSource: "gemini" | "gemini_error" | "gemini_not_moldavite" | "heuristic",
 * }}
 */
export function resolveMoldaviteDetectionWithGeminiCrystalSubtype({
  famNorm,
  geminiCrystalSubtypeResult: gemini,
  minConfidence,
  runHeuristic,
}) {
  if (famNorm !== "crystal") {
    const detection = runHeuristic();
    return { detection, moldaviteDecisionSource: "heuristic" };
  }

  if (!gemini || gemini.mode === "skipped" || gemini.mode === "disabled") {
    const detection = runHeuristic();
    return { detection, moldaviteDecisionSource: "heuristic" };
  }

  if (gemini.mode === "error" || gemini.mode === "timeout") {
    return {
      detection: {
        isMoldavite: false,
        reason: "gemini_crystal_subtype_unavailable",
      },
      moldaviteDecisionSource: "gemini_error",
    };
  }

  if (gemini.mode === "ok") {
    const conf = Number(gemini.subtypeConfidence);
    const min = Number(minConfidence);
    const threshold = Number.isFinite(min) ? min : 0.72;
    const likely =
      gemini.moldaviteLikely === true &&
      Number.isFinite(conf) &&
      conf >= threshold;

    if (likely) {
      return {
        detection: {
          isMoldavite: true,
          reason: "gemini_crystal_subtype",
          matchedSignals: [
            "gemini_crystal_subtype",
            `gemini_subtype:${String(gemini.crystalSubtype || "").slice(0, 24)}`,
          ],
        },
        moldaviteDecisionSource: "gemini",
      };
    }

    return {
      detection: {
        isMoldavite: false,
        reason: "gemini_crystal_subtype_not_moldavite",
      },
      moldaviteDecisionSource: "gemini_not_moldavite",
    };
  }

  const detection = runHeuristic();
  return { detection, moldaviteDecisionSource: "heuristic" };
}
