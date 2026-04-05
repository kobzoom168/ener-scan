import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveEffectiveSubtypeConfidenceForNaming,
  resolveMoldaviteDisplayNaming,
} from "../../src/moldavite/moldaviteDisplayNaming.util.js";

test("resolveMoldaviteDisplayNaming: high from Gemini confidence", () => {
  const r = resolveMoldaviteDisplayNaming({
    geminiSubtypeConfidence: 0.85,
    moldaviteDecisionSource: "gemini",
    detectionReason: "gemini_crystal_subtype",
  });
  assert.equal(r.displayNamingConfidenceLevel, "high");
  assert.equal(r.displaySubtypeLabel, "มอลดาไวต์");
  assert.equal(r.displayMainEnergyLabel, "เร่งการเปลี่ยนแปลง");
});

test("resolveMoldaviteDisplayNaming: medium from Gemini confidence", () => {
  const r = resolveMoldaviteDisplayNaming({
    geminiSubtypeConfidence: 0.65,
    moldaviteDecisionSource: "gemini",
    detectionReason: "gemini_crystal_subtype",
  });
  assert.equal(r.displayNamingConfidenceLevel, "medium");
  assert.equal(r.displaySubtypeLabel, "หิน/คริสตัลโทนเขียว");
  assert.equal(r.displayMainEnergyLabel, "เร่งการเปลี่ยนแปลง");
});

test("resolveMoldaviteDisplayNaming: low uses same visible labels as medium (no Moldavite name)", () => {
  const r = resolveMoldaviteDisplayNaming({
    geminiSubtypeConfidence: 0.4,
    moldaviteDecisionSource: "gemini",
    detectionReason: "gemini_crystal_subtype",
  });
  assert.equal(r.displayNamingConfidenceLevel, "low");
  assert.equal(r.displaySubtypeLabel, "หิน/คริสตัลโทนเขียว");
  assert.equal(r.displayMainEnergyLabel, "เร่งการเปลี่ยนแปลง");
  assert.ok(!String(r.displaySubtypeLabel).includes("มอลดาไวต์"));
});

test("resolveEffectiveSubtypeConfidenceForNaming: heuristic literal → high tier", () => {
  const eff = resolveEffectiveSubtypeConfidenceForNaming({
    geminiSubtypeConfidence: null,
    moldaviteDecisionSource: "heuristic",
    detectionReason: "literal_moldavite_label",
  });
  assert.ok(eff >= 0.8);
});

test("resolveMoldaviteDisplayNaming: boundary 0.80 is high", () => {
  const r = resolveMoldaviteDisplayNaming({
    geminiSubtypeConfidence: 0.8,
    moldaviteDecisionSource: "gemini",
    detectionReason: "gemini_crystal_subtype",
  });
  assert.equal(r.displayNamingConfidenceLevel, "high");
});

test("resolveMoldaviteDisplayNaming: boundary 0.55 is medium", () => {
  const r = resolveMoldaviteDisplayNaming({
    geminiSubtypeConfidence: 0.55,
    moldaviteDecisionSource: "gemini",
    detectionReason: "gemini_crystal_subtype",
  });
  assert.equal(r.displayNamingConfidenceLevel, "medium");
});
