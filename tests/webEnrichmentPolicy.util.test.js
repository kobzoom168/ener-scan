import test from "node:test";
import assert from "node:assert/strict";
import {
  shouldRunWebEnrichment,
  shouldSkipEnrichmentDueToStrongSignals,
  isEnrichableObjectFamily,
} from "../src/utils/webEnrichmentPolicy.util.js";
import { env } from "../src/config/env.js";

test("isEnrichableObjectFamily — crystal and generic", () => {
  assert.equal(isEnrichableObjectFamily("crystal"), true);
  assert.equal(isEnrichableObjectFamily("generic"), true);
  assert.equal(isEnrichableObjectFamily("global_symbol"), false);
});

test("shouldSkipEnrichmentDueToStrongSignals — generic never skips on strong guess alone", () => {
  const skip = shouldSkipEnrichmentDueToStrongSignals({
    objectFamily: "generic",
    supportedFamilyGuess: "thai_amulet",
    pipelineObjectCategory: "พระเครื่องรุ่นทดสอบยาวพอ",
    mainEnergyLine: "เมตตา",
    resultText: "x".repeat(800),
  });
  assert.equal(skip, false);
});

test("shouldSkipEnrichmentDueToStrongSignals — crystal without tags does not skip", () => {
  const skip = shouldSkipEnrichmentDueToStrongSignals({
    objectFamily: "crystal",
    supportedFamilyGuess: "crystal",
    pipelineObjectCategory: "คริสตัลควอตซ์ใส",
    mainEnergyLine: "เงินงาน",
    resultText: "x".repeat(800),
  });
  assert.equal(skip, false);
});

test("shouldRunWebEnrichment — disabled when env off", () => {
  const prev = env.WEB_ENRICHMENT_ENABLED;
  env.WEB_ENRICHMENT_ENABLED = false;
  const r = shouldRunWebEnrichment({
    objectCheckResult: "single_supported",
    objectFamily: "crystal",
    workerElapsedMs: 100,
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "disabled");
  env.WEB_ENRICHMENT_ENABLED = prev;
});
