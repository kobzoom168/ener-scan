import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compareShadowLabels,
  shadowComparableFor,
  runObjectCheckLowShadow,
} from "../src/services/objectCheck.service.js";

test("strict ใช้ production normalizer (คำพ้อง/ภาษาไทยด้วย) ไม่ใช่ first-word", () => {
  const cmp = compareShadowLabels("strict", "Multiple objects detected", "ภาพนี้มีหลายชิ้น");
  assert.equal(cmp.full.label, cmp.low.label);
  assert.equal(cmp.normalizedMatch, true);
});

test("structured pass (crystal_family/bracelet_form): formatting ต่างแต่ outcome เดียวกัน = match", () => {
  const a = '{"familyLabel":"crystal","familyConfidence":0.9,"primaryObjectOwner":"bracelet","hasCharmAttachment":false}';
  const b = '```json\n{ "familyLabel" : "crystal", "familyConfidence": 0.92, "primaryObjectOwner": "bracelet" }\n```';
  const cmp = compareShadowLabels("crystal_family", a, b);
  // 0.9 กับ 0.92 อยู่ bucket "high" เดียวกัน → match แม้ format/ค่าเป๊ะต่าง
  assert.equal(cmp.normalizedMatch, true);
  assert.equal(cmp.full.familyLabel, "crystal");

  const f1 = '{"formFactor":"bracelet","formConfidence":0.7,"isSingleWearableObject":true,"hasBeadLoop":true,"isClosedLoop":true,"primaryOwner":"bracelet"}';
  const f2 = '{"formFactor":"necklace","formConfidence":0.7,"isSingleWearableObject":true,"hasBeadLoop":true,"isClosedLoop":true,"primaryOwner":"bracelet"}';
  assert.equal(compareShadowLabels("bracelet_form", f1, f1).normalizedMatch, true);
  assert.equal(compareShadowLabels("bracelet_form", f1, f2).normalizedMatch, false);
});

test("permissive: เทียบ label+objectCount+family+confidence bucket ผ่าน production parse", () => {
  const full = '{"label":"single_supported","objectCount":1,"confidence":0.9,"supportedFamilyGuess":"thai_amulet"}';
  const lowSame = '```json\n{"label":"single_supported","objectCount":1,"confidence":0.87,"supportedFamilyGuess":"thai_amulet"}\n```';
  assert.equal(compareShadowLabels("permissive", full, lowSame).normalizedMatch, true);
  const c = shadowComparableFor("permissive", "junk not json");
  assert.equal(c.label, "inconclusive");
});

test("shadow success จบเร็ว ไม่ทิ้ง timer ค้าง (Codex: เทสต์เดิม 15.5s = timer leak)", async () => {
  process.env.OBJECT_CHECK_LOW_SHADOW_ENABLED = "true";
  const started = Date.now();
  const res = await runObjectCheckLowShadow({
    passType: "strict", instructionText: "x", imageBase64: "aGk=",
    mainPromise: Promise.resolve({ output_text: "supported" }),
    createFn: async () => ({ output_text: "supported" }),
    rand: 0,
  });
  assert.equal(res, "logged");
  assert.ok(Date.now() - started < 2000, "ต้องจบเร็ว ไม่รอ timer 15s");
  delete process.env.OBJECT_CHECK_LOW_SHADOW_ENABLED;
});

test("main ค้างจริง (unresolved promise) → timeout คืน slot, call ถัดไปไม่ busy", async () => {
  process.env.OBJECT_CHECK_LOW_SHADOW_ENABLED = "true";
  const never = new Promise(() => {}); // main ที่ไม่มีวัน settle
  const res1 = await runObjectCheckLowShadow({
    passType: "strict", instructionText: "x", imageBase64: "aGk=",
    mainPromise: never,
    createFn: async () => ({ output_text: "supported" }),
    rand: 0,
    timeoutMs: 30, // inject สั้นเฉพาะเทสต์ (Codex: ต้องพิสูจน์ด้วย hang จริง)
  });
  assert.equal(res1, "error"); // timeout ครอบทั้งก้อน
  // slot ต้องคืนแล้ว: ยิงต่อได้ทันที ไม่ busy
  const res2 = await runObjectCheckLowShadow({
    passType: "strict", instructionText: "x", imageBase64: "aGk=",
    mainPromise: Promise.resolve({ output_text: "supported" }),
    createFn: async () => ({ output_text: "supported" }),
    rand: 0,
  });
  assert.equal(res2, "logged");
  // main reject เร็ว = อีกเคส: catch เป็น null ยัง logged
  const res3 = await runObjectCheckLowShadow({
    passType: "strict", instructionText: "x", imageBase64: "aGk=",
    mainPromise: Promise.reject(new Error("main died")),
    createFn: async () => ({ output_text: "supported" }),
    rand: 0,
  });
  assert.equal(res3, "logged");
  delete process.env.OBJECT_CHECK_LOW_SHADOW_ENABLED;
});

test("flag ปิด = disabled · sampling ตัด = sampled_out · shadow พังไม่กระทบ main", async () => {
  delete process.env.OBJECT_CHECK_LOW_SHADOW_ENABLED;
  assert.equal(
    await runObjectCheckLowShadow({
      passType: "strict", instructionText: "x", imageBase64: "aGk=",
      mainPromise: Promise.resolve({ output_text: "supported" }),
    }),
    "disabled",
  );
  process.env.OBJECT_CHECK_LOW_SHADOW_ENABLED = "true";
  assert.equal(
    await runObjectCheckLowShadow({
      passType: "strict", instructionText: "x", imageBase64: "aGk=",
      mainPromise: Promise.resolve({ output_text: "supported" }),
      rand: 0.99,
    }),
    "sampled_out",
  );
  const main = Promise.resolve({ output_text: "supported" });
  assert.equal(
    await runObjectCheckLowShadow({
      passType: "strict", instructionText: "x", imageBase64: "aGk=",
      mainPromise: main,
      createFn: async () => { throw new Error("boom"); },
      rand: 0,
    }),
    "error",
  );
  assert.equal((await main).output_text, "supported");
  delete process.env.OBJECT_CHECK_LOW_SHADOW_ENABLED;
});
