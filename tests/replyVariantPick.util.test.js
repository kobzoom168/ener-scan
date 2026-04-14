import test from "node:test";
import assert from "node:assert/strict";
import {
  pickReplyVariant,
  __resetReplyVariantPickTestState,
} from "../src/utils/replyVariantPick.util.js";
import { paymentSupportVariants } from "../src/config/paymentWordingPools.th.js";

test("pickReplyVariant: avoids repeating last choice for same user+pool when pool large enough", () => {
  __resetReplyVariantPickTestState();
  const uid = "U_pick_test";
  const poolKey = "test_pool_repeat";
  const pool = ["a", "b", "c", "d", "e"];
  const first = pickReplyVariant(uid, poolKey, pool, 3);
  const second = pickReplyVariant(uid, poolKey, pool, 3);
  assert.notEqual(first, second);
});

test("pickReplyVariant: small pool falls back without throwing", () => {
  __resetReplyVariantPickTestState();
  const v = pickReplyVariant("u1", "tiny", ["only"], 3);
  assert.equal(v, "only");
});

test("paymentSupportVariants has 30 entries for pool coverage", () => {
  assert.equal(paymentSupportVariants.length, 30);
});
