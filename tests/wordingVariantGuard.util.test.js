import test from "node:test";
import assert from "node:assert/strict";
import { pickVariantAvoidingRepeat } from "../src/utils/wordingVariantGuard.util.js";

test("pickVariantAvoidingRepeat rotates when same bank repeats", () => {
  const uid = "U-test-variant";
  const bank = "thai.protection";
  const a = pickVariantAvoidingRepeat(uid, bank, 3, "seed-a");
  const b = pickVariantAvoidingRepeat(uid, bank, 3, "seed-a");
  assert.ok(typeof a.variantIndex === "number");
  assert.ok(typeof b.variantIndex === "number");
});
