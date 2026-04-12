import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateCrystalBraceletEligibilityFromStructuredChecks,
} from "../../src/services/objectCheck.service.js";

const fam = (overrides = {}) => ({
  familyLabel: "crystal",
  familyConfidence: 0.9,
  primaryObjectOwner: "bracelet",
  hasCharmAttachment: false,
  reason: "ok",
  ...overrides,
});

const form = (overrides = {}) => ({
  formFactor: "bracelet",
  formConfidence: 0.9,
  isSingleWearableObject: true,
  hasBeadLoop: true,
  isClosedLoop: true,
  primaryOwner: "bracelet",
  reason: "ok",
  ...overrides,
});

const base = {
  baseGateResult: "single_supported",
  familyMin: 0.8,
  formMin: 0.8,
  strictPassEnabled: true,
};

test("evaluateCrystalBraceletEligibility: success when all gates pass", () => {
  const r = evaluateCrystalBraceletEligibilityFromStructuredChecks({
    ...base,
    familyCheck: fam(),
    formCheck: form(),
  });
  assert.equal(r.eligible, true);
  assert.equal(r.status, "allowed");
  assert.equal(r.objectFamilyTruth, "crystal");
  assert.equal(r.shapeFamilyTruth, "bracelet");
  assert.equal(r.shapeFamilyForcedToBracelet, true);
});

test("evaluateCrystalBraceletEligibility: sacred_amulet family => not_crystal", () => {
  const r = evaluateCrystalBraceletEligibilityFromStructuredChecks({
    ...base,
    familyCheck: fam({ familyLabel: "sacred_amulet", familyConfidence: 0.95 }),
    formCheck: form(),
  });
  assert.equal(r.eligible, false);
  assert.equal(r.status, "not_crystal");
  assert.equal(r.shapeFamilyTruth, null);
});

test("evaluateCrystalBraceletEligibility: form unknown => not_bracelet", () => {
  const r = evaluateCrystalBraceletEligibilityFromStructuredChecks({
    ...base,
    familyCheck: fam(),
    formCheck: form({ formFactor: "unknown", formConfidence: 0.9 }),
  });
  assert.equal(r.eligible, false);
  assert.equal(r.status, "not_bracelet");
});

test("evaluateCrystalBraceletEligibility: low family confidence => inconclusive", () => {
  const r = evaluateCrystalBraceletEligibilityFromStructuredChecks({
    ...base,
    familyCheck: fam({ familyConfidence: 0.5 }),
    formCheck: form(),
  });
  assert.equal(r.eligible, false);
  assert.equal(r.status, "inconclusive");
});

test("evaluateCrystalBraceletEligibility: low form confidence => inconclusive", () => {
  const r = evaluateCrystalBraceletEligibilityFromStructuredChecks({
    ...base,
    familyCheck: fam(),
    formCheck: form({ formConfidence: 0.5 }),
  });
  assert.equal(r.eligible, false);
  assert.equal(r.status, "inconclusive");
});

test("evaluateCrystalBraceletEligibility: charm/takrud context but owners bracelet => eligible", () => {
  const r = evaluateCrystalBraceletEligibilityFromStructuredChecks({
    ...base,
    familyCheck: fam({
      primaryObjectOwner: "bracelet",
      hasCharmAttachment: true,
    }),
    formCheck: form({ primaryOwner: "bracelet" }),
  });
  assert.equal(r.eligible, true);
  assert.equal(r.status, "allowed");
});

test("evaluateCrystalBraceletEligibility: primaryObjectOwner amulet_like blocks", () => {
  const r = evaluateCrystalBraceletEligibilityFromStructuredChecks({
    ...base,
    familyCheck: fam({
      familyLabel: "crystal",
      primaryObjectOwner: "amulet_like",
      familyConfidence: 0.95,
    }),
    formCheck: form(),
  });
  assert.equal(r.eligible, false);
  assert.equal(r.status, "not_crystal");
});

test("evaluateCrystalBraceletEligibility: form primaryOwner attachment blocks", () => {
  const r = evaluateCrystalBraceletEligibilityFromStructuredChecks({
    ...base,
    familyCheck: fam(),
    formCheck: form({ primaryOwner: "attachment" }),
  });
  assert.equal(r.eligible, false);
  assert.equal(r.status, "not_bracelet");
});

test("evaluateCrystalBraceletEligibility: global gate not single_supported", () => {
  const r = evaluateCrystalBraceletEligibilityFromStructuredChecks({
    ...base,
    baseGateResult: "unsupported",
    familyCheck: fam(),
    formCheck: form(),
  });
  assert.equal(r.status, "global_reject");
  assert.equal(r.eligible, false);
});

test("evaluateCrystalBraceletEligibility: strict pass disabled => never eligible", () => {
  const r = evaluateCrystalBraceletEligibilityFromStructuredChecks({
    ...base,
    strictPassEnabled: false,
    familyCheck: fam(),
    formCheck: form(),
  });
  assert.equal(r.eligible, false);
  assert.equal(r.status, "inconclusive");
});
