import { test } from "node:test";
import assert from "node:assert/strict";
import { isPackageOpinionQuestion, buildPackageFactText } from "../src/services/lineWebhook/packageFactReply.util.js";
import { checkHardTone } from "../src/core/conversation/hardTone.util.js";

const offer = { packages: [
  { key: "p29", priceThb: 29, scanCount: 1, windowHours: 24 },
  { key: "p49", priceThb: 49, scanCount: 4, windowHours: 24 },
  { key: "p399", priceThb: 399, scanCount: 30, windowHours: 720 },
] };

test("แพ็กนี้ดีไหม ตอน idle → deterministic ข้อเท็จจริง AI=0 ไม่มี QR", () => {
  for (const t of ["แพ็กนี้ดีไหม", "โปรคุ้มไหม", "ค่าครู 49 เอาดีไหม"]) assert.equal(isPackageOpinionQuestion(t), true, t);
  for (const t of ["จ่าย 49", "มีโปรอะไรบ้าง", "พลังองค์นี้ดีไหม", "ดีไหม"]) assert.equal(isPackageOpinionQuestion(t), false, t);
  assert.deepEqual(buildPackageFactText(offer, null), { text: "แพ็กมี 29, 49 และ 399 บาท", via: "all_prices" });
  assert.deepEqual(buildPackageFactText(offer, "p49"), { text: "49 บาท 4 ครั้ง ใน 24 ชม.", via: "selected_package" });
  assert.deepEqual(buildPackageFactText(offer, "p399").text, "399 บาท 30 ครั้ง ใน 30 วัน");
  for (const k of [null, "p49", "p399"]) {
    const r = checkHardTone(buildPackageFactText(offer, k).text, { kind: "reply" });
    assert.ok(r.ok, `${k}: ${r.violations}`);
  }
});
