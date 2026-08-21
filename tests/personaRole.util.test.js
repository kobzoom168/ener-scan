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

test("evaluateToneGuard: จับคำชม/ปลอบต้องห้าม (เคสจริง 13 ส.ค.) — ข้อความปกติผ่าน", async () => {
  const { evaluateToneGuard } = await import(
    "../src/core/conversation/personaRole.util.js"
  );
  // เคสจริงทั้งสองข้อความจากรายงาน 13 ส.ค.
  const praise = evaluateToneGuard(
    "ชิ้นที่เข้ากับคุณที่สุดได้ 87% กับคะแนน 7.5 แบบนี้ก็ถือว่าใช้ได้ดีแล้วครับ ไม่ต้องกังวล",
  );
  assert.equal(praise.ok, false);
  assert.equal(praise.reason, "praise_comfort");
  const comfort = evaluateToneGuard("ครับ หาคนละสายไปเรื่อย ๆ เดี๋ยวก็เจอชิ้นที่ใช่เอง");
  assert.equal(comfort.ok, false);
  assert.equal(evaluateToneGuard("ถือว่าดีครับ").ok, false);
  assert.equal(evaluateToneGuard("สบายใจได้ครับ").ok, false);
  // แบบที่ต้องการ: ตัวเลข + ตำแหน่งบนเกณฑ์ + ขั้นถัดไป — ต้องผ่าน
  assert.equal(
    evaluateToneGuard(
      "คะแนน 7.5 อยู่ระดับกลางค่อนดีของเกณฑ์ครับ ถ้าอยากได้ด้านเมตตาสูงกว่านี้ ลองสแกนชิ้นสายเมตตาเทียบดู",
    ).ok,
    true,
  );
});

test("tone fail-closed (Codex รอบ 3): sanitizer ได้ไทยอ่านรู้เรื่อง — ล็อก exact output เคสจริง", async () => {
  const { resolveToneGuardedText, sanitizePraiseComfort, PRAISE_COMFORT_RE, NEUTRAL_RECOVERY_FALLBACK } =
    await import("../src/core/conversation/personaRole.util.js");
  const blocked =
    "ครับ คะแนน 7.5 กับ 87% แบบนี้ก็ถือว่าใช้ได้ดีแล้วครับ ไม่ต้องกังวล";

  // retry ผ่าน → ใช้ retry
  const r1 = resolveToneGuardedText({
    original: blocked,
    retry: "คะแนน 7.5 อยู่ระดับกลางค่อนดีของเกณฑ์ครับ",
    moneyCtx: {},
  });
  assert.equal(r1.outcome, "retry_passed");
  assert.doesNotMatch(r1.text, PRAISE_COMFORT_RE);

  // เคสจริง 1 (Codex รัน): ต้องได้ประโยคไทยธรรมชาติ ตัวเลขครบ ไม่มีเศษ "ดีแล้ว"
  assert.equal(
    sanitizePraiseComfort(blocked),
    "ครับ คะแนน 7.5 กับ 87% อยู่ตามตำแหน่งที่รายงานระบุครับ",
  );
  const r2 = resolveToneGuardedText({ original: blocked, retry: "สบายใจได้ครับ", moneyCtx: {} });
  assert.equal(r2.outcome, "sanitized");
  assert.equal(r2.text, "ครับ คะแนน 7.5 กับ 87% อยู่ตามตำแหน่งที่รายงานระบุครับ");

  // เคสจริง 2: clause อนาคตโดนกลืนทั้งท่อน ไม่มีเศษ "นที่ใช่เอง"
  assert.equal(
    sanitizePraiseComfort("ครับ หาคนละสายไปเรื่อย ๆ เดี๋ยวก็เจอชิ้นที่ใช่เอง"),
    "ครับ หาคนละสายไปเรื่อย ๆ หากต้องการเทียบให้ชัด ให้สแกนชิ้นต่างสายเพิ่มเติม",
  );

  // rule order: "ถือว่าใช้ได้ดีแล้ว" ต้องโดนกินทั้งวลี (longest first) ไม่เหลือ "ดีแล้ว"
  assert.equal(
    sanitizePraiseComfort("ชิ้นนี้ถือว่าใช้ได้ดีแล้วครับ"),
    "ชิ้นนี้อยู่ตามตำแหน่งที่รายงานระบุครับ",
  );

  // sanitize แล้วเหลือแต่เศษ (ข้อความเป็นคำต้องห้ามล้วน) → neutral fallback
  const r4 = resolveToneGuardedText({ original: "ไม่ต้องกังวลครับ", retry: null, moneyCtx: {} });
  assert.equal(r4.outcome, "fallback");
  assert.equal(r4.text, NEUTRAL_RECOVERY_FALLBACK);
  assert.doesNotMatch(NEUTRAL_RECOVERY_FALLBACK, PRAISE_COMFORT_RE);
});

test("sanitizedOutputQualityOk: กันเศษภาษาพัง/สาระหาย (Codex รอบ 3)", async () => {
  const { sanitizedOutputQualityOk } = await import(
    "../src/core/conversation/personaRole.util.js"
  );
  const orig = "ครับ คะแนน 7.5 กับ 87% แบบนี้ก็ถือว่าใช้ได้ดีแล้วครับ ไม่ต้องกังวล";
  assert.equal(
    sanitizedOutputQualityOk("ครับ คะแนน 7.5 กับ 87% อยู่ตามตำแหน่งที่รายงานระบุครับ", orig),
    true,
  );
  // เศษที่ Codex เจอจริงต้องไม่ผ่าน
  assert.equal(
    sanitizedOutputQualityOk("ก็อยู่ตามระดับที่ตัวเลขระบุดีแล้วครับ", orig),
    false,
  );
  assert.equal(
    sanitizedOutputQualityOk("ให้สแกนชิ้นอื่นเพิ่มเติมนที่ใช่เอง", orig),
    false,
  );
  assert.equal(sanitizedOutputQualityOk("สั้นไป", orig), false);
  assert.equal(sanitizedOutputQualityOk("ครับ ", orig), false);
});

test("sanitizeForeignLinks: ตัดลิงก์นอกโดเมน เก็บลิงก์เรา (เคสจริง ener.app 17 ส.ค.)", async () => {
  const { sanitizeForeignLinks } = await import(
    "../src/core/conversation/personaRole.util.js"
  );
  const bad = sanitizeForeignLinks(
    "ออกแล้วครับ เปิดลิงก์ดูรายงานเต็มได้เลยครับ\n\nhttps://ener.app/report/xxxxx",
  );
  assert.equal(bad.stripped.length, 1);
  assert.doesNotMatch(bad.text, /ener\.app/);
  const good = sanitizeForeignLinks("ดูได้ที่ https://scan.my-ener.uk/r/rpt_abc ครับ");
  assert.equal(good.stripped.length, 0);
  assert.match(good.text, /scan\.my-ener\.uk\/r\/rpt_abc/);
  const mixed = sanitizeForeignLinks("คลิปอยู่ที่ https://youtu.be/abc123 กับ http://scam.example/x");
  assert.equal(mixed.stripped.length, 1);
  assert.match(mixed.text, /youtu\.be/);
});
