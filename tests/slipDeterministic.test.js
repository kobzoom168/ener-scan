import test from "node:test";
import assert from "node:assert/strict";
import {
  deterministicSlipPreCheck,
  getImageMetadata,
} from "../src/core/payments/slipCheck/slipDeterministic.js";

/** 1×1 PNG (valid) — we patch IHDR width/height for aspect tests */
const PNG_1X1_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test("deterministic: tiny buffer → too_small", () => {
  const buf = Buffer.alloc(800, 0xff);
  const r = deterministicSlipPreCheck(buf);
  assert.equal(r.kind, "too_small");
});

test("deterministic: tall PNG aspect → fast_reject_chat", () => {
  const core = Buffer.from(PNG_1X1_B64, "base64");
  core.writeUInt32BE(400, 16);
  core.writeUInt32BE(1000, 20);
  const buf = Buffer.concat([core, Buffer.alloc(2000, 0)]);
  const meta = getImageMetadata(buf);
  assert.equal(meta.width, 400);
  assert.equal(meta.height, 1000);
  assert.ok(meta.aspectRatio >= 2.35);
  const r = deterministicSlipPreCheck(buf);
  assert.equal(r.kind, "fast_reject_chat");
});

test("deterministic: 1x1 PNG padded → needs_vision", () => {
  const core = Buffer.from(PNG_1X1_B64, "base64");
  const buf = Buffer.concat([core, Buffer.alloc(2000, 0)]);
  const r = deterministicSlipPreCheck(buf);
  assert.equal(r.kind, "needs_vision");
});
