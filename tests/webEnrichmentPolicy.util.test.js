import test from "node:test";
import assert from "node:assert/strict";
import {
  shouldRunWebEnrichment,
  decideWebEnrichmentFetch,
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
  assert.equal(r.decisiveReason, "disabled_by_env");
  env.WEB_ENRICHMENT_ENABLED = prev;
});

test("decideWebEnrichmentFetch — soft headroom overrides tight elapsed cap after deep scan", () => {
  const prevEn = env.WEB_ENRICHMENT_ENABLED;
  const prevCap = env.WEB_ENRICHMENT_MAX_WORKER_ELAPSED_MS;
  const prevBudget = env.WEB_ENRICHMENT_ESTIMATED_JOB_BUDGET_MS;
  const prevMinRem = env.WEB_ENRICHMENT_MIN_REMAINING_MS;
  const prevOverride = env.WEB_ENRICHMENT_ELAPSED_CAP_OVERRIDE_MIN_REMAINING_MS;
  env.WEB_ENRICHMENT_ENABLED = true;
  env.WEB_ENRICHMENT_MAX_WORKER_ELAPSED_MS = 12_000;
  env.WEB_ENRICHMENT_ESTIMATED_JOB_BUDGET_MS = 180_000;
  env.WEB_ENRICHMENT_MIN_REMAINING_MS = 2500;
  env.WEB_ENRICHMENT_ELAPSED_CAP_OVERRIDE_MIN_REMAINING_MS = 45_000;
  const d = decideWebEnrichmentFetch({
    objectCheckResult: "single_supported",
    objectFamily: "crystal",
    workerElapsedMs: 25_000,
  });
  assert.equal(d.allowFetch, true);
  assert.equal(d.decisiveReason, "elapsed_cap_soft_headroom_override");
  env.WEB_ENRICHMENT_ENABLED = prevEn;
  env.WEB_ENRICHMENT_MAX_WORKER_ELAPSED_MS = prevCap;
  env.WEB_ENRICHMENT_ESTIMATED_JOB_BUDGET_MS = prevBudget;
  env.WEB_ENRICHMENT_MIN_REMAINING_MS = prevMinRem;
  env.WEB_ENRICHMENT_ELAPSED_CAP_OVERRIDE_MIN_REMAINING_MS = prevOverride;
});
