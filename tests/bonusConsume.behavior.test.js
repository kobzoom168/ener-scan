/**
 * โบนัสชวนเพื่อน — lifecycle ใหม่ (064, 26 ก.ย. 2026)
 *
 * บั๊กจริง: ด่านรับรูปหยิบผล checkScanAccess ที่ "ยังไม่หัก" จาก turnCache → งานเป็น bonus แต่ยอดไม่ลด
 * กติกาใหม่: ดู = ไม่หัก · จอง = INSERT scan_jobs (trigger) · คืน = failed/รูปซ้ำ ครั้งเดียว
 * ชั้นนี้ทดสอบเฉพาะส่วน JS ที่ไม่ต้องใช้ DB — พฤติกรรมจริงผ่านด่านรับรูป+DB อยู่ใน
 * scripts/ops/test-bonus-reservation-integration.mjs
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
  for (const line of readFileSync(new URL("../.env.example", import.meta.url).pathname, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=/); if (m && !process.env[m[1]]) process.env[m[1]] = "test-placeholder";
  }
} catch { /* ignore */ }

const { supabase } = await import("../src/config/supabase.js");
const { checkScanAccess } = await import("../src/services/paymentAccess.service.js");
const { quotaGuardCodeFromError } = await import("../src/services/scanV2/webhookImageIngestion.service.js");
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const NOW = new Date("2026-09-26T03:00:55Z");
const UID = "test-bonus-user";

function installFakeDb({ bonus = 1, scanCountToday = 5 }) {
  const originalFrom = supabase.from, originalRpc = supabase.rpc;
  const store = { bonus_scans: bonus, writes: 0 };
  supabase.rpc = async (name) => name === "new_customer_trial_status"
    ? { data: { enabled: false, eligible_since: null, limit: 2, eligible: false, used: 0, pending: 0 } } : { data: null };
  supabase.from = (table) => {
    let write = false;
    const result = async () => {
      if (write) { store.writes++; return { data: null, error: { message: "write_forbidden_in_view" } }; }
      if (table === "scan_results") return { count: scanCountToday };
      if (table === "app_users") return { data: { id: "app-user-1", line_user_id: UID, paid_remaining_scans: 0, paid_until: null,
        bonus_scans: store.bonus_scans, free_scan_daily_offset: 0, free_scan_offset_date: null } };
      return { data: null };
    };
    const q = { select() { return q; }, limit() { return q; }, gte() { return q; }, lt() { return q; }, eq() { return q; },
      update() { write = true; return q; }, insert() { write = true; return q; }, delete() { write = true; return q; },
      maybeSingle: () => result(), then: (res, rej) => result().then(res, rej) };
    return q;
  };
  return { store, restore: () => { supabase.from = originalFrom; supabase.rpc = originalRpc; } };
}

test("ดูสิทธิ์: อนุญาตเพราะโบนัส แต่ไม่เขียน DB ไม่ว่าจะส่ง consumeBonus อะไร", async () => {
  const f = installFakeDb({ bonus: 1 });
  try {
    for (const consumeBonus of [false, true, undefined]) {
      const a = await checkScanAccess({ userId: UID, now: NOW, consumeBonus });
      assert.equal(a.allowed, true); assert.equal(a.reason, "free");
      assert.equal(a.viaBonus, true); assert.equal(a.freeAccessKind, "bonus");
      assert.equal(a.bonusScansAvailable, 1);
    }
    assert.equal(f.store.writes, 0, "ห้ามมี UPDATE/INSERT จากการดูสิทธิ์");
  } finally { f.restore(); }
});

test("โบนัส 0 + ฟรีหมด → payment_required · viaBonus=false", async () => {
  const f = installFakeDb({ bonus: 0 });
  try {
    const a = await checkScanAccess({ userId: UID, now: NOW });
    assert.equal(a.allowed, false); assert.equal(a.reason, "payment_required"); assert.equal(a.viaBonus, false);
    assert.equal(f.store.writes, 0);
  } finally { f.restore(); }
});

test("quotaGuardCodeFromError: map exception ของ trigger เท่านั้น", () => {
  assert.equal(quotaGuardCodeFromError({ message: "bonus_quota_exhausted" }), "bonus_quota_exhausted");
  assert.equal(quotaGuardCodeFromError({ message: "P0001: trial_quota_exhausted" }), "trial_quota_exhausted");
  assert.equal(quotaGuardCodeFromError({ details: "trial_not_eligible" }), "trial_not_eligible");
  for (const bad of [null, undefined, {}, { message: "connection refused" }, new Error("timeout")]) assert.equal(quotaGuardCodeFromError(bad), null);
});

test("สายเรียก: webhook ไม่หักที่รับรูปอีก · paywall เมื่อ DB กันตอนจอง · worker คืนหลังหลักฐานรูปซ้ำทุกจุด · maintenance กวาด", () => {
  const webhook = read("src/routes/lineWebhook.js");
  assert.ok(!/consumeBonus:\s*true/.test(webhook), "ห้ามมี consumeBonus:true ใน webhook อีก");
  assert.match(webhook, /ingestReason === "quota_exhausted_at_insert"[\s\S]{0,600}sendFreeQuotaExhaustedPaywallViaGateway/);
  const worker = read("src/services/scanV2/processScanJob.service.js");
  const sites = worker.split("skipQuotaDecrement:").length - 1;
  assert.equal(sites, 3, "จุดเขียนหลักฐานรูปซ้ำ 3 จุด");
  assert.equal(worker.split("releaseBonusReservation(jobId)").length - 1, 3, "ทุกจุดต้องตามด้วยการคืนโบนัส");
  const maint = read("src/workers/maintenanceWorker.js");
  assert.match(maint, /rpc\("sweep_bonus_releases"/);
  const access = read("src/services/paymentAccess.service.js");
  assert.ok(!/update\(\{\s*bonus_scans/.test(access), "checkScanAccess ต้องไม่มี UPDATE bonus_scans");
});
