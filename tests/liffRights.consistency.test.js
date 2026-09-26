/**
 * LIFF แสดงสิทธิ์ต้องตรงกับด่านรับรูป (กบ/Codex 26 ก.ย. 2026)
 *
 * บั๊กเดิมใน getRemainingScans: daily mode คำนวณเองจาก app_users + นับสแกนวันนี้ แทนที่จะใช้
 * ผล checkScanAccess · `freeQuotaPerDay || 2` ทำโควตา 0 → 2 · นับล้ม `.catch(() => 0)` = โชว์เกินจริง
 *
 * ตอนนี้ resolveLiffRights ถอดจาก authority ล้วน: รักษา 0 · อ่านล้ม = unavailable ไม่สร้างยอดสมมติ ·
 * แยก ฟรี/ทดลอง/ซื้อ/โบนัส · หน้า pay เรียก gate ครั้งเดียว · zero-state ของ trial ไม่พูดว่า "พรุ่งนี้"
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

const { supabase } = await import("../src/config/supabase.js");
const { checkScanAccess } = await import("../src/services/paymentAccess.service.js");
const { resolveLiffRights } = await import("../src/routes/liff.routes.js");
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const NOW = new Date("2026-09-26T02:12:35Z"); // ช่วงเดียวกับภาพหน้าจอของกบ (09:12 ไทย)
const UID = "test-liff-user";

/** fake DB แบบเดียวกับ newCustomerTrial.test.js — คุมทั้ง app_users, จำนวนสแกนวันนี้ และนโยบาย trial */
function installFakeDb({ user, scanCountToday = 0, countFails = false, trialEnabled = false, trialEligible = false, trialUsed = 0 }) {
  const originalFrom = supabase.from, originalRpc = supabase.rpc;
  const calls = { app_users: 0, scan_results: 0 };
  supabase.rpc = async (name) => {
    if (name === "new_customer_trial_status")
      return { data: { enabled: trialEnabled, eligible_since: trialEnabled ? "2026-09-20T00:00:00Z" : null,
        limit: 2, eligible: trialEligible, used: trialUsed, pending: 0 } };
    return { data: null };
  };
  supabase.from = (table) => {
    const result = () => {
      if (table === "scan_results") {
        calls.scan_results++;
        return countFails ? { count: null, error: new Error("count offline") } : { count: scanCountToday };
      }
      if (table === "app_users") { calls.app_users++; return { data: user }; }
      return { data: null };
    };
    const q = { select() { return q; }, eq() { return q; }, limit() { return q; }, gte() { return q; }, lt() { return q; },
      update() { return q; }, maybeSingle: async () => result(),
      then: (res, rej) => Promise.resolve(result()).then(res, rej) };
    return q;
  };
  return { calls, restore: () => { supabase.from = originalFrom; supabase.rpc = originalRpc; } };
}
const baseUser = () => ({ id: "app-user-1", line_user_id: UID, paid_remaining_scans: 0, paid_until: null,
  bonus_scans: 0, free_scan_daily_offset: 0, free_scan_offset_date: null });

test("รักษาโควตา 0: LIFF ต้องไม่กลายเป็น 2 เมื่อ authority บอกเหลือ 0", async () => {
  // จุดที่บั๊กเดิมอยู่คือชั้น mapping (|| 2) — ยิงตรงด้วยผล authority ที่เหลือ 0
  const r = await resolveLiffRights(UID, { allowed: false, reason: "payment_required", remaining: 0,
    usedScans: 1, freeScansLimit: 0, freeScansRemaining: 0, paidUntil: null, paidRemainingScans: 0,
    freePolicy: "daily", freeAccessKind: "daily", bonusScansAvailable: 0 });
  assert.equal(r.total, 0); assert.equal(r.freeLeft, 0); assert.equal(r.unavailable, false);
});

test("อ่านข้อมูลล้ม → unavailable ทุกยอด 0 ห้ามสร้างยอดสมมติ (เดิม catch เป็น 0 = โชว์เต็มโควตา)", async () => {
  const f = installFakeDb({ user: baseUser(), countFails: true });
  try {
    await assert.rejects(checkScanAccess({ userId: UID, now: NOW }), /count offline/, "gate เองก็ fail-closed");
    const r = await resolveLiffRights(UID);
    assert.equal(r.unavailable, true);
    assert.equal(r.total, 0); assert.equal(r.freeLeft, 0); assert.equal(r.paidLeft, 0); assert.equal(r.bonusLeft, 0);
  } finally { f.restore(); }
});

test("access ผิดรูปแบบ → unavailable ไม่เดา", async () => {
  for (const bad of [null, undefined, {}, { allowed: "yes" }, "x"]) {
    const r = await resolveLiffRights(UID, bad);
    assert.equal(r.unavailable, true, JSON.stringify(bad)); assert.equal(r.total, 0);
  }
});

test("LIFF total>0 ⇔ gate อนุญาต — ครบเมทริกซ์ ฟรีรายวัน/หมด/ซื้อ/โบนัส/ทดลอง", async () => {
  const cases = [
    { name: "ฟรีวันนี้ยังเหลือ", user: baseUser(), scanCountToday: 0 },
    { name: "ฟรีวันนี้หมด ไม่มีอย่างอื่น", user: baseUser(), scanCountToday: 5 },
    { name: "ฟรีหมดแต่มีโบนัส", user: { ...baseUser(), bonus_scans: 1 }, scanCountToday: 5 },
    { name: "แพ็กซื้อยังไม่หมดอายุ", user: { ...baseUser(), paid_until: "2026-10-01T00:00:00Z", paid_remaining_scans: 4 }, scanCountToday: 5 },
    { name: "แพ็กหมดอายุ + ฟรีหมด (สภาพบัญชีกบ)", user: { ...baseUser(), paid_until: "2026-08-11T18:35:26Z", paid_remaining_scans: 999977 }, scanCountToday: 5 },
    { name: "trial ON เก่าไม่ eligible", user: baseUser(), scanCountToday: 0, trialEnabled: true, trialEligible: false },
    { name: "trial ON ใหม่ ใช้ไป 1", user: baseUser(), scanCountToday: 0, trialEnabled: true, trialEligible: true, trialUsed: 1 },
    { name: "trial ON ใหม่ ใช้ครบ 2", user: baseUser(), scanCountToday: 0, trialEnabled: true, trialEligible: true, trialUsed: 2 },
  ];
  for (const c of cases) {
    const f = installFakeDb(c);
    try {
      const gate = await checkScanAccess({ userId: UID, now: NOW });
      const liff = await resolveLiffRights(UID);
      assert.equal(liff.unavailable, false, c.name);
      assert.equal(liff.total > 0, gate.allowed, `${c.name}: LIFF total=${liff.total} แต่ gate allowed=${gate.allowed} (reason ${gate.reason})`);
      assert.equal(liff.freePolicy, gate.freePolicy || "daily", c.name);
      if (gate.reason === "paid") assert.equal(liff.paidLeft, gate.remaining, c.name);
      assert.equal(liff.freeLeft, Math.max(0, Number(gate.freeScansRemaining) || 0), c.name);
      assert.equal(liff.bonusLeft, Number(c.user.bonus_scans) || 0, c.name);
    } finally { f.restore(); }
  }
});

test("บัญชีสภาพเดียวกับภาพหน้าจอ (ฟรี 1/วัน ใช้ 0, แพ็กหมดอายุ, โบนัส 1) → LIFF กับ gate ตรงกัน", async () => {
  const f = installFakeDb({ user: { ...baseUser(), paid_until: "2026-08-11T18:35:26Z", paid_remaining_scans: 999977, bonus_scans: 1 }, scanCountToday: 0 });
  try {
    const gate = await checkScanAccess({ userId: UID, now: NOW });
    const liff = await resolveLiffRights(UID);
    assert.equal(gate.allowed, true); assert.equal(gate.reason, "free");
    assert.equal(liff.paidLeft, 0, "แพ็กหมดอายุห้ามนับ 999977");
    assert.equal(liff.bonusLeft, 1);
    assert.ok(liff.total >= 1);
  } finally { f.restore(); }
});

test("ส่ง access ที่คำนวณไว้แล้ว → ไม่แตะ DB ซ้ำ (หน้า pay เรียก gate ครั้งเดียว)", async () => {
  const f = installFakeDb({ user: baseUser() });
  try {
    const access = await checkScanAccess({ userId: UID, now: NOW });
    const before = { ...f.calls };
    const r = await resolveLiffRights(UID, access);
    assert.deepEqual(f.calls, before, "ห้ามอ่าน app_users/นับสแกนซ้ำ");
    assert.equal(r.unavailable, false);
  } finally { f.restore(); }
  const src = read("src/routes/liff.routes.js");
  const payStart = src.indexOf('liffRouter.get("/api/liff/pay/info"');
  assert.ok(payStart > 0, "ต้องเจอ route pay");
  const nextRoute = src.indexOf("liffRouter.", payStart + 20);
  const pay = src.slice(payStart, nextRoute > 0 ? nextRoute : payStart + 20000);
  assert.equal((pay.match(/checkScanAccess\(/g) || []).length, 1, "หน้า pay ต้องเรียก gate ครั้งเดียว");
  assert.match(pay, /resolveLiffRights\(userId, access\)/, "rights ต้องถอดจาก access ตัวเดียวกัน");
});

test("copy: trial ห้ามสื่อว่า 'พรุ่งนี้ได้ใหม่' · มีสถานะ 'ตรวจสอบสิทธิ์ไม่ได้' · ไม่มี fallback 2", () => {
  const src = read("src/routes/liff.routes.js");
  const fn = src.slice(src.indexOf("export async function resolveLiffRights"), src.indexOf('liffRouter.get("/api/liff/stats"'));
  assert.ok(!/\|\|\s*2\b/.test(fn), "ห้าม || 2");
  assert.ok(!fn.includes('from("app_users")') && !fn.includes("countScanResultsTodayForAppUser"), "ห้ามคำนวณเอง");
  assert.ok(!/remainingFree != null \? j\.remainingFree : 2/.test(src), "หน้า stats ห้าม fallback 2");
  // zero-state ชุดเดียวกับ LINE (entitlementCopy): สาขา new_customer ห้ามพูด "พรุ่งนี้" · สาขา daily พูดได้
  const zeroBranch = src.slice(src.indexOf("} else if(rights){"), src.indexOf('} else { st.classList.add("hidden"); }'));
  const trialBranch = zeroBranch.slice(zeroBranch.indexOf('if(rights.freePolicy === "new_customer"){'), zeroBranch.indexOf("} else {"));
  const shown = [...trialBranch.matchAll(/textContent = [\s\S]*?;/g)].map((m) => m[0]).join("\n");
  assert.ok(shown.includes("ใช้สิทธิ์ทดลองฟรีครบ 2 ครั้งแล้ว"), "zero-state ของ trial ต้องเป็นข้อความที่แสดงจริง");
  assert.ok(shown.includes("ยังไม่มีสิทธิ์สำหรับสแกนองค์ใหม่") && shown.includes("แพ็กสแกนหมดอายุแล้ว"), "แยกลูกค้าเดิม/แพ็กหมดอายุ");
  assert.ok(shown.includes("ยังเปิดดูได้โดยไม่ต้องซื้อแพ็ก"), "ต้องบอกว่าของเดิมดูได้");
  assert.ok(!/พรุ่งนี้|ฟรีวันนี้|หลังเที่ยงคืน/.test(shown), "ข้อความที่แสดงให้ trial ห้ามพูดถึงพรุ่งนี้/ฟรีวันนี้");
  const dailyBranch = zeroBranch.slice(zeroBranch.indexOf("} else {"));
  assert.ok(/วันนี้ใช้สิทธิ์ฟรีครบแล้ว/.test(dailyBranch), "โหมด daily ยังคงข้อความฟรีรายวัน");
  assert.equal((src.match(/ตรวจสอบสิทธิ์ไม่ได้ กรุณาลองใหม่/g) || []).length >= 2, true, "ทั้งหน้า pay และ stats ต้องมีสถานะอ่านไม่ได้");
  assert.match(src, /"โบนัส " \+/, "ต้องแยกแสดงโบนัส");
});
