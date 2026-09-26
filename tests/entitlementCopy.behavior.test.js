/**
 * ข้อความเรื่องสิทธิ์ชุดเดียวทั้งระบบ (กบ/Codex 26 ก.ย. 2026)
 *
 * ครอบ: trial 2/1/0 · บัญชีเก่า (ไม่ eligible) · paid · แพ็กหมดอายุ · bonus · หลายสิทธิ์ · อ่านสิทธิ์ล้ม · daily mode
 * กติกา: โหมด new_customer ห้ามมีคำต้องห้าม · โหมด daily ยังพูดฟรีรายวันได้ · คนที่ยังมีสิทธิ์อื่นห้ามถูกบอกว่าหมด ·
 *        ห้ามชวนซื้อเพื่อดูของเดิม · ราคา/จำนวน/อายุจาก config · LINE กับ LIFF ใช้สถานะเดียวกัน
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

for (const [k, v] of Object.entries({
  OPENAI_API_KEY: "sk-test", SUPABASE_URL: "http://127.0.0.1:9", LOCAL_POSTGREST_URL: "http://127.0.0.1:9",
  LOCAL_POSTGREST_ANON_KEY: "x", LOCAL_POSTGREST_SERVICE_KEY: "x", SUPABASE_SERVICE_ROLE_KEY: "x",
  CHANNEL_ACCESS_TOKEN: "t", CHANNEL_SECRET: "s", GEMINI_API_KEY: "g", REDIS_URL: "",
})) process.env[k] = v;
try {
  for (const line of readFileSync(new URL("../.env.example", import.meta.url), "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=/); if (m && !process.env[m[1]]) process.env[m[1]] = "test-placeholder";
  }
} catch { /* ignore */ }

const C = await import("../src/services/entitlementCopy.service.js");
const { buildFreeQuotaPaywallFlex } = await import("../src/services/flex/paywallOffer.flex.js");
const { buildQuotaRemainingReply } = await import("../src/utils/packageQuestion.util.js");
const W = await import("../src/utils/webhookText.util.js");
const { buildScanOfferReply } = await import("../src/services/scanOffer.copy.js");
const { resolveScanOfferAccessContext } = await import("../src/services/scanOfferAccess.resolver.js");
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const OFFER = {
  configVersion: "test-v1", freeQuotaPerDay: 1, paidPriceThb: 49, paidScanCount: 4, paidWindowHours: 24, defaultPackageKey: "p49",
  packages: [
    { key: "p29", label: "29 บาท ค่าครูเปิดคำอ่าน 1 ครั้ง / 24 ชม.", active: true, priceThb: 29, scanCount: 1, windowHours: 24 },
    { key: "p49", label: "49 บาท ค่าครูเหมาชุด 4 ครั้ง / 24 ชม.", active: true, priceThb: 49, scanCount: 4, windowHours: 24 },
    { key: "p399", label: "399 บาท ค่าครูดูแลคลังพลัง 30 ครั้ง / 30 วัน", active: true, priceThb: 399, scanCount: 30, windowHours: 720 },
  ],
};
const FUTURE = "2027-01-01T00:00:00Z", PAST = "2026-08-11T18:35:26Z";
const acc = (o) => ({ allowed: false, reason: "payment_required", remaining: 0, usedScans: 0, freeScansLimit: 0, freeScansRemaining: 0,
  paidUntil: null, paidRemainingScans: 0, freePolicy: "daily", freeAccessKind: "daily", bonusScansAvailable: 0, trialEligible: null, ...o });
const T = (o) => acc({ freePolicy: "new_customer", ...o });
const forbid = (text, policy, label) => {
  const hit = C.findForbiddenPhrase(text, policy);
  assert.equal(hit, null, `${label}: มีคำต้องห้าม /${hit}/ ใน: ${String(text).slice(0, 160)}`);
};

test("resolveEntitlementState: ครบเมทริกซ์ trial 2/1/0 · บัญชีเก่า · paid · แพ็กหมดอายุ · bonus · daily · อ่านล้ม", () => {
  const cases = [
    ["trial_left", T({ allowed: true, reason: "free", trialEligible: true, freeScansLimit: 2, freeScansRemaining: 2, remaining: 2 }), { freeLeft: 2 }],
    ["trial_left", T({ allowed: true, reason: "free", trialEligible: true, freeScansLimit: 2, freeScansRemaining: 1, remaining: 1 }), { freeLeft: 1 }],
    ["trial_exhausted", T({ trialEligible: true, freeScansLimit: 2 }), { freeLeft: 0 }],
    ["existing_no_rights", T({ trialEligible: false }), {}],
    ["paid_expired", T({ trialEligible: false, paidUntil: PAST, paidRemainingScans: 999977 }), { paidLeft: 0 }],
    ["paid", T({ allowed: true, reason: "paid", remaining: 3, paidUntil: FUTURE, paidRemainingScans: 3 }), { paidLeft: 3 }],
    ["paid", acc({ allowed: true, reason: "paid", remaining: 999999, paidUntil: FUTURE }), { paidUnlimited: true }],
    ["bonus", T({ allowed: true, reason: "free", freeAccessKind: "bonus", trialEligible: false, bonusScansAvailable: 1 }), { bonusLeft: 1 }],
    ["bonus", acc({ allowed: true, reason: "free", freeAccessKind: "bonus", bonusScansAvailable: 2 }), { bonusLeft: 2 }],
    ["daily_left", acc({ allowed: true, reason: "free", freeScansLimit: 1, freeScansRemaining: 1 }), { freeLeft: 1 }],
    ["daily_exhausted", acc({ freeScansLimit: 1 }), {}],
    ["daily_exhausted", acc({ paidUntil: PAST, paidRemainingScans: 999977 }), {}],
    ["unavailable", null, {}], ["unavailable", { allowed: "yes" }, {}], ["unavailable", acc({ accessUnavailable: true }), {}],
  ];
  for (const [state, a, expect] of cases) {
    const es = C.resolveEntitlementState(a);
    assert.equal(es.state, state, JSON.stringify(a));
    for (const [k, v] of Object.entries(expect)) assert.equal(es[k], v, `${state}.${k}`);
  }
});

test("ข้อความตามตาราง Codex: trial 2/1/0 · บัญชีเก่า · paid · bonus · แพ็กหมดอายุ · อ่านล้ม", () => {
  const line = (a) => C.buildEntitlementStatusLine(C.resolveEntitlementState(a));
  assert.equal(line(T({ allowed: true, reason: "free", trialEligible: true, freeScansLimit: 2, freeScansRemaining: 2 })).headline, "สิทธิ์ทดลองฟรีคงเหลือ 2 ครั้ง");
  assert.match(line(T({ allowed: true, reason: "free", trialEligible: true, freeScansLimit: 2, freeScansRemaining: 2 })).detail, /รวม 2 ครั้งต่อบัญชี ไม่เติมใหม่รายวัน/);
  assert.equal(line(T({ allowed: true, reason: "free", trialEligible: true, freeScansLimit: 2, freeScansRemaining: 1 })).headline, "สิทธิ์ทดลองฟรีคงเหลือ 1 ครั้ง");
  assert.equal(line(T({ trialEligible: true })).headline, "ใช้สิทธิ์ทดลองฟรีครบ 2 ครั้งแล้ว");
  assert.equal(line(T({ trialEligible: false })).headline, "ยังไม่มีสิทธิ์สำหรับสแกนองค์ใหม่");
  const paid = line(T({ allowed: true, reason: "paid", remaining: 4, paidUntil: FUTURE }));
  assert.equal(paid.headline, "สิทธิ์จากแพ็กคงเหลือ 4 ครั้ง"); assert.match(paid.detail, /ใช้ได้ถึง /);
  assert.equal(line(T({ allowed: true, reason: "free", freeAccessKind: "bonus", trialEligible: false, bonusScansAvailable: 1 })).headline, "สิทธิ์โบนัสคงเหลือ 1 ครั้ง");
  assert.equal(line(T({ trialEligible: false, paidUntil: PAST })).headline, "แพ็กสแกนหมดอายุแล้ว");
  const un = C.buildEntitlementStatusLine(C.resolveEntitlementState(null));
  assert.equal(un.headline, "ยังตรวจสอบสิทธิ์ไม่ได้"); assert.ok(!/0|จ่าย|แพ็ก/.test(un.headline + un.detail), "อ่านล้มห้ามโชว์ 0 หรือชวนจ่าย");
});

test("หลายสิทธิ์: แยกยอด ไม่รวมเรียกว่าฟรี · ผู้ที่ยังมีสิทธิ์อื่นไม่ถูกบอกว่าหมด", () => {
  const es = C.resolveEntitlementState(T({ allowed: true, reason: "paid", remaining: 4, paidUntil: FUTURE, bonusScansAvailable: 1 }));
  const l = C.buildEntitlementStatusLine(es);
  assert.deepEqual(l.breakdown, ["จากแพ็ก 4 ครั้ง", "โบนัส 1 ครั้ง"]);
  assert.ok(!/ฟรี/.test(l.breakdown.join(" ")), "ห้ามเรียกรวมว่าฟรี");
  // trial หมดแต่มีโบนัส → ยังสแกนได้ ต้องไม่บอกว่าหมด
  const b = C.buildEntitlementStatusLine(C.resolveEntitlementState(T({ allowed: true, reason: "free", freeAccessKind: "bonus", trialEligible: true, freeScansRemaining: 0, bonusScansAvailable: 1 })));
  assert.match(b.headline, /โบนัสคงเหลือ 1/); assert.ok(!/ครบ|หมด|ไม่มีสิทธิ์/.test(b.headline));
  // packageQuestion ใช้ชุดเดียวกัน
  const q = buildQuotaRemainingReply({ access: T({ allowed: true, reason: "free", freeAccessKind: "bonus", trialEligible: true, freeScansRemaining: 0, bonusScansAvailable: 1 }), freeRemainingToday: 0, freeQuotaPerDay: 0 });
  assert.match(q, /โบนัสคงเหลือ 1/); forbid(q, "new_customer", "packageQuestion bonus");
});

test("paywall copy (LINE Flex/text) — โหมด new_customer ไม่มีคำต้องห้าม · daily ยังมีฟรีรายวัน · ทุกโหมดไม่ชวนซื้อเพื่อดูของเดิม", () => {
  for (const [name, a] of [
    ["trial_exhausted", T({ trialEligible: true })], ["existing", T({ trialEligible: false })], ["paid_expired", T({ trialEligible: false, paidUntil: PAST })],
  ]) {
    const es = C.resolveEntitlementState(a);
    const copy = C.buildPaywallCopy(es, { offer: OFFER });
    const all = [copy.title, copy.subtitle, ...copy.textLines, copy.altText].join("\n");
    forbid(all, "new_customer", name);
    assert.match(all, /รายงาน.*(ยังเปิดดูได้|ยังเปิดดูได้ตามเดิม)|คลังและรายงานเดิม/, `${name}: ต้องบอกว่าของเดิมดูได้`);
    assert.match(all, /สแกน 4 ครั้ง — 49 บาท · ใช้ได้ 24 ชม\./); assert.match(all, /สแกน 30 ครั้ง — 399 บาท · ใช้ได้ 30 วัน/);
    assert.ok(!/ค่าครูดูแลคลังพลัง|ค่าครูเหมาชุด|ค่าครูเปิดคำอ่าน/.test(all), "ชื่อแพ็กจาก label การตลาดห้ามโผล่");
    assert.equal(copy.ctaSecondary.text, "ดูผลเก่า"); assert.equal(copy.ctaPrimaryLabel, "เลือกแพ็กสแกน");
    const flex = buildFreeQuotaPaywallFlex(OFFER, { title: copy.title, subtitle: copy.subtitle, altText: copy.altText, secondaryAction: copy.ctaSecondary });
    const fj = JSON.stringify(flex);
    forbid(fj, "new_customer", `${name} flex`);
    assert.match(fj, /"label":"เลือกแพ็ก 49 บาท","text":"จ่าย 49"/, "ปุ่มบอกว่าเป็นขั้นเลือกแพ็ก · ข้อความที่ส่งยังตาม routing เดิม");
    assert.match(fj, /"text":"สแกน 30 ครั้ง"/); assert.match(fj, /"label":"ดูคลังของฉัน","text":"ดูผลเก่า"/);
  }
  const daily = C.buildPaywallCopy(C.resolveEntitlementState(acc({ freeScansLimit: 1 })), { offer: OFFER });
  assert.match(daily.title, /วันนี้ใช้สิทธิ์ฟรีครบแล้ว/); assert.match(daily.subtitle, /พรุ่งนี้หลังเที่ยงคืน/);
  forbid([daily.title, daily.subtitle].join(" "), "daily", "daily paywall");
  const un = C.buildPaywallCopy(C.resolveEntitlementState(null), { offer: OFFER });
  assert.equal(un.title, "ยังตรวจสอบสิทธิ์ไม่ได้"); assert.ok(!un.textLines.join(" ").includes("บาท"), "อ่านล้มห้ามชวนจ่ายทันที");
});

test("webhookText builders รับ policy: intro/fatigue/soft-close/welcome — trial ไม่สัญญาพรุ่งนี้ · daily คงเดิม · unknown ไม่สัญญาฟรี", () => {
  for (const tier of ["full", "short", "micro"]) for (const branch of ["wait_tomorrow", "unclear", "ack", "date_wrong"]) {
    const t = W.buildPaywallFatiguePromptText({ offer: OFFER, userId: "U1", tier, branch, policy: "new_customer" });
    forbid(t, "new_customer", `fatigue ${tier}/${branch}`);
  }
  assert.match(W.buildPaywallFatiguePromptText({ offer: OFFER, userId: "U1", tier: "short", branch: "wait_tomorrow", policy: "daily" }), /พรุ่งนี้/);
  forbid(W.buildPaywallFullOfferIntroText(OFFER, "new_customer"), "new_customer", "intro"); assert.match(W.buildPaywallFullOfferIntroText(OFFER, "daily"), /พรุ่งนี้ยังมีฟรี/);
  forbid(W.buildDeterministicPaywallSoftCloseText("new_customer"), "new_customer", "soft close"); assert.match(W.buildDeterministicPaywallSoftCloseText("daily"), /พรุ่งนี้/);
  forbid(W.buildDeterministicPaywallSoftCloseText("unknown"), "new_customer", "soft close unknown");
  forbid(W.buildFollowWelcomeText("new_customer"), "new_customer", "welcome trial"); assert.match(W.buildFollowWelcomeText("new_customer"), /ลูกค้าใหม่ทดลองฟรี 2 ครั้ง/);
  assert.match(W.buildFollowWelcomeText("daily"), /ฟรีวันละ \d+ ครั้ง/);
  assert.ok(!/ฟรี/.test(C.buildFirstScanInviteLine("unknown")), "อ่านนโยบายไม่ได้ = ไม่สัญญาฟรี");
});

test("template pools (buildScanOfferReply): new_customer → pool _trial · บัญชีเก่า → existing_no_rights · daily → pool เดิม", () => {
  const ctx = resolveScanOfferAccessContext({ offer: OFFER, freeUsedToday: 1, paidUntil: null, paidRemainingScans: 0 });
  const gate = { allowed: false, reason: "payment_required" };
  const tr = buildScanOfferReply({ offer: OFFER, accessContext: { ...ctx, freePolicy: "new_customer", trialEligible: true }, gate, userId: "U1" });
  forbid(tr.primaryText, "new_customer", "pool trial"); assert.match(tr.primaryText, /ทดลองฟรีครบ 2 ครั้ง/); assert.match(tr.primaryText, /49/);
  const ex = buildScanOfferReply({ offer: OFFER, accessContext: { ...ctx, freePolicy: "new_customer", trialEligible: false }, gate, userId: "U1" });
  forbid(ex.primaryText, "new_customer", "pool existing"); assert.match(ex.primaryText, /เติมสิทธิ์เพื่อสแกนองค์ใหม่/); assert.ok(!/ทดลอง/.test(ex.primaryText), "บัญชีเก่าไม่พูดถึงทดลอง");
  for (const alt of [...tr.alternateTexts, ...ex.alternateTexts]) forbid(alt, "new_customer", "pool alt");
  const dy = buildScanOfferReply({ offer: OFFER, accessContext: ctx, gate, userId: "U1" });
  assert.match(dy.primaryText, /พรุ่งนี้|ฟรี/);
});

test("AI facts/prompt: ไม่มีกติกาฟรีรายวันแบบตายตัว · trial mode มีคำสั่งห้าม · ไม่ชวนซื้อเพื่อดูคลัง", () => {
  const prompt = read("src/core/conversation/geminiFront/geminiConsultPrompt.js");
  assert.ok(!/สิทธิ์ฟรีรายวัน รีเซ็ตหลังเที่ยงคืน/.test(prompt), "กติการายวันตายตัวใน prompt ต้องหายไป");
  assert.ok(!/⑤ ฟรีวันละ 1 ครั้ง/.test(prompt)); assert.ok(!/ค่าครูดูแลคลังพลัง/.test(prompt)); assert.match(prompt, /เจ้าของเปิดดูของตัวเองได้เสมอ ไม่ต้องซื้อแพ็ก/);
  const facts = read("src/core/conversation/geminiFront/customerFactsContext.util.js");
  const trialBranch = facts.slice(facts.indexOf("} else if (trial.enabled) {"), facts.indexOf("} else {", facts.indexOf("} else if (trial.enabled) {")));
  assert.match(trialBranch, /ห้ามพูดว่า "ฟรีวันละครั้ง" "วันนี้ใช้ฟรีครบแล้ว" "พรุ่งนี้มีฟรี"/); assert.match(trialBranch, /โบนัสจากการชวนเพื่อน/);
  assert.match(trialBranch, /ห้ามชวนซื้อเพื่อดูของเดิม/);
});

test("จุดที่ต้องเลิกพูด 'ฟรีวันละ' แบบตายตัว: welcome/howto/registration/landing/report CTA/share card/ชื่อแพ็ก", () => {
  const hard = [
    ["src/services/welcome/howtoFlow.service.js", /ฟรีวันละ 1 ชิ้น"/], ["src/services/welcome/registrationSuccess.service.js", /ฟรีวันละ 1 ชิ้นครับ"/],
    ["src/app.js", /ฟรีวันละ 1 ครั้ง/], ["src/templates/reports/amuletReportV2.template.js", /ฟรีวันละ 1 ชิ้น/],
    ["src/templates/reports/moldaviteReportV2.template.js", /ฟรีวันละ/], ["src/templates/reports/crystalBraceletReportV2.template.js", /ฟรีวันละ/],
    ["src/services/reports/shareCard.service.js", /สแกนฟรีวันละ/], ["src/services/flex/paywallOffer.flex.js", /วันนี้ใช้สิทธิ์ฟรีครบแล้วครับ"/],
    ["src/services/scanV2/deliverOutbound.service.js", /\|\| 2;/], ["src/services/upgradeCredit.service.js", /หักจากค่าครูดูแลคลังพลัง/],
  ];
  for (const [f, re] of hard) assert.ok(!re.test(read(f)), `${f} ยังมี ${re}`);
  const dl = read("src/services/scanV2/deliverOutbound.service.js");
  assert.match(dl, /resolveEntitlementState\(access, \{ now \}\)/, "ท้ายผลสแกนใช้สถานะเดียวกับ LIFF");
  const lw = read("src/routes/lineWebhook.js");
  assert.equal((lw.match(/policy: (await resolveFreePolicy\(\)|fatiguePolicy)/g) || []).length, 4, "fatigue prompt ทุกจุดส่ง policy");
  assert.match(lw, /buildFollowWelcomeText\(await resolveFreePolicy\(\)\)/);
});
