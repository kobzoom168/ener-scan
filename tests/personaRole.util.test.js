import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveSpeakerRole,
  ajarnMoneyRisk,
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


test("adversarial (Codex รอบ 4): mixed/unknown/ajarn + เงิน = block ทั้งหมด", async () => {
  const { ajarnMoneyRisk: risk } = await import("../src/core/conversation/personaRole.util.js");
  // mixed bubble (อาจารย์+แอดมินปนกัน) + เงิน = block
  assert.equal(risk("อาจารย์มองว่าเด่นเมตตาครับ ส่วนค่าครูผมแจ้งให้ครับ"), true);
  // unknown + เงิน = block
  assert.equal(risk("ชิ้นนี้เด่นเมตตา ค่าครู 49 บาทเปิดดูลึกได้ครับ"), true);
  // ajarn + เงิน = block
  assert.equal(risk("อาจารย์แนะนำว่าเปิดค่าครู 49 บาทดูต่อครับ"), true);
  // admin ล้วน + เงิน = ผ่าน (ตามกติกา resolvedRole === admin)
  assert.equal(risk("ค่าครู 49 บาทครับ เดี๋ยวผมส่งวิธีโอนให้"), false);
  // ⚠️ ข้อจำกัดที่รู้ (documented): "เส้นผม" ทำให้ resolve เป็น admin → เงินผ่านได้
  // แลกกับไม่บล็อกคำตอบแอดมินจริง — จะแม่นขึ้นเมื่อ router ใช้ route/intent เป็นหลัก
  assert.equal(risk("สระผมด้วยน้ำมนต์ แล้วค่าครู 49 บาทครับ"), false);
});

test("fallback ใหม่: neutral ไม่มีคำเงิน ไม่ชวนขาย", async () => {
  const { NEUTRAL_RECOVERY_FALLBACK, ajarnMoneyRisk: risk, USER_MONEY_INTENT_RE } =
    await import("../src/core/conversation/personaRole.util.js");
  assert.equal(risk(NEUTRAL_RECOVERY_FALLBACK), false);
  assert.ok(!/(บาท|ค่าครู|แพ็ก|สิทธิ์|ตัวเลือก)/.test(NEUTRAL_RECOVERY_FALLBACK));
  assert.ok(USER_MONEY_INTENT_RE.test("ค่าครูกี่บาทครับ"));
  assert.ok(!USER_MONEY_INTENT_RE.test("องค์นี้เหมาะกับงานไหม"));
});
