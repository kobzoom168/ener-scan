import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveSpeakerRole,
  ajarnMoneyRisk,
  SAFE_ADMIN_MONEY_FALLBACK,
} from "../src/core/conversation/personaRole.util.js";

test("resolveSpeakerRole: แยก admin/ajarn/mixed/unknown ถูก", () => {
  assert.equal(resolveSpeakerRole("ผมเช็กให้แปปนึงครับ"), "admin");
  assert.equal(resolveSpeakerRole("อาจารย์มองว่าชิ้นนี้เด่นเมตตาครับ"), "ajarn");
  assert.equal(resolveSpeakerRole("📿 อาจารย์: ชิ้นนี้เด่นบารมี"), "ajarn");
  assert.equal(
    resolveSpeakerRole("อาจารย์มองว่าเด่นเมตตาครับ\nส่วนเรื่องค่าครู ผมแจ้งได้เลยครับ"),
    "mixed",
  );
  assert.equal(resolveSpeakerRole("ชิ้นนี้เด่นด้านคุ้มครองครับ"), "unknown");
});

test("ajarnMoneyRisk: เงินโดยไม่มีเสียงแอดมิน = เสี่ยง / มีเสียงแอดมินกำกับ = ผ่าน", () => {
  // เสียงอาจารย์ล้วน + เงิน = block
  assert.equal(ajarnMoneyRisk("อาจารย์แนะนำว่าเปิดค่าครู 49 บาทดูต่อได้ครับ"), true);
  // ไม่มีผู้พูดชัด + เงิน = block (เงินต้องออกจากปากแอดมินเท่านั้น)
  assert.equal(ajarnMoneyRisk("ชิ้นนี้เด่นเมตตา ค่าครู 49 บาทเปิดดูลึกได้ครับ"), true);
  // แอดมินพูดเงิน = ถูกกติกา
  assert.equal(ajarnMoneyRisk("เรื่องค่าครู 49 บาท ผมดูแลให้เองครับ"), false);
  // ไม่มีเงินเลย = ผ่านเสมอ
  assert.equal(ajarnMoneyRisk("อาจารย์มองว่าเหมาะกับวันเจรจาครับ"), false);
});

test("fallback ปลอดภัย: เสียงแอดมิน ไม่มีตัวเลข ไม่เสี่ยงเอง", () => {
  assert.equal(ajarnMoneyRisk(SAFE_ADMIN_MONEY_FALLBACK), false);
  assert.equal(resolveSpeakerRole(SAFE_ADMIN_MONEY_FALLBACK), "admin");
});
