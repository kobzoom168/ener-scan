import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildVisibleWordingTelemetryCorrelation,
  buildVisibleWordingTelemetryFields,
} from "../src/utils/visibleWordingTelemetry.util.js";

test("buildVisibleWordingTelemetryFields: stable shape for db_crystal", () => {
  const out = buildVisibleWordingTelemetryFields({
    visibleWordingDecisionSource: "db_crystal",
    visibleWordingObjectFamilyUsed: "crystal",
    visibleWordingCrystalSpecific: true,
    visibleWordingCategoryUsed: "protection",
    visibleWordingPresentationAngle: "ground",
    visibleWordingFallbackLevel: 0,
    visibleWordingReason: "db_crystal_only_rows",
  });
  assert.deepEqual(out.visibleWordingDiagnostics, {
    visibleWordingDecisionSource: "db_crystal",
    visibleWordingObjectFamilyUsed: "crystal",
    visibleWordingCrystalSpecific: true,
    visibleWordingCategoryUsed: "protection",
    visibleWordingPresentationAngle: "ground",
    visibleWordingFallbackLevel: 0,
    visibleWordingReason: "db_crystal_only_rows",
  });
});

test("buildVisibleWordingTelemetryFields: code_bank fallback nulls and boolean", () => {
  const out = buildVisibleWordingTelemetryFields({
    visibleWordingDecisionSource: "code_bank_crystal_first",
    visibleWordingObjectFamilyUsed: "crystal",
    visibleWordingCrystalSpecific: true,
    visibleWordingCategoryUsed: "confidence",
    visibleWordingReason: "crystal_no_db_surface",
  });
  assert.equal(out.visibleWordingDiagnostics.visibleWordingCrystalSpecific, true);
  assert.equal(out.visibleWordingDiagnostics.visibleWordingPresentationAngle, null);
  assert.equal(out.visibleWordingDiagnostics.visibleWordingFallbackLevel, null);
});

test("buildVisibleWordingTelemetryCorrelation: crystal + rule + crystal wording → ok true", () => {
  const c = buildVisibleWordingTelemetryCorrelation({
    energyCategoryCode: "money_work",
    visibleWordingDiag: {
      visibleWordingCategoryUsed: "money_work",
      visibleWordingCrystalSpecific: true,
    },
    crystalRoutingRuleId: "crystal_rg_money_work",
    objectFamilyNormalized: "crystal",
  });
  assert.equal(c.wordingCategoryMatchesRoutingCategory, true);
  assert.equal(c.crystalRoutingVsWordingCrystalFlagOk, true);
});

test("buildVisibleWordingTelemetryCorrelation: thai — crystal flag check null", () => {
  const c = buildVisibleWordingTelemetryCorrelation({
    energyCategoryCode: "protection",
    visibleWordingDiag: {
      visibleWordingCategoryUsed: "protection",
      visibleWordingCrystalSpecific: false,
    },
    crystalRoutingRuleId: undefined,
    objectFamilyNormalized: "thai_amulet",
  });
  assert.equal(c.wordingCategoryMatchesRoutingCategory, true);
  assert.equal(c.crystalRoutingVsWordingCrystalFlagOk, null);
});

test("buildVisibleWordingTelemetryCorrelation: crystal rule but wording not crystal-specific → false", () => {
  const c = buildVisibleWordingTelemetryCorrelation({
    energyCategoryCode: "confidence",
    visibleWordingDiag: {
      visibleWordingCategoryUsed: "confidence",
      visibleWordingCrystalSpecific: false,
    },
    crystalRoutingRuleId: "crystal_rg_weak_protect_default",
    objectFamilyNormalized: "crystal",
  });
  assert.equal(c.crystalRoutingVsWordingCrystalFlagOk, false);
});
