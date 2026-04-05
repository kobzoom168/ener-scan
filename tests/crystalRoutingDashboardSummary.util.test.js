import test from "node:test";
import assert from "node:assert/strict";
import { aggregateCrystalRoutingDashboardSummary } from "../src/utils/crystalRoutingDashboardSummary.util.js";
import { CRYSTAL_DASHBOARD_FIXTURE_ROWS } from "./fixtures/crystalRoutingDashboardRows.fixture.js";
import { buildCrystalRoutingWordingMetrics } from "../src/utils/crystalRoutingWordingMetrics.util.js";

test("aggregateCrystalRoutingDashboardSummary: fixture counts aligned / soft / hard / n/a", () => {
  const s = aggregateCrystalRoutingDashboardSummary(CRYSTAL_DASHBOARD_FIXTURE_ROWS);
  assert.equal(s.rowCount, 7);
  assert.equal(s.totalCrystalRoutingCases, 6);
  assert.equal(s.notApplicableCount, 1);
  assert.equal(s.alignedCount, 2);
  assert.equal(s.softMismatchCount, 2);
  assert.equal(s.hardMismatchCount, 2);
});

test("aggregateCrystalRoutingDashboardSummary: non-crystal rows do not affect crystal rates", () => {
  const crystalOnly = CRYSTAL_DASHBOARD_FIXTURE_ROWS.filter((r) => r.isCrystalRoutingCase);
  const withNoise = [
    ...crystalOnly,
    {
      routingWordingAlignmentStatus: "not_applicable",
      routingWordingMismatchType: "not_applicable",
      isCrystalRoutingCase: false,
      routingObjectFamily: "thai_amulet",
      visibleWordingCrystalSpecific: false,
      visibleWordingDecisionSource: "db_family",
      crystalRoutingRuleId: null,
    },
    {
      routingWordingAlignmentStatus: "not_applicable",
      isCrystalRoutingCase: false,
      objectFamily: "thai_amulet",
    },
  ];
  const a = aggregateCrystalRoutingDashboardSummary(crystalOnly);
  const b = aggregateCrystalRoutingDashboardSummary(withNoise);
  assert.equal(a.totalCrystalRoutingCases, b.totalCrystalRoutingCases);
  assert.equal(a.alignedCount, b.alignedCount);
  assert.equal(a.crystalSpecificSurfaceRate, b.crystalSpecificSurfaceRate);
});

test("aggregateCrystalRoutingDashboardSummary: crystal-specific and generic-fallback rates", () => {
  const s = aggregateCrystalRoutingDashboardSummary(CRYSTAL_DASHBOARD_FIXTURE_ROWS);
  const crystal = CRYSTAL_DASHBOARD_FIXTURE_ROWS.filter((r) => r.isCrystalRoutingCase);
  const specific = crystal.filter((r) => r.visibleWordingCrystalSpecific === true).length;
  const generic = crystal.filter(
    (r) =>
      r.visibleWordingDecisionSource === "code_bank_crystal_first" ||
      r.visibleWordingDecisionSource === "code_bank_family",
  ).length;
  const heavy = crystal.filter(
    (r) => r.isFallbackHeavy === true || (r.visibleWordingFallbackLevel != null && Number(r.visibleWordingFallbackLevel) >= 2),
  ).length;
  assert.equal(s.crystalSpecificSurfaceCount, specific);
  assert.equal(s.crystalSpecificSurfaceRate, specific / crystal.length);
  assert.equal(s.genericFallbackCount, generic);
  assert.equal(s.genericFallbackRate, generic / crystal.length);
  assert.equal(s.fallbackHeavyCount, heavy);
  assert.equal(s.fallbackHeavyRate, heavy / crystal.length);
});

test("aggregateCrystalRoutingDashboardSummary: topMismatchTypes and topRoutingRuleIds sort stable", () => {
  const s = aggregateCrystalRoutingDashboardSummary(CRYSTAL_DASHBOARD_FIXTURE_ROWS);
  const types = s.topMismatchTypes.map((x) => x.mismatchType);
  const sortedDup = [...types].sort((a, b) => a.localeCompare(b));
  assert.deepEqual(types, sortedDup, "tie-break alphabetical by mismatchType");
  const rules = s.topRoutingRuleIds.map((x) => x.ruleId);
  const sortedRules = [...rules].sort((a, b) => a.localeCompare(b));
  assert.deepEqual(rules, sortedRules, "tie-break alphabetical by ruleId");
  assert.ok(s.topRoutingRuleIds.every((x) => x.count === 1));
});

test("aggregateCrystalRoutingDashboardSummary: weakProtectDefaultRate", () => {
  const s = aggregateCrystalRoutingDashboardSummary(CRYSTAL_DASHBOARD_FIXTURE_ROWS);
  assert.equal(s.weakProtectDefaultCount, 1);
  assert.equal(s.weakProtectDefaultRate, 1 / 6);
});

test("aggregateCrystalRoutingDashboardSummary: derives crystal case from objectFamily when flag omitted", () => {
  const rows = [
    {
      routingWordingAlignmentStatus: "aligned",
      routingWordingMismatchType: "none",
      objectFamily: "crystal",
      visibleWordingCrystalSpecific: true,
      visibleWordingDecisionSource: "db_crystal",
      crystalRoutingRuleId: "crystal_rg_money_work",
    },
    {
      routingWordingAlignmentStatus: "not_applicable",
      routingWordingMismatchType: "not_applicable",
      objectFamily: "thai_amulet",
      visibleWordingCrystalSpecific: false,
    },
  ];
  const s = aggregateCrystalRoutingDashboardSummary(rows);
  assert.equal(s.totalCrystalRoutingCases, 1);
  assert.equal(s.notApplicableCount, 1);
});

test("aggregateCrystalRoutingDashboardSummary: metrics-built rows round-trip counts", () => {
  const inputs = [
    {
      objectFamily: "crystal",
      energyCategoryCode: "confidence",
      crystalRoutingRuleId: "crystal_rg_weak_protect_default",
      crystalRoutingStrategy: "weak_protect",
      protectSignalStrength: "weak",
      visibleWordingDecisionSource: "db_crystal",
      visibleWordingObjectFamilyUsed: "crystal",
      visibleWordingCrystalSpecific: true,
      visibleWordingCategoryUsed: "confidence",
      visibleWordingFallbackLevel: 0,
    },
    {
      objectFamily: "thai_amulet",
      energyCategoryCode: "protection",
      crystalRoutingRuleId: null,
      visibleWordingDecisionSource: "db_family",
      visibleWordingObjectFamilyUsed: "thai_amulet",
      visibleWordingCrystalSpecific: false,
      visibleWordingCategoryUsed: "protection",
      visibleWordingFallbackLevel: 0,
    },
  ];
  const metricsRows = inputs.map((i) => buildCrystalRoutingWordingMetrics(i));
  const s = aggregateCrystalRoutingDashboardSummary(metricsRows);
  assert.equal(s.totalCrystalRoutingCases, 1);
  assert.equal(s.alignedCount, 1);
  assert.equal(s.notApplicableCount, 1);
});
