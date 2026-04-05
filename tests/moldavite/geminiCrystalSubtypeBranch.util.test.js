import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveMoldaviteDetectionWithGeminiCrystalSubtype } from "../../src/moldavite/geminiCrystalSubtypeBranch.util.js";

test("resolveMoldaviteDetectionWithGeminiCrystalSubtype: Gemini ok + Moldavite + confidence", () => {
  const { detection, moldaviteDecisionSource } =
    resolveMoldaviteDetectionWithGeminiCrystalSubtype({
      famNorm: "crystal",
      geminiCrystalSubtypeResult: {
        mode: "ok",
        crystalSubtype: "moldavite",
        subtypeConfidence: 0.9,
        moldaviteLikely: true,
      },
      minConfidence: 0.72,
      runHeuristic: () => {
        throw new Error("heuristic should not run");
      },
    });
  assert.equal(detection.isMoldavite, true);
  assert.equal(detection.reason, "gemini_crystal_subtype");
  assert.ok(detection.matchedSignals?.includes("gemini_crystal_subtype"));
  assert.equal(moldaviteDecisionSource, "gemini");
});

test("resolveMoldaviteDetectionWithGeminiCrystalSubtype: Gemini ok but low confidence uses heuristic fallback? — no, uses not_moldavite", () => {
  const { detection, moldaviteDecisionSource } =
    resolveMoldaviteDetectionWithGeminiCrystalSubtype({
      famNorm: "crystal",
      geminiCrystalSubtypeResult: {
        mode: "ok",
        crystalSubtype: "moldavite",
        subtypeConfidence: 0.5,
        moldaviteLikely: true,
      },
      minConfidence: 0.72,
      runHeuristic: () => ({ isMoldavite: true, reason: "would_heuristic" }),
    });
  assert.equal(detection.isMoldavite, false);
  assert.equal(detection.reason, "gemini_crystal_subtype_not_moldavite");
  assert.equal(moldaviteDecisionSource, "gemini_not_moldavite");
});

test("resolveMoldaviteDetectionWithGeminiCrystalSubtype: Gemini error → no Moldavite", () => {
  const { detection, moldaviteDecisionSource } =
    resolveMoldaviteDetectionWithGeminiCrystalSubtype({
      famNorm: "crystal",
      geminiCrystalSubtypeResult: { mode: "error", reason: "x" },
      minConfidence: 0.72,
      runHeuristic: () => ({ isMoldavite: true, reason: "literal" }),
    });
  assert.equal(detection.isMoldavite, false);
  assert.equal(moldaviteDecisionSource, "gemini_error");
});

test("resolveMoldaviteDetectionWithGeminiCrystalSubtype: disabled → heuristic", () => {
  let ran = false;
  const { detection, moldaviteDecisionSource } =
    resolveMoldaviteDetectionWithGeminiCrystalSubtype({
      famNorm: "crystal",
      geminiCrystalSubtypeResult: { mode: "disabled" },
      minConfidence: 0.72,
      runHeuristic: () => {
        ran = true;
        return { isMoldavite: true, reason: "literal_moldavite_label" };
      },
    });
  assert.equal(ran, true);
  assert.equal(detection.isMoldavite, true);
  assert.equal(moldaviteDecisionSource, "heuristic");
});

test("resolveMoldaviteDetectionWithGeminiCrystalSubtype: non-crystal always heuristic", () => {
  const { moldaviteDecisionSource } =
    resolveMoldaviteDetectionWithGeminiCrystalSubtype({
      famNorm: "thai_amulet",
      geminiCrystalSubtypeResult: {
        mode: "ok",
        crystalSubtype: "moldavite",
        subtypeConfidence: 1,
        moldaviteLikely: true,
      },
      minConfidence: 0.72,
      runHeuristic: () => ({ isMoldavite: false, reason: "not_crystal_family" }),
    });
  assert.equal(moldaviteDecisionSource, "heuristic");
});
