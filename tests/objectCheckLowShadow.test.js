import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compareShadowLabels,
  normalizeShadowLabel,
  runObjectCheckLowShadow,
} from "../src/services/objectCheck.service.js";

test("normalize strict: raw ต่างช่องว่าง/ตัวพิมพ์ = label เดียวกัน (Codex: ห้ามเทียบ raw)", () => {
  const cmp = compareShadowLabels("strict", "  Supported \n", "supported");
  assert.equal(cmp.fullLabel, "supported");
  assert.equal(cmp.normalizedMatch, true);
  const diff = compareShadowLabels("strict", "supported", "unsupported");
  assert.equal(diff.normalizedMatch, false);
});

test("normalize permissive: parse JSON contract แบบ production (fence/format ไม่ทำ mismatch)", () => {
  const cmp = compareShadowLabels(
    "permissive",
    '{"label":"single_supported","confidence":0.9}',
    '```json\n{ "label" : "single_supported" }\n```',
  );
  assert.equal(cmp.fullLabel, "single_supported");
  assert.equal(cmp.lowLabel, "single_supported");
  assert.equal(cmp.normalizedMatch, true);
  // JSON พัง = inconclusive ตาม production (ไม่ใช่ hard reject)
  assert.equal(normalizeShadowLabel("permissive", "not json at all"), "inconclusive");
});

test("shadow: flag ปิด = disabled / sampling ตัด = sampled_out / createFn พัง ไม่กระทบ main", async () => {
  delete process.env.OBJECT_CHECK_LOW_SHADOW_ENABLED;
  const offRes = await runObjectCheckLowShadow({
    passType: "strict", instructionText: "x", imageBase64: "aGk=",
    mainPromise: Promise.resolve({ output_text: "supported" }),
  });
  assert.equal(offRes, "disabled");

  process.env.OBJECT_CHECK_LOW_SHADOW_ENABLED = "true";
  const sampledOut = await runObjectCheckLowShadow({
    passType: "strict", instructionText: "x", imageBase64: "aGk=",
    mainPromise: Promise.resolve({ output_text: "supported" }),
    rand: 0.99,
  });
  assert.equal(sampledOut, "sampled_out");

  // shadow createFn โยน error → คืน "error" เงียบ ๆ main ไม่โดนแตะ
  const main = Promise.resolve({ output_text: "supported" });
  const errRes = await runObjectCheckLowShadow({
    passType: "strict", instructionText: "x", imageBase64: "aGk=",
    mainPromise: main,
    createFn: async () => { throw new Error("boom"); },
    rand: 0,
  });
  assert.equal(errRes, "error");
  assert.equal((await main).output_text, "supported");

  // เส้นปกติ: เทียบผ่าน normalizer + logged
  const okRes = await runObjectCheckLowShadow({
    passType: "permissive", instructionText: "x", imageBase64: "aGk=",
    mainPromise: Promise.resolve({ output_text: '{"label":"multiple"}' }),
    createFn: async () => ({ output_text: '{"label":"multiple"}' }),
    rand: 0,
  });
  assert.equal(okRes, "logged");
  delete process.env.OBJECT_CHECK_LOW_SHADOW_ENABLED;
});
