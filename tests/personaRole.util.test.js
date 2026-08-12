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

test("evaluateMoneyGuard สองชั้น (Codex รอบ 5): ผิดคนพูด / ผิดจังหวะ / ถูกทั้งคู่", async () => {
  const { evaluateMoneyGuard } = await import("../src/core/conversation/personaRole.util.js");
  const adminMoney = "ค่าครู 49 บาทครับ เดี๋ยวผมส่งวิธีโอนให้";
  // ลูกค้าถามเงิน + แอดมินพูด = ผ่าน
  assert.deepEqual(evaluateMoneyGuard(adminMoney, { userMoneyIntent: true }), { ok: true });
  // อยู่ paywall state + แอดมินพูด = ผ่าน (ระบบพามาถึงจุดจ่ายแล้ว)
  assert.deepEqual(evaluateMoneyGuard(adminMoney, { inPaymentState: true }), { ok: true });
  // ลูกค้าถามพลัง + แอดมินพูดเงินเอง = unsolicited block (ขายเองแม้เสียงถูก)
  assert.deepEqual(evaluateMoneyGuard(adminMoney, {}), { ok: false, reason: "unsolicited" });
  // ลูกค้าถามเงิน แต่เสียงไม่ใช่แอดมิน = wrong_speaker block
  assert.deepEqual(
    evaluateMoneyGuard("อาจารย์แนะนำค่าครู 49 บาทครับ", { userMoneyIntent: true }),
    { ok: false, reason: "wrong_speaker" },
  );
  // ไม่มีเงินเลย = ผ่านทุกบริบท
  assert.deepEqual(evaluateMoneyGuard("อาจารย์มองว่าเด่นเมตตาครับ", {}), { ok: true });
});

test("neutral fallback ต้องไม่สร้าง dangling handoff เอง (ไม่ match HANDOFF_RE)", async () => {
  const { NEUTRAL_RECOVERY_FALLBACK } = await import("../src/core/conversation/personaRole.util.js");
  const { HANDOFF_RE } = await import("../src/services/chatQualityDeterministic.util.js");
  assert.ok(!HANDOFF_RE.test(NEUTRAL_RECOVERY_FALLBACK));
  assert.ok(!/(บาท|ค่าครู|แพ็ก|สิทธิ์)/.test(NEUTRAL_RECOVERY_FALLBACK));
});

test("consumeOrchestratorOutcome (Codex รอบ 6): defer → payment route ถูกเรียก 1 ครั้ง แล้วปิด turn", async () => {
  const { consumeOrchestratorOutcome } = await import("../src/core/conversation/personaRole.util.js");
  let calls = 0;
  const res = await consumeOrchestratorOutcome(
    { handled: false, deferTo: "deterministic_payment" },
    { runDeterministicPayment: async () => { calls += 1; return true; } },
  );
  assert.equal(calls, 1);
  assert.equal(res.handled, true);
  assert.equal(res.via, "deferred_deterministic_payment");
  // payment route ตอบไม่ได้ → handled=false ให้ flow เดิมทำงานต่อ (ไม่เงียบใส่ลูกค้า)
  const res2 = await consumeOrchestratorOutcome(
    { handled: false, deferTo: "deterministic_payment" },
    { runDeterministicPayment: async () => false },
  );
  assert.equal(res2.handled, false);
  // ไม่มี defer → ผ่านค่าเดิมไม่แตะ
  const plain = { handled: true, mode: "active" };
  assert.equal(await consumeOrchestratorOutcome(plain, {}), plain);
  // ไม่มี consumer (caller เก่า) → ผ่านค่าเดิม
  const deferNoConsumer = { handled: false, deferTo: "deterministic_payment" };
  assert.equal(await consumeOrchestratorOutcome(deferNoConsumer, {}), deferNoConsumer);
});
