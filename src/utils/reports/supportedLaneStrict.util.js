/**
 * Strict 3-lane-only routing: moldavite | sacred_amulet | crystal_bracelet | unsupported.
 * Closed-world policy — unknown/generic/crystal-without-bracelet (non-Moldavite) => unsupported.
 *
 * @module
 */

import { env } from "../../config/env.js";
import { resolveMoldaviteDetectionWithGeminiCrystalSubtype } from "../../moldavite/geminiCrystalSubtypeBranch.util.js";
import { detectMoldaviteV1 } from "../../moldavite/moldaviteDetect.util.js";

/**
 * Pipeline objectFamily values that explicitly support the sacred_amulet lane (Thai classifier → slugs).
 * `generic` and `crystal` are never sacred_amulet without additional rules.
 * @param {string} objectFamilyRaw
 * @returns {boolean}
 */
export function pipelineFamilyImpliesSacredAmulet(objectFamilyRaw) {
  const s = String(objectFamilyRaw || "").trim().toLowerCase();
  return (
    s === "takrud" ||
    s === "somdej" ||
    s === "sacred_amulet" ||
    s === "thai_amulet"
  );
}

/**
 * @typedef {"moldavite"|"sacred_amulet"|"crystal_bracelet"|"unsupported"} StrictSupportedLane
 */

/**
 * @param {object} input
 * @param {string} input.baseGateResult — object gate final (e.g. single_supported)
 * @param {{ objectFamily?: string }} input.catSig — from mapObjectCategoryToPipelineSignals
 * @param {{ eligible?: boolean }} [input.braceletEligibility]
 * @param {object|null} [input.geminiCrystalSubtypeResult]
 * @param {string} [input.resultText]
 * @param {string|null} [input.dominantColorNormalized]
 * @param {string|null} [input.pipelineObjectCategory]
 * @param {string} [input.pipelineObjectCategorySource]
 * @param {string} [input.gptSubtypeInferenceText] — for Moldavite heuristic (see buildGptCrystalSubtypeInferenceText)
 * @param {string} [input.scanResultIdPrefix]
 * @returns {{
 *   lane: StrictSupportedLane,
 *   reason: string,
 *   moldaviteDetection?: { isMoldavite: boolean, reason: string },
 *   moldaviteDecisionSource?: string,
 * }}
 */
export function resolveSupportedLaneStrict(input) {
  const baseGateResult = String(input.baseGateResult || "").trim();
  const catSig = input.catSig && typeof input.catSig === "object" ? input.catSig : {};
  const familyRaw = String(catSig.objectFamily || "").trim().toLowerCase();
  const braceletEligibility = input.braceletEligibility || {};
  const braceletEligible = Boolean(braceletEligibility.eligible);
  const scanResultIdPrefix = String(input.scanResultIdPrefix || "").slice(0, 8);
  const gemini = input.geminiCrystalSubtypeResult ?? null;

  const normalizedBefore = familyRaw || "unknown";

  console.log(
    JSON.stringify({
      event: "SUPPORTED_LANE_STRICT_RESOLUTION_START",
      scanResultIdPrefix: scanResultIdPrefix || null,
      baseGateResult,
      normalizedFamilyBeforeStrict: normalizedBefore,
      braceletEligible,
    }),
  );

  if (baseGateResult !== "single_supported") {
    const out = {
      lane: /** @type {const} */ ("unsupported"),
      reason: "global_gate_not_single_supported",
    };
    console.log(
      JSON.stringify({
        event: "SUPPORTED_LANE_STRICT_RESOLUTION_RESULT",
        scanResultIdPrefix: scanResultIdPrefix || null,
        baseGateResult,
        normalizedFamilyBeforeStrict: normalizedBefore,
        finalStrictLane: out.lane,
        reason: out.reason,
      }),
    );
    console.log(
      JSON.stringify({
        event: "SUPPORTED_LANE_UNSUPPORTED",
        scanResultIdPrefix: scanResultIdPrefix || null,
        baseGateResult,
        reason: out.reason,
      }),
    );
    console.log(
      JSON.stringify({
        event: "SUPPORTED_LANE_LEGACY_PATH_BLOCKED",
        scanResultIdPrefix: scanResultIdPrefix || null,
        reason: "global_gate",
        detail: "non_single_supported",
      }),
    );
    return out;
  }

  const isCrystalContext =
    familyRaw === "crystal" || braceletEligible;

  /** @type {{ isMoldavite: boolean, reason: string } | undefined} */
  let moldDet;
  /** @type {string | undefined} */
  let moldSrc;

  if (isCrystalContext) {
    const resolved = resolveMoldaviteDetectionWithGeminiCrystalSubtype({
      famNorm: "crystal",
      geminiCrystalSubtypeResult: gemini,
      minConfidence: env.GEMINI_CRYSTAL_SUBTYPE_MIN_CONFIDENCE,
      runHeuristic: () =>
        detectMoldaviteV1({
          objectFamily: "crystal",
          pipelineObjectCategory: input.pipelineObjectCategory ?? null,
          resultText: String(input.resultText || ""),
          dominantColorNormalized: input.dominantColorNormalized ?? null,
          scanResultIdPrefix: scanResultIdPrefix || "",
          gptSubtypeInferenceText: String(input.gptSubtypeInferenceText || ""),
          pipelineObjectCategorySource: input.pipelineObjectCategorySource ?? "unspecified",
        }),
    });
    moldDet = resolved.detection;
    moldSrc = resolved.moldaviteDecisionSource;

    if (moldDet?.isMoldavite) {
      console.log(
        JSON.stringify({
          event: "SUPPORTED_LANE_MOLDAVITE_CONFIRMED",
          scanResultIdPrefix: scanResultIdPrefix || null,
          baseGateResult,
          moldaviteDecisionSource: moldSrc,
          moldaviteReason: moldDet.reason,
        }),
      );
      const out = {
        lane: /** @type {const} */ ("moldavite"),
        reason: "moldavite_proven",
        moldaviteDetection: moldDet,
        moldaviteDecisionSource: moldSrc,
      };
      console.log(
        JSON.stringify({
          event: "SUPPORTED_LANE_STRICT_RESOLUTION_RESULT",
          scanResultIdPrefix: scanResultIdPrefix || null,
          baseGateResult,
          normalizedFamilyBeforeStrict: normalizedBefore,
          moldaviteActive: true,
          braceletEligible,
          finalStrictLane: out.lane,
          reason: out.reason,
        }),
      );
      return out;
    }
  }

  if (
    pipelineFamilyImpliesSacredAmulet(catSig.objectFamily) &&
    !braceletEligible
  ) {
    console.log(
      JSON.stringify({
        event: "SUPPORTED_LANE_SACRED_AMULET_CONFIRMED",
        scanResultIdPrefix: scanResultIdPrefix || null,
        baseGateResult,
        pipelineObjectFamily: familyRaw,
      }),
    );
    const out = {
      lane: /** @type {const} */ ("sacred_amulet"),
      reason: "sacred_amulet_pipeline_proven",
    };
    console.log(
      JSON.stringify({
        event: "SUPPORTED_LANE_STRICT_RESOLUTION_RESULT",
        scanResultIdPrefix: scanResultIdPrefix || null,
        baseGateResult,
        normalizedFamilyBeforeStrict: normalizedBefore,
        braceletEligible,
        finalStrictLane: out.lane,
        reason: out.reason,
      }),
    );
    return out;
  }

  if (braceletEligible) {
    console.log(
      JSON.stringify({
        event: "SUPPORTED_LANE_CRYSTAL_BRACELET_CONFIRMED",
        scanResultIdPrefix: scanResultIdPrefix || null,
        baseGateResult,
        braceletEligible: true,
      }),
    );
    const out = {
      lane: /** @type {const} */ ("crystal_bracelet"),
      reason: "strict_bracelet_eligibility",
    };
    console.log(
      JSON.stringify({
        event: "SUPPORTED_LANE_STRICT_RESOLUTION_RESULT",
        scanResultIdPrefix: scanResultIdPrefix || null,
        baseGateResult,
        normalizedFamilyBeforeStrict: normalizedBefore,
        finalStrictLane: out.lane,
        reason: out.reason,
      }),
    );
    return out;
  }

  const out = {
    lane: /** @type {const} */ ("unsupported"),
    reason: "no_supported_lane_proof",
  };
  console.log(
    JSON.stringify({
      event: "SUPPORTED_LANE_STRICT_RESOLUTION_RESULT",
      scanResultIdPrefix: scanResultIdPrefix || null,
      baseGateResult,
      normalizedFamilyBeforeStrict: normalizedBefore,
      braceletEligible,
      moldaviteChecked: isCrystalContext,
      moldaviteActive: false,
      finalStrictLane: out.lane,
      reason: out.reason,
    }),
  );
  console.log(
    JSON.stringify({
      event: "SUPPORTED_LANE_UNSUPPORTED",
      scanResultIdPrefix: scanResultIdPrefix || null,
      baseGateResult,
      reason: out.reason,
      pipelineObjectFamily: familyRaw || null,
    }),
  );
  console.log(
    JSON.stringify({
      event: "SUPPORTED_LANE_LEGACY_PATH_BLOCKED",
      scanResultIdPrefix: scanResultIdPrefix || null,
      reason: "generic_summary_first_default",
      detail: "closed_world_no_supported_lane",
    }),
  );
  return out;
}
