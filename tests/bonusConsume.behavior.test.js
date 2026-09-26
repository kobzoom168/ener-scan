/**
 * โบนัสชวนเพื่อนต้องถูกหักจริงตอนสแกน (บั๊กจริง 26 ก.ย. 2026 — staging บัญชีกบ)
 *
 * เคส: scan_jobs 2 งานถูกสร้างเป็น free_access_kind='bonus' แต่ bonus_scans ยัง 1 และไม่มี
 * REFERRAL_BONUS_SCAN_CONSUMED เลย เพราะด่านรับรูปหยิบผล checkScanAccess({userId}) (ไม่หัก)
 * จาก turnCache มาใช้แทนการเรียก consumeBonus:true
 *
 * กติกาที่ล็อกไว้:
 *   โบนัส 1 → งานที่ใช้โบนัสสำเร็จ → เหลือ 0 (หักตอนรับรูป CAS ใน DB)
 *   ดูเฉย ๆ (consumeBonus=false) ไม่แตะ DB · ผลนั้นห้ามใช้สร้างงาน
 *   ส่งพร้อมกันหลายรูป → โบนัส 1 ก้อนใช้ได้คนเดียว (CAS eq(bonus_scans, ยอดเดิม))
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
const { checkScanAccess, cachedAccessUsableForScan } = await import("../src/services/paymentAccess.service.js");
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const NOW = new Date("2026-09-26T03:00:55Z"); // เวลางานที่ 2 ของกบ
const UID = "test-bonus-user";

/**
 * fake DB ที่จำลอง CAS ของ app_users.update({bonus_scans}).eq("id").eq("bonus_scans", ยอดเดิม)
 * ฟรีรายวันหมดแล้ว (scanCountToday=5, โควตา 1) → ทางเดียวที่จะสแกนได้คือโบนัส
 */
function installFakeDb({ bonus = 1, scanCountToday = 5 }) {
  const originalFrom = supabase.from, originalRpc = supabase.rpc;
  const store = { bonus_scans: bonus, updates: 0, casFailed: 0 };
  // trial OFF (ค่าจริงบน staging) — rpc คืน data:null จะถูกตีเป็น fail-closed "trial_policy_unavailable" ซึ่งถูกต้องแต่ไม่ใช่เคสนี้
  supabase.rpc = async (name) => name === "new_customer_trial_status"
    ? { data: { enabled: false, eligible_since: null, limit: 2, eligible: false, used: 0, pending: 0 } }
    : { data: null };
  supabase.from = (table) => {
    const filters = {}; let op = "select"; let patch = null;
    const result = async () => {
      if (table === "scan_results") return { count: scanCountToday };
      if (table !== "app_users") return { data: null };
      if (op === "update") {
        // CAS: ผ่านเฉพาะเมื่อยอดใน DB ยังเท่ากับที่คำขออ่านไป
        await new Promise((r) => setTimeout(r, 1));
        if (filters.bonus_scans !== undefined && filters.bonus_scans !== store.bonus_scans) {
          store.casFailed++; return { data: null };
        }
        store.bonus_scans = patch.bonus_scans; store.updates++;
        return { data: { id: "app-user-1" } };
      }
      await new Promise((r) => setTimeout(r, 1));
      return { data: { id: "app-user-1", line_user_id: UID, paid_remaining_scans: 0, paid_until: null,
        bonus_scans: store.bonus_scans, free_scan_daily_offset: 0, free_scan_offset_date: null } };
    };
    const q = { select() { return q; }, limit() { return q; }, gte() { return q; }, lt() { return q; },
      eq(col, val) { filters[col] = val; return q; },
      update(p) { op = "update"; patch = p; return q; },
      maybeSingle: () => result(), then: (res, rej) => result().then(res, rej) };
    return q;
  };
  return { store, restore: () => { supabase.from = originalFrom; supabase.rpc = originalRpc; } };
}

test("ดูเฉย ๆ (consumeBonus=false): อนุญาตเพราะโบนัส แต่ห้ามแตะ DB และผลนั้นใช้สร้างงานไม่ได้", async () => {
  const f = installFakeDb({ bonus: 1 });
  try {
    const a = await checkScanAccess({ userId: UID, now: NOW });
    assert.equal(a.allowed, true); assert.equal(a.freeAccessKind, "bonus");
    assert.equal(a.viaBonus, true); assert.equal(a.bonusConsumed, false);
    assert.equal(a.bonusScansAvailable, 1);
    assert.equal(f.store.updates, 0, "ห้ามหักตอนแค่ดู");
    assert.equal(cachedAccessUsableForScan(a), false, "ผลที่ยังไม่หักห้ามถูก turnCache เอาไปสร้างงาน");
  } finally { f.restore(); }
});

test("โบนัส 1 → รับรูปแบบหักจริง → เหลือ 0 และผลนั้นใช้สร้างงานได้", async () => {
  const f = installFakeDb({ bonus: 1 });
  try {
    const a = await checkScanAccess({ userId: UID, now: NOW, consumeBonus: true });
    assert.equal(a.allowed, true); assert.equal(a.freeAccessKind, "bonus");
    assert.equal(a.bonusConsumed, true);
    assert.equal(f.store.bonus_scans, 0, "หักใน DB จริง");
    assert.equal(a.bonusScansAvailable, 0, "ยอดที่ส่งต่อไป LIFF/การ์ดต้องเป็นยอดหลังหัก");
    assert.equal(cachedAccessUsableForScan(a), true);
    // รอบถัดไป: โบนัสหมด ฟรีหมด → ต้องถูกกัน
    const b = await checkScanAccess({ userId: UID, now: NOW, consumeBonus: true });
    assert.equal(b.allowed, false); assert.equal(b.reason, "payment_required");
    assert.equal(f.store.bonus_scans, 0);
  } finally { f.restore(); }
});

test("ส่งพร้อมกัน 3 รูป โบนัส 1 → หักได้แค่ 1 คน ที่เหลือ payment_required (CAS)", async () => {
  const f = installFakeDb({ bonus: 1 });
  try {
    const rs = await Promise.all([1, 2, 3].map(() => checkScanAccess({ userId: UID, now: NOW, consumeBonus: true })));
    const consumed = rs.filter((r) => r.bonusConsumed === true);
    assert.equal(consumed.length, 1, `หักได้คนเดียว (ได้ ${consumed.length})`);
    assert.equal(rs.filter((r) => r.allowed).length, 1, "อนุญาตแค่คนเดียว");
    assert.ok(rs.filter((r) => !r.allowed).every((r) => r.reason === "payment_required"));
    assert.equal(f.store.bonus_scans, 0, "ห้ามติดลบ");
    assert.equal(f.store.updates, 1);
  } finally { f.restore(); }
});

test("cachedAccessUsableForScan: daily/paid/ไม่อนุญาต/หักแล้ว ใช้ต่อได้ · ผิดรูปแบบ = ไม่ใช้", () => {
  assert.equal(cachedAccessUsableForScan({ allowed: true, reason: "free", freeAccessKind: "daily", viaBonus: false }), true);
  assert.equal(cachedAccessUsableForScan({ allowed: true, reason: "paid", remaining: 3 }), true);
  assert.equal(cachedAccessUsableForScan({ allowed: false, reason: "payment_required", viaBonus: false }), true);
  assert.equal(cachedAccessUsableForScan({ allowed: true, viaBonus: true, bonusConsumed: true }), true);
  assert.equal(cachedAccessUsableForScan({ allowed: true, viaBonus: true, bonusConsumed: false }), false);
  assert.equal(cachedAccessUsableForScan({ allowed: true, viaBonus: true }), false);
  for (const bad of [null, undefined, "x", 1]) assert.equal(cachedAccessUsableForScan(bad), false);
});

test("ด่านรับรูปใน lineWebhook ต้องเช็ค cachedAccessUsableForScan ก่อนหยิบผลจาก turnCache", () => {
  const src = read("src/routes/lineWebhook.js");
  const i = src.indexOf("const accessFromParent =");
  assert.ok(i > 0);
  const block = src.slice(i, src.indexOf("} catch (accessErr)", i));
  assert.match(block, /cachedAccessUsableForScan\(turnCache\.accessDecision\)/, "reuse cache ต้องผ่านกติกาโบนัส");
  assert.match(block, /checkScanAccess\(\{ userId, consumeBonus: true \}\)/, "ทางเลือกอื่นคือเรียกแบบหักจริง");
  assert.match(src, /import \{[^}]*cachedAccessUsableForScan[^}]*\} from "\.\.\/services\/paymentAccess\.service\.js"/);
});
