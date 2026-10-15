/**
 * ชั้นแชต AI ต้องรู้โหมดสิทธิ์ฟรีที่มีผลจริง + กำหนดการ (กบ/Codex 15 ต.ค. 2026)
 *  - snapshot เดียว free_policy_status(uid): โหมด/สิทธิ์คนนี้/schedule/last_applied สอดคล้องกัน
 *  - แยกกำหนดการอนาคต vs ที่มีผลแล้วแต่แถวยัง pending (worker ช้า) — อย่างหลัง = เปลี่ยนแล้ว ห้ามพูดว่า "จะเปลี่ยน"
 *  - ข้อความตรงโหมดเป้าหมาย (new_customer / none / daily) · อ้าง "ประกาศแล้ว" เฉพาะเมื่อมี announced_at
 *  - cutoff (eligible_since) = เกณฑ์บัญชีใหม่เท่านั้น · วันยกเลิกฟรีรายวัน = เวลามีผลของกำหนดการล่าสุด (ไม่มี = ไม่พูดวัน)
 *  - สิทธิ์รายบุคคลจาก DB ห้ามรับปากว่าทุกคนเหลือ 2 ครั้ง · ไม่มีคำว่า "ระบบ" · อ่านไม่ได้ = ไม่เดา
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
globalThis.fetch = async () => { throw new Error("external network forbidden"); };

const { supabase } = await import("../src/config/supabase.js");
const { buildCustomerFactsContext } = await import("../src/core/conversation/geminiFront/customerFactsContext.util.js");
const EFF = "2026-10-18T17:00:00+00:00";      // 19 ต.ค. 2569 00:00 ไทย (อนาคต ณ วันเทสต์ 15 ต.ค. 2026)
const ANN = "2026-10-15T06:40:00+00:00";      // 15 ต.ค. 2569 13:40 ไทย
const CUTOFF_OLD = "2026-09-26T09:07:59+00:00"; // 26 ก.ย. 2569 16:07 ไทย
const PAST_EFF = "2026-10-01T17:00:00+00:00";  // 2 ต.ค. 2569 00:00 ไทย (ผ่านไปแล้ว)

function install({ mode, eligible = false, used = 0, eligibleSince = null, storedMode = null, schedule = null, lastApplied = null, statusFail = false, noStatusRpc = false, user = {} }) {
  const orig = { from: supabase.from, rpc: supabase.rpc };
  const trial = { enabled: mode === "new_customer", mode, daily_enabled: mode === "daily", eligible, used, pending: 0, limit: 2, eligible_since: eligibleSince };
  supabase.rpc = async (fn) => {
    if (fn === "new_customer_trial_status") return { data: trial };
    if (fn === "free_policy_status") {
      if (noStatusRpc) return { error: { message: "function public.free_policy_status does not exist", code: "42883" } };
      if (statusFail) return { error: { message: "boom" } };
      return { data: { ...trial, stored_mode: storedMode ?? mode, schedule, last_applied: lastApplied } };
    }
    return { data: null, error: { message: "unknown rpc " + fn } };
  };
  const row = { id: "u1", paid_until: null, paid_remaining_scans: 0, free_scan_daily_offset: 0, free_scan_offset_date: null, bonus_scans: 0, ...user };
  supabase.from = (table) => {
    const q = { select() { return q; }, eq() { return q; }, limit() { return q; }, gte() { return q; }, lt() { return q; }, order() { return q; }, in() { return q; },
      maybeSingle: async () => ({ data: table === "app_users" ? row : null }),
      then: (res) => res({ data: table === "app_users" ? row : [], count: 0, error: null }) };
    return q;
  };
  return () => { supabase.from = orig.from; supabase.rpc = orig.rpc; };
}
const line = (ctx, re) => ctx.split("\n").find((l) => re.test(l)) || "";
const run = async (opts, uid = "Utest") => { const restore = install(opts); try { const c = await buildCustomerFactsContext(uid); assert.ok(c, "context must build"); return c; } finally { restore(); } };

test("daily ไม่มีกำหนดการ: พูดฟรีรายวันได้ ไม่มีบรรทัดกำหนดการ/ยกเลิก", async () => {
  const ctx = await run({ mode: "daily" });
  assert.match(line(ctx, /กติกาสิทธิ์ฟรี/), /วันละ \d+ ครั้ง รีเซ็ตหลังเที่ยงคืน/);
  assert.match(line(ctx, /^• สิทธิ์ฟรีวันนี้/), /สิทธิ์ฟรีวันนี้เหลือ/);
  assert.doesNotMatch(ctx, /กำหนดการเปลี่ยนนโยบาย|ยกเลิกฟรีรายวันแล้ว|ไม่มีฟรีรายวันแล้ว/);
});

test("ก่อนถึงเวลา (daily + กำหนดการอนาคต new_customer, ประกาศแล้ว): ใช้ฟรีได้ถึงสิ้นวันที่ 18 · ตั้งแต่ 19 ไม่มีฟรีรายวัน · บัญชีใหม่ที่เข้าเกณฑ์ 2 ครั้ง", async () => {
  const ctx = await run({ mode: "daily", schedule: { id: 1, status: "pending", target_mode: "new_customer", effective_at: EFF, announced_at: ANN } });
  const l = line(ctx, /กำหนดการเปลี่ยนนโยบาย/);
  assert.ok(l, "must have upcoming line");
  assert.match(l, /ประกาศลูกค้าแล้วเมื่อ 15 ต\.ค\. 2569 13:40 น\./);
  assert.match(l, /ตอนนี้ยังใช้ฟรีรายวัน \(วันละ 1 ครั้ง\) ได้ถึงสิ้นวันที่ 18 ต\.ค\. 2569/);
  assert.match(l, /ตั้งแต่ 19 ต\.ค\. 2569 00:00 น\. จะไม่มีฟรีรายวัน ส่วนบัญชีใหม่ที่เข้าเกณฑ์ทดลองฟรีรวม 2 ครั้ง/);
  assert.match(l, /ห้ามบอกว่าเปลี่ยนแล้วก่อนถึงเวลา/); assert.match(l, /ห้ามรับปากว่าทุกคนจะเหลือฟรี 2 ครั้ง/);
  assert.match(line(ctx, /กติกาสิทธิ์ฟรี/), /วันละ/); // ตอนนี้ยังเป็น daily
  assert.doesNotMatch(ctx, /ยกเลิกฟรีรายวันแล้ว/);
});

test("R1 กำหนดการถึงเวลาแล้วแต่แถวยัง pending (worker ช้า): ถือว่าเปลี่ยนแล้ว ไม่พูดว่า 'จะเปลี่ยน' · วันยกเลิก = เวลามีผลของกำหนดการ", async () => {
  const ctx = await run({ mode: "new_customer", storedMode: "daily", eligibleSince: PAST_EFF, schedule: { id: 2, status: "pending", target_mode: "new_customer", effective_at: PAST_EFF, announced_at: null } });
  assert.doesNotMatch(ctx, /กำหนดการเปลี่ยนนโยบาย|จะไม่มีฟรีรายวัน/);
  const f = line(ctx, /^• นโยบายปัจจุบัน/);
  assert.match(f, /ยกเลิกฟรีรายวันแล้วตั้งแต่ 2 ต\.ค\. 2569 00:00 น\./);
  assert.match(f, /ตอนนี้ไม่มีฟรีรายวันแล้วครับ บัญชีใหม่ที่เข้าเกณฑ์ทดลองฟรีรวม 2 ครั้ง แพ็กและโบนัสเดิมยังใช้ได้ตามเงื่อนไข และผลเก่ายังเปิดดูได้/);
});

test("R2 ข้อความตรงโหมดเป้าหมาย: none → ไม่มีฟรีใด ๆ · daily → กลับมามีฟรีรายวัน · ไม่มี announced_at → ห้ามอ้างว่าประกาศแล้ว", async () => {
  const toNone = await run({ mode: "daily", schedule: { id: 3, status: "pending", target_mode: "none", effective_at: EFF, announced_at: null } });
  const l1 = line(toNone, /กำหนดการเปลี่ยนนโยบาย/);
  assert.match(l1, /จะไม่มีสิทธิ์ฟรีใด ๆ \(ไม่มีฟรีรายวัน ไม่มีทดลองฟรี\)/);
  assert.match(l1, /ยังไม่มีบันทึกว่าประกาศลูกค้า — ห้ามอ้างว่าแจ้งไปแล้ว/); assert.doesNotMatch(l1, /ประกาศลูกค้าแล้วเมื่อ/);
  assert.doesNotMatch(l1, /ทดลองฟรีรวม 2 ครั้ง/, "เป้าหมาย none ห้ามพูดทดลองฟรี");
  const toDaily = await run({ mode: "none", schedule: { id: 4, status: "pending", target_mode: "daily", effective_at: EFF, announced_at: ANN } });
  const l2 = line(toDaily, /กำหนดการเปลี่ยนนโยบาย/);
  assert.match(l2, /จะกลับมามีฟรีรายวัน \(วันละ 1 ครั้ง\)/); assert.match(l2, /ตอนนี้ยังเป็น "ปิดสิทธิ์ฟรีทุกบัญชี/);
});

test("R3 cutoff = เกณฑ์บัญชีใหม่ ไม่ใช่วันยกเลิกฟรีรายวัน: cutoff 26 ก.ย. แต่ยกเลิกรอบล่าสุด 19 ต.ค. (last_applied) · ไม่มี last_applied = ไม่พูดวัน", async () => {
  const ctx = await run({ mode: "new_customer", eligibleSince: CUTOFF_OLD, lastApplied: { id: 1, status: "applied", target_mode: "new_customer", effective_at: EFF, applied_from_mode: "daily" } });
  const f = line(ctx, /^• นโยบายปัจจุบัน/);
  assert.match(f, /ยกเลิกฟรีรายวันแล้วตั้งแต่ 19 ต\.ค\. 2569 00:00 น\./);
  assert.match(f, /บัญชีใหม่ = บัญชีที่เริ่มใช้ตั้งแต่ 26 ก\.ย\. 2569 16:07 น\./);
  assert.doesNotMatch(f, /ยกเลิกฟรีรายวันแล้วตั้งแต่ 26 ก\.ย\./);
  const manual = await run({ mode: "new_customer", eligibleSince: CUTOFF_OLD, lastApplied: null });
  const f2 = line(manual, /^• นโยบายปัจจุบัน/);
  assert.match(f2, /นโยบายปัจจุบัน: ไม่มีฟรีรายวันแล้ว ฟรีเฉพาะบัญชีใหม่ที่เข้าเกณฑ์/); assert.doesNotMatch(f2, /ยกเลิกฟรีรายวันแล้วตั้งแต่/);
  assert.match(f2, /บัญชีใหม่ = บัญชีที่เริ่มใช้ตั้งแต่ 26 ก\.ย\./);
});

test("สิทธิ์รายบุคคลจาก DB: ลูกค้าเดิมไม่มีทดลอง · ลูกค้าใหม่เหลือ 1 จาก 2 · โปรไม่พูดฟรีรายวัน", async () => {
  const old = await run({ mode: "new_customer", eligible: false, eligibleSince: CUTOFF_OLD });
  assert.match(line(old, /^• นโยบายปัจจุบัน/), /ลูกค้าเดิม \(ไม่มีสิทธิ์ทดลอง\)/);
  assert.match(line(old, /โปรตอนนี้/), /บัญชีใหม่ทดลองฟรีรวม 2 ครั้ง \(ไม่มีฟรีรายวัน\)/); assert.doesNotMatch(line(old, /โปรตอนนี้/), /มีฟรีวันละ/);
  const nw = await run({ mode: "new_customer", eligible: true, used: 1, eligibleSince: CUTOFF_OLD }, "Unew");
  assert.match(line(nw, /^• นโยบายปัจจุบัน/), /ลูกค้าใหม่ สิทธิ์ทดลองเหลือ 1 จาก 2 ครั้ง/);
});

test("none: ไม่มีฟรีใด ๆ · โบนัสยังใช้ได้ · มีวันปิดเมื่อมาจากกำหนดการ", async () => {
  const ctx = await run({ mode: "none", lastApplied: { id: 5, status: "applied", target_mode: "none", effective_at: PAST_EFF, applied_from_mode: "new_customer" } });
  assert.match(line(ctx, /^• นโยบายปัจจุบัน/), /ปิดสิทธิ์ฟรีทุกบัญชี/); assert.match(line(ctx, /กติกาสิทธิ์ฟรี/), /ปิดสิทธิ์ฟรีทุกบัญชีแล้ว ตั้งแต่ 2 ต\.ค\. 2569/);
  assert.match(line(ctx, /โปรตอนนี้/), /ไม่มีสิทธิ์ฟรีใด ๆ/); assert.doesNotMatch(ctx, /สิทธิ์ฟรีวันนี้เหลือ/);
  const b = await run({ mode: "none", user: { bonus_scans: 2 } }, "Ub");
  assert.match(line(b, /^• นโยบายปัจจุบัน/), /มีโบนัสจากการชวนเพื่อน 2 ครั้ง/);
});

test("อ่าน snapshot ไม่ได้ / DB ก่อน 067: ใช้ trial status อย่างเดียว ไม่พูดกำหนดการ ไม่เดา · ไม่มีคำว่า 'ระบบ'", async () => {
  const a = await run({ mode: "daily", statusFail: true }); assert.doesNotMatch(a, /กำหนดการเปลี่ยนนโยบาย/); assert.doesNotMatch(a, /ระบบ/);
  const b = await run({ mode: "new_customer", noStatusRpc: true, eligibleSince: CUTOFF_OLD }); assert.match(line(b, /^• นโยบายปัจจุบัน/), /ไม่มีฟรีรายวันแล้ว ฟรีเฉพาะบัญชีใหม่/); assert.doesNotMatch(b, /กำหนดการเปลี่ยนนโยบาย/);
  const c = await run({ mode: "daily", schedule: { id: 9, status: "pending", target_mode: "new_customer", effective_at: EFF, announced_at: ANN } }); assert.doesNotMatch(c, /ระบบ/);
});

test("orchestrator fallback ของ guard สิทธิ์ปลอมไม่สัญญาฟรีรายวันนอกโหมด daily · consult prompt รู้ 3 โหมด (static)", () => {
  const src = readFileSync(new URL("../src/core/conversation/geminiFront/geminiFrontOrchestrator.service.js", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("function safeTextForBlockedClaim"), src.indexOf("export async function runGeminiFrontOrchestrator"));
  assert.match(fn, /freePolicy === "daily"/); assert.match(fn, /ฟรีรายวันยกเลิกแล้ว มีทดลองฟรีเฉพาะบัญชีใหม่/);
  const nonDaily = fn.split('if (freePolicy === "daily")')[1].split("}")[1] || "";
  assert.doesNotMatch(nonDaily, /ใช้สแกนฟรีรายวันได้ตามปกติ/);
  assert.match(src, /safeTextForBlockedClaim\(phase1, freePolicy\)/); assert.match(src, /resolveFreePolicy\(\)/);
  const prompt = readFileSync(new URL("../src/core/conversation/geminiFront/geminiConsultPrompt.js", import.meta.url), "utf8");
  assert.match(prompt, /ปิดสิทธิ์ฟรีแล้ว/); assert.match(prompt, /ยังฟรีไหม/);
});
