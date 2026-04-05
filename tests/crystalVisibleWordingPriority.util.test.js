import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveCrystalVisibleWordingPriority } from "../src/utils/crystalVisibleWordingPriority.util.js";

test("visible wording: crystal + DB crystal_only → db_crystal", () => {
  const r = resolveCrystalVisibleWordingPriority({
    objectFamilyNormalized: "crystal",
    energyCategoryCode: "protection",
    dbSurfaceOk: true,
    dbRowSource: "crystal_only",
    categoryUsedForSurface: "protection",
    presentationAngleId: "shield_stone",
    dbWordingFallbackLevel: 0,
  });
  assert.equal(r.visibleWordingDecisionSource, "db_crystal");
  assert.equal(r.visibleWordingCrystalSpecific, true);
  assert.equal(r.visibleWordingObjectFamilyUsed, "crystal");
  assert.equal(r.visibleWordingCategoryUsed, "protection");
  assert.equal(r.visibleWordingPresentationAngle, "shield_stone");
  assert.equal(r.visibleWordingFallbackLevel, 0);
  assert.match(r.visibleWordingReason, /^db_crystal/);
});

test("visible wording: crystal + spiritual retry rowSource → db_crystal", () => {
  const r = resolveCrystalVisibleWordingPriority({
    objectFamilyNormalized: "crystal",
    energyCategoryCode: "spiritual_growth",
    dbSurfaceOk: true,
    dbRowSource: "crystal_spiritual_growth_retry",
    categoryUsedForSurface: "spiritual_growth",
    presentationAngleId: null,
    dbWordingFallbackLevel: 1,
  });
  assert.equal(r.visibleWordingDecisionSource, "db_crystal");
  assert.equal(r.visibleWordingReason, "db_crystal_spiritual_growth_retry");
});

test("visible wording: crystal + no DB surface → code_bank_crystal_first", () => {
  const r = resolveCrystalVisibleWordingPriority({
    objectFamilyNormalized: "crystal",
    energyCategoryCode: "confidence",
    dbSurfaceOk: false,
    dbRowSource: null,
    categoryUsedForSurface: "confidence",
    presentationAngleId: null,
    dbWordingFallbackLevel: null,
  });
  assert.equal(r.visibleWordingDecisionSource, "code_bank_crystal_first");
  assert.equal(r.visibleWordingCrystalSpecific, true);
  assert.equal(r.visibleWordingReason, "crystal_no_db_surface");
});

test("visible wording: crystal + db ok but unusable bundle (simulated) → code_bank_crystal_first", () => {
  const r = resolveCrystalVisibleWordingPriority({
    objectFamilyNormalized: "crystal",
    energyCategoryCode: "luck_fortune",
    dbSurfaceOk: true,
    dbRowSource: "family_plus_all",
    categoryUsedForSurface: "luck_fortune",
    presentationAngleId: null,
    dbWordingFallbackLevel: null,
  });
  assert.equal(r.visibleWordingDecisionSource, "code_bank_crystal_first");
  assert.equal(r.visibleWordingReason, "crystal_db_bundle_not_usable");
});

test("visible wording: thai_amulet + DB → db_family, not crystal-specific", () => {
  const r = resolveCrystalVisibleWordingPriority({
    objectFamilyNormalized: "thai_amulet",
    energyCategoryCode: "protection",
    dbSurfaceOk: true,
    dbRowSource: "family_plus_all",
    categoryUsedForSurface: "protection",
    presentationAngleId: "amulet_classic",
    dbWordingFallbackLevel: 0,
  });
  assert.equal(r.visibleWordingDecisionSource, "db_family");
  assert.equal(r.visibleWordingCrystalSpecific, false);
  assert.equal(r.visibleWordingReason, "non_crystal_db_bundle");
});

test("visible wording: thai_amulet + no DB → code_bank_family", () => {
  const r = resolveCrystalVisibleWordingPriority({
    objectFamilyNormalized: "thai_amulet",
    energyCategoryCode: "confidence",
    dbSurfaceOk: false,
    dbRowSource: null,
    categoryUsedForSurface: "confidence",
    presentationAngleId: null,
    dbWordingFallbackLevel: null,
  });
  assert.equal(r.visibleWordingDecisionSource, "code_bank_family");
  assert.equal(r.visibleWordingCrystalSpecific, false);
});

test("deriveReportWording crystal path unchanged: stone-flavored protection (regression)", async () => {
  const { deriveReportWordingFromParsed } = await import(
    "../src/services/reports/reportWording.derive.js"
  );
  const parsed = {
    mainEnergy: "พลังปกป้องและความมั่นคง",
    overview: "-",
    fitReason: "-",
    suitable: [],
    notStrong: "-",
    supportTopics: [],
  };
  const w = deriveReportWordingFromParsed(parsed, {
    seed: "crystal-priority-regression",
    objectFamily: "crystal",
  });
  assert.ok(
    /หิน|พลังหิน|คริสตัล/.test(w.heroNaming),
    "crystal objectFamily should still prefer stone-flavored hero naming",
  );
});
