/**
 * ชั้นแชต AI ต้องรู้โหมดสิทธิ์ฟรีที่มีผลจริง + กำหนดการที่ประกาศแล้ว (กบ 15 ต.ค. 2026)
 *  - daily: พูดฟรีรายวันได้ · new_customer: บอกว่ายกเลิกฟรีรายวันแล้ว ฟรีเฉพาะบัญชีใหม่ 2 ครั้ง + วัน cutoff ·
 *    none: ไม่มีฟรีใด ๆ · มี schedule pending: บรรทัดประกาศ วัน-เวลา และโหมดใหม่ แต่บอกว่าตอนนี้ยังเป็นโหมดเดิม
 *  - ไม่มีคำว่า "ระบบ" ใน context (กติกา flow-role) · อ่าน schedule ไม่ได้ = ไม่พูดถึง
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
const CUTOFF = "2026-10-18T17:00:00+00:00"; // 19 ต.ค. 2569 00:00 ไทย

function install({ mode, eligible = false, used = 0, schedule = null, statusFail = false, user = {} }) {
  const orig = { from: supabase.from, rpc: supabase.rpc };
  const trial = { enabled: mode === "new_customer", mode, daily_enabled: mode === "daily", eligible, used, pending: 0, limit: 2, eligible_since: mode === "new_customer" ? CUTOFF : null };
  supabase.rpc = async (fn) => {
    if (fn === "new_customer_trial_status") return { data: trial };
    if (fn === "free_policy_status") return statusFail ? { error: { message: "boom" } } : { data: { ...trial, stored_mode: mode, schedule, last_applied: null } };
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

test("daily: ยังพูดฟรีรายวันได้ ไม่มีบรรทัดประกาศเมื่อไม่มี schedule", async () => {
  const restore = install({ mode: "daily" });
  try {
    const ctx = await buildCustomerFactsContext("Utest");
    assert.ok(ctx, "context must build");
    assert.match(line(ctx, /กติกาสิทธิ์ฟรี/), /วันละ \d+ ครั้ง รีเซ็ตหลังเที่ยงคืน/);
    assert.match(line(ctx, /^• สิทธิ์ฟรีวันนี้/), /สิทธิ์ฟรีวันนี้เหลือ/);
    assert.doesNotMatch(ctx, /ประกาศเปลี่ยนนโยบายแล้ว/);
    assert.doesNotMatch(ctx, /ยกเลิกฟรีรายวันแล้ว/);
  } finally { restore(); }
});

test("daily + schedule pending → บอกวัน-เวลาที่จะเปลี่ยนและโหมดใหม่ แต่ตอนนี้ยังฟรีรายวัน", async () => {
  const restore = install({ mode: "daily", schedule: { id: 1, status: "pending", target_mode: "new_customer", effective_at: CUTOFF } });
  try {
    const ctx = await buildCustomerFactsContext("Utest");
    const l = line(ctx, /ประกาศเปลี่ยนนโยบายแล้ว/);
    assert.ok(l, "must have announcement line");
    assert.match(l, /19 ต\.ค\. 2569 00:00 น\./);
    assert.match(l, /เฉพาะบัญชีใหม่ทดลองฟรีรวม 2 ครั้ง/);
    assert.match(l, /ตอนนี้ยังเป็น "ฟรีรายวัน"/);
    assert.match(l, /ห้ามบอกว่าเปลี่ยนแล้วก่อนถึงเวลา/);
    assert.match(line(ctx, /กติกาสิทธิ์ฟรี/), /วันละ/);
  } finally { restore(); }
});

test("new_customer: บอกว่ายกเลิกฟรีรายวันแล้วตั้งแต่ cutoff ฟรีเฉพาะบัญชีใหม่ 2 ครั้ง · ลูกค้าเดิม vs ใหม่", async () => {
  const restore = install({ mode: "new_customer", eligible: false });
  try {
    const ctx = await buildCustomerFactsContext("Utest");
    const f = line(ctx, /^• นโยบายปัจจุบัน/);
    assert.match(f, /ฟรีเฉพาะบัญชีใหม่/); assert.match(f, /ยกเลิกฟรีรายวันแล้วตั้งแต่ 19 ต\.ค\. 2569 00:00 น\./);
    assert.match(f, /ลูกค้าเดิม \(ไม่มีสิทธิ์ทดลอง\)/); assert.match(f, /ตอนนี้ไม่มีฟรีรายวันแล้ว ฟรีมีเฉพาะบัญชีใหม่ 2 ครั้ง/);
    assert.match(line(ctx, /กติกาสิทธิ์ฟรี/), /ยกเลิกฟรีรายวันแล้ว ตั้งแต่ 19 ต\.ค\. 2569/);
    assert.match(line(ctx, /โปรตอนนี้/), /บัญชีใหม่ทดลองฟรีรวม 2 ครั้ง \(ไม่มีฟรีรายวัน\)/);
    assert.doesNotMatch(line(ctx, /โปรตอนนี้/), /มีฟรีวันละ/);
  } finally { restore(); }
  const r2 = install({ mode: "new_customer", eligible: true, used: 1 });
  try { assert.match(line(await buildCustomerFactsContext("Unew"), /^• นโยบายปัจจุบัน/), /ลูกค้าใหม่ สิทธิ์ทดลองเหลือ 1 จาก 2 ครั้ง/); } finally { r2(); }
});

test("none: ไม่มีฟรีใด ๆ · โบนัสยังใช้ได้ · โปรไม่พูดฟรี", async () => {
  const restore = install({ mode: "none" });
  try {
    const ctx = await buildCustomerFactsContext("Utest");
    const f = line(ctx, /^• นโยบายปัจจุบัน/);
    assert.match(f, /ปิดสิทธิ์ฟรีทุกบัญชี/); assert.match(f, /ตอนนี้ไม่มีสิทธิ์ฟรีแล้ว/);
    assert.match(line(ctx, /กติกาสิทธิ์ฟรี/), /ปิดสิทธิ์ฟรีทุกบัญชีแล้ว/);
    assert.match(line(ctx, /โปรตอนนี้/), /ไม่มีสิทธิ์ฟรีใด ๆ/);
    assert.doesNotMatch(ctx, /สิทธิ์ฟรีวันนี้เหลือ/);
  } finally { restore(); }
  const r2 = install({ mode: "none", user: { bonus_scans: 2 } });
  try { assert.match(line(await buildCustomerFactsContext("Ub"), /^• นโยบายปัจจุบัน/), /มีโบนัสจากการชวนเพื่อน 2 ครั้ง/); } finally { r2(); }
});

test("อ่าน schedule ไม่ได้ → ไม่พูดถึงประกาศ (ไม่เดา) · ไม่มีคำว่า 'ระบบ' ใน context", async () => {
  const restore = install({ mode: "daily", statusFail: true });
  try {
    const ctx = await buildCustomerFactsContext("Utest");
    assert.ok(ctx); assert.doesNotMatch(ctx, /ประกาศเปลี่ยนนโยบายแล้ว/);
    assert.doesNotMatch(ctx, /ระบบ/);
  } finally { restore(); }
});

test("orchestrator fallback ของ guard สิทธิ์ปลอมไม่สัญญาฟรีรายวันนอกโหมด daily (static)", () => {
  const src = readFileSync(new URL("../src/core/conversation/geminiFront/geminiFrontOrchestrator.service.js", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("function safeTextForBlockedClaim"), src.indexOf("export async function runGeminiFrontOrchestrator"));
  assert.match(fn, /freePolicy === "daily"/); assert.match(fn, /ฟรีรายวันยกเลิกแล้ว มีทดลองฟรีเฉพาะบัญชีใหม่/);
  const nonDaily = fn.split('if (freePolicy === "daily")')[1].split("}")[1] || "";
  assert.doesNotMatch(nonDaily, /ใช้สแกนฟรีรายวันได้ตามปกติ/, "สาขา new_customer/none/unknown ห้ามพูดฟรีรายวัน");
  assert.match(src, /safeTextForBlockedClaim\(phase1, freePolicy\)/); assert.match(src, /resolveFreePolicy\(\)/);
  const prompt = readFileSync(new URL("../src/core/conversation/geminiFront/geminiConsultPrompt.js", import.meta.url), "utf8");
  assert.match(prompt, /ปิดสิทธิ์ฟรีแล้ว/); assert.match(prompt, /ประกาศเปลี่ยนนโยบายแล้ว/); assert.match(prompt, /ยังฟรีไหม/);
});
