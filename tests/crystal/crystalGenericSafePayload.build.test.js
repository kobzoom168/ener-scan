import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCrystalGenericSafeV1Slice,
  CRYSTAL_GENERIC_SAFE_MODE,
} from "../../src/crystal/crystalGenericSafePayload.build.js";

test("buildCrystalGenericSafeV1Slice: stable shape and mode", () => {
  const a = buildCrystalGenericSafeV1Slice({
    scanResultId: "sr_test_01",
    seedKey: "sr_test_01",
  });
  assert.equal(a.version, "1");
  assert.equal(a.mode, CRYSTAL_GENERIC_SAFE_MODE);
  assert.equal(a.flexSurface.mainEnergyShort, "หิน/คริสตัล");
  assert.equal(a.display.visibleMainLabelNeutral, "หิน/คริสตัล");
  assert.ok(String(a.display.htmlOpeningNeutral || "").length > 20);
  assert.equal(a.context?.scanResultIdPrefix, "sr_test_");
});

test("buildCrystalGenericSafeV1Slice: bullet pool is deterministic per seed", () => {
  const x = buildCrystalGenericSafeV1Slice({
    scanResultId: "a",
    seedKey: "fixed_seed_alpha",
  });
  const y = buildCrystalGenericSafeV1Slice({
    scanResultId: "a",
    seedKey: "fixed_seed_alpha",
  });
  assert.deepEqual(x.flexSurface.bullets, y.flexSurface.bullets);
});
