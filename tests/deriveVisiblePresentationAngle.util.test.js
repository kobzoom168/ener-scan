import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CRYSTAL_CONFIDENCE_PRESENTATION_ANGLES,
  deriveCrystalConfidencePresentationAngle,
  deriveVisiblePresentationAngleForDbHydrate,
} from "../src/utils/reports/deriveVisiblePresentationAngle.util.js";

test("deriveCrystalConfidencePresentationAngle is stable for the same seed", () => {
  assert.equal(
    deriveCrystalConfidencePresentationAngle("scan-abc-001"),
    deriveCrystalConfidencePresentationAngle("scan-abc-001"),
  );
});

test("deriveVisiblePresentationAngleForDbHydrate: empty for non-crystal", () => {
  assert.equal(
    deriveVisiblePresentationAngleForDbHydrate({
      categoryCode: "confidence",
      objectFamilyRaw: "thai_amulet",
      seed: "x",
    }),
    "",
  );
});

test("deriveVisiblePresentationAngleForDbHydrate: empty for crystal non-confidence", () => {
  assert.equal(
    deriveVisiblePresentationAngleForDbHydrate({
      categoryCode: "protection",
      objectFamilyRaw: "crystal",
      seed: "y",
    }),
    "",
  );
});

test("deriveVisiblePresentationAngleForDbHydrate: crystal+confidence returns allowlist member", () => {
  const a = deriveVisiblePresentationAngleForDbHydrate({
    categoryCode: "confidence",
    objectFamilyRaw: "crystal",
    seed: "seed-one",
  });
  assert.ok(CRYSTAL_CONFIDENCE_PRESENTATION_ANGLES.includes(a));
});

test("crystal confidence angles: multiple seeds produce at least two distinct angles", () => {
  const angles = new Set();
  for (let i = 0; i < 40; i++) {
    angles.add(
      deriveCrystalConfidencePresentationAngle(`seed-${i}-crystal-conf`),
    );
  }
  assert.ok(angles.size >= 2, `expected diversity, got ${angles.size}`);
});
