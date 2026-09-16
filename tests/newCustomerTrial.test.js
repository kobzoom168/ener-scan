import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import http from "node:http";

for (const line of readFileSync(new URL("../.env.example", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=/);
  if (m) process.env[m[1]] = "test-placeholder";
}
Object.assign(process.env, { LOCAL_POSTGREST_URL: "http://127.0.0.1:9", LOCAL_POSTGREST_ANON_KEY: "test",
  OPENAI_API_KEY: "sk-test", REDIS_URL: "" });
globalThis.fetch = async () => { throw new Error("external network forbidden"); };
const { applyTrialToGate, getNewCustomerTrialStatus, saveNewCustomerTrialPolicy, buildTrialPaywallText } =
  await import("../src/services/newCustomerTrial.service.js");
const { buildQuotaRemainingReply } = await import("../src/utils/packageQuestion.util.js");
const { decideScanGate } = await import("../src/services/scanOfferAccess.resolver.js");
const { default: express } = await import("express");
const { default: createRouter } = await import("../src/routes/adminFreeTrial.routes.js");
const trial = (used = 0, eligible = true) => ({ enabled: true, eligible, used, limit: 2 });
const daily = decideScanGate({ freeQuotaPerDay: 1, freeUsedToday: 0, paidRemainingScans: 0 });

test("disabled policy preserves daily decision; old accounts get no new trial", () => {
  assert.equal(applyTrialToGate(daily, { enabled: false }), daily);
  assert.equal(applyTrialToGate(daily, trial(0, false)).allowed, false);
});
test("new account has two lifetime slots, then no daily reset; paid retains priority", () => {
  for (const [used, remaining] of [[0,2],[1,1],[2,0],[3,0]]) {
    const g = applyTrialToGate(daily, trial(used));
    assert.equal(g.remaining, remaining);
    assert.equal(g.allowed, remaining > 0);
  }
  const paid = { ...daily, reason: "paid", remaining: 4 };
  assert.equal(applyTrialToGate(paid, trial(2, false)).remaining, 4);
  assert.equal(applyTrialToGate(paid, trial(2, false)).reason, "paid");
});
test("status read errors and malformed data fail closed; no background daily fallback", async () => {
  const failure = new Error("offline");
  await assert.rejects(getNewCustomerTrialStatus("u", { rpc: async () => ({ error: failure }) }), e => e === failure);
  for (const data of [null, {}, { enabled: true, eligible: true, used: -1, limit: 2 }]) {
    await assert.rejects(getNewCustomerTrialStatus("u", { rpc: async () => ({ data }) }), /unavailable/);
  }
  assert.deepEqual(await getNewCustomerTrialStatus("u", { rpc: async () => ({ data: trial() }) }), trial());
  await assert.rejects(saveNewCustomerTrialPolicy("true"), /boolean/);
});
test("trial quota and paywall copy never promise tomorrow's daily free reset", () => {
  const offer = { packages: [{ priceThb: 49, scanCount: 4, windowHours: 24 }] };
  assert.match(buildTrialPaywallText(offer), /49 บาท 4 ครั้ง/);
  assert.doesNotMatch(buildTrialPaywallText(offer), /พรุ่งนี้|ฟรีวันนี้/);
  const access = applyTrialToGate(daily, trial(1));
  const text = buildQuotaRemainingReply({ access, freeRemainingToday: 1, freeQuotaPerDay: 1 });
  assert.match(text, /1 จากทั้งหมด 2 ครั้ง/);
  assert.doesNotMatch(text, /ฟรีวันนี้|พรุ่งนี้/);
});

test("real checkScanAccess uses lifetime authority, ignores daily offsets, preserves paid and bonus", async () => {
  const { supabase } = await import("../src/config/supabase.js");
  const { checkScanAccess } = await import("../src/services/paymentAccess.service.js");
  const originalFrom = supabase.from; const originalRpc = supabase.rpc;
  let state = trial(2); let countReads = 0; let mutations = 0;
  const user = { id: "fixture", line_user_id: "test-user", paid_remaining_scans: 0,
    paid_until: null, bonus_scans: 0, free_scan_daily_offset: 999,
    free_scan_offset_date: "2026-09-16" };
  supabase.rpc = async () => ({ data: state });
  supabase.from = table => {
    const result = () => table === "scan_results" ? (countReads++, { count: 0 }) : { data: user };
    const q = { select() { return q; }, eq() { return q; }, limit() { return q; },
      gte() { return q; }, lt() { return q; }, update() { mutations++; return q; },
      maybeSingle: async () => result(), then: (resolve, reject) => Promise.resolve(result()).then(resolve, reject) };
    return q;
  };
  try {
    const check = () => checkScanAccess({ userId: "test-user", now: new Date("2026-09-16T10:00:00Z"), consumeBonus: true });
    assert.equal((await check()).allowed, false);
    assert.equal(countReads, 0, "trial does not use daily count or reset offset");
    state = trial(1);
    assert.equal((await check()).freeScansRemaining, 1);
    state = trial(0, false);
    assert.equal((await check()).allowed, false);
    user.paid_until = "2026-10-01T00:00:00Z"; user.paid_remaining_scans = 4;
    assert.equal((await check()).reason, "paid");
    user.paid_until = null; user.paid_remaining_scans = 0; user.bonus_scans = 1;
    assert.equal((await check()).freeAccessKind, "bonus");
    assert.equal(mutations, 0, "bonus consumes only on atomic job admission");
    user.bonus_scans = 0; state = { ...trial(), enabled: false };
    assert.equal((await check()).freePolicy, "daily");
    assert.ok(countReads > 0);
    supabase.rpc = async () => ({ error: new Error("policy offline") });
    await assert.rejects(check(), /policy offline/);
  } finally { supabase.from = originalFrom; supabase.rpc = originalRpc; }
});

function request(port, path, method = "GET", body = "", admin = true) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path, method,
      headers: { "Content-Type": "application/x-www-form-urlencoded", ...(admin ? { "X-Test-Admin": "yes" } : {}) } }, res => {
      let text = "";
      res.on("data", c => { text += c; });
      res.on("end", () => resolve({ status: res.statusCode, text, location: res.headers.location }));
    });
    req.on("error", reject); req.end(body);
  });
}

test("admin switch: authentication, CSRF, explicit confirmation, save failure, ON and OFF", async () => {
  const session = { admin: { authenticated: true } }; let enabled = false; let writes = 0; let broken = false;
  const app = express();
  app.use((req, _res, next) => { req.session = req.headers["x-test-admin"] ? session : {}; next(); });
  app.use(createRouter({
    read: async () => ({ ...trial(), enabled, eligible_since: null }),
    save: async v => { if (broken) throw new Error("offline"); enabled = v; writes++; },
    offer: () => ({ freeQuotaPerDay: 1 }),
  }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  const port = server.address().port;
  try {
    assert.equal((await request(port, "/admin/free-trial", "GET", "", false)).status, 302);
    assert.equal((await request(port, "/admin/free-trial", "POST", "enabled=on", false)).status, 302);
    const page = await request(port, "/admin/free-trial");
    assert.match(page.text, /ฟรีรายวัน 1 ครั้ง/);
    assert.doesNotMatch(page.text, /name="enabled" checked/);
    assert.equal((await request(port, "/admin/free-trial", "POST", "enabled=on&confirmed=on")).status, 403);
    const csrf = session.freeTrialCsrf;
    assert.equal((await request(port, "/admin/free-trial", "POST", `csrf=${csrf}&enabled=on`)).status, 400);
    assert.equal(writes, 0);
    assert.equal((await request(port, "/admin/free-trial", "POST", `csrf=${csrf}&enabled=on&confirmed=on`)).status, 303);
    assert.equal(enabled, true);
    assert.match((await request(port, "/admin/free-trial")).text, /name="enabled" checked/);
    broken = true;
    assert.equal((await request(port, "/admin/free-trial", "POST", `csrf=${csrf}&confirmed=on`)).status, 503);
    assert.equal(enabled, true);
    broken = false;
    assert.equal((await request(port, "/admin/free-trial", "POST", `csrf=${csrf}&confirmed=on`)).status, 303);
    assert.equal(enabled, false); assert.equal(writes, 2);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
