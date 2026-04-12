import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pipelineFamilyImpliesSacredAmulet,
  resolveSupportedLaneStrict,
} from "../src/utils/reports/supportedLaneStrict.util.js";

const geminiMoldaviteStrong = {
  mode: "ok",
  moldaviteLikely: true,
  subtypeConfidence: 0.95,
  crystalSubtype: "moldavite",
};

const geminiNotMoldavite = {
  mode: "ok",
  moldaviteLikely: false,
  subtypeConfidence: 0.9,
  crystalSubtype: "quartz",
};

test("pipelineFamilyImpliesSacredAmulet: thai_amulet and takrud", () => {
  assert.equal(pipelineFamilyImpliesSacredAmulet("thai_amulet"), true);
  assert.equal(pipelineFamilyImpliesSacredAmulet("takrud"), true);
  assert.equal(pipelineFamilyImpliesSacredAmulet("generic"), false);
  assert.equal(pipelineFamilyImpliesSacredAmulet("crystal"), false);
});

test("resolveSupportedLaneStrict: Moldavite proven (crystal + Gemini)", () => {
  const r = resolveSupportedLaneStrict({
    baseGateResult: "single_supported",
    catSig: { objectFamily: "crystal" },
    braceletEligibility: { eligible: false },
    geminiCrystalSubtypeResult: geminiMoldaviteStrong,
    resultText: "",
    dominantColorNormalized: null,
    pipelineObjectCategory: "คริสตัล",
    pipelineObjectCategorySource: "deep_scan",
    gptSubtypeInferenceText: "moldavite",
    scanResultIdPrefix: "abcd1234",
  });
  assert.equal(r.lane, "moldavite");
});

test("resolveSupportedLaneStrict: sacred_amulet from pipeline", () => {
  const r = resolveSupportedLaneStrict({
    baseGateResult: "single_supported",
    catSig: { objectFamily: "sacred_amulet" },
    braceletEligibility: { eligible: false },
    geminiCrystalSubtypeResult: null,
    resultText: "",
    dominantColorNormalized: null,
    pipelineObjectCategory: "พระเครื่อง",
    pipelineObjectCategorySource: "deep_scan",
    gptSubtypeInferenceText: "",
    scanResultIdPrefix: "abcd1234",
  });
  assert.equal(r.lane, "sacred_amulet");
});

test("resolveSupportedLaneStrict: crystal_bracelet when bracelet eligibility", () => {
  const r = resolveSupportedLaneStrict({
    baseGateResult: "single_supported",
    catSig: { objectFamily: "generic" },
    braceletEligibility: { eligible: true },
    geminiCrystalSubtypeResult: geminiNotMoldavite,
    resultText: "",
    dominantColorNormalized: null,
    pipelineObjectCategory: null,
    pipelineObjectCategorySource: "unspecified",
    gptSubtypeInferenceText: "",
    scanResultIdPrefix: "abcd1234",
  });
  assert.equal(r.lane, "crystal_bracelet");
});

test("resolveSupportedLaneStrict: crystal but not Moldavite and not bracelet => unsupported", () => {
  const r = resolveSupportedLaneStrict({
    baseGateResult: "single_supported",
    catSig: { objectFamily: "crystal" },
    braceletEligibility: { eligible: false },
    geminiCrystalSubtypeResult: geminiNotMoldavite,
    resultText: "ทั่วไป",
    dominantColorNormalized: null,
    pipelineObjectCategory: "คริสตัล",
    pipelineObjectCategorySource: "deep_scan",
    gptSubtypeInferenceText: "",
    scanResultIdPrefix: "abcd1234",
  });
  assert.equal(r.lane, "unsupported");
});

test("resolveSupportedLaneStrict: generic pipeline => unsupported", () => {
  const r = resolveSupportedLaneStrict({
    baseGateResult: "single_supported",
    catSig: { objectFamily: "generic" },
    braceletEligibility: { eligible: false },
    geminiCrystalSubtypeResult: null,
    resultText: "",
    dominantColorNormalized: null,
    pipelineObjectCategory: null,
    pipelineObjectCategorySource: "unspecified",
    gptSubtypeInferenceText: "",
    scanResultIdPrefix: "abcd1234",
  });
  assert.equal(r.lane, "unsupported");
});

test("resolveSupportedLaneStrict: global gate not single_supported", () => {
  const r = resolveSupportedLaneStrict({
    baseGateResult: "unsupported",
    catSig: { objectFamily: "sacred_amulet" },
    braceletEligibility: { eligible: true },
    geminiCrystalSubtypeResult: geminiMoldaviteStrong,
    resultText: "",
    dominantColorNormalized: null,
    pipelineObjectCategory: null,
    pipelineObjectCategorySource: "unspecified",
    gptSubtypeInferenceText: "",
    scanResultIdPrefix: "abcd1234",
  });
  assert.equal(r.lane, "unsupported");
});

test("resolveSupportedLaneStrict: bracelet eligible overrides sacred_amulet category", () => {
  const r = resolveSupportedLaneStrict({
    baseGateResult: "single_supported",
    catSig: { objectFamily: "sacred_amulet" },
    braceletEligibility: { eligible: true },
    geminiCrystalSubtypeResult: geminiNotMoldavite,
    resultText: "",
    dominantColorNormalized: null,
    pipelineObjectCategory: "พระเครื่อง",
    pipelineObjectCategorySource: "deep_scan",
    gptSubtypeInferenceText: "",
    scanResultIdPrefix: "abcd1234",
  });
  assert.equal(r.lane, "crystal_bracelet");
});
