/**
 * สิทธิ์ฟรี 3 โหมด (daily / new_customer / none) + ตั้งเวลา — sql/067 (Codex/กบ 14 ต.ค. 2026)
 *
 * ครอบ: โหมด none ทุกด่านพูดเรื่องเดียวกัน (gate / copy LINE / LIFF / paywall / offer pool) · ไม่มีคำสัญญาฟรีในโหมด none ·
 *       แพ็ก/โบนัสยังใช้ได้ · status RPC ที่ mode ขัดกับ enabled = fail-closed · store ส่ง args ถูก + แปล error ·
 *       หน้า Admin: session-only, CSRF, แปลงเวลาไทย, เปลี่ยนทันที/ตั้งเวลา/ยกเลิก, แสดง error 72h, key ไม่พร้อม = อ่านอย่างเดียว ·
 *       หน้าเก่า redirect/410 · worker มี sweep
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import http from "node:http";

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

const T = await import("../src/services/newCustomerTrial.service.js");
const C = await import("../src/services/entitlementCopy.service.js");
const S = await import("../src/services/freePolicy.store.js");
const { buildScanOfferReply } = await import("../src/services/scanOffer.copy.js");
const { resolveScanOfferAccessContext, decideScanGate } = await import("../src/services/scanOfferAccess.resolver.js");
const { quotaGuardCodeFromError } = await import("../src/services/scanV2/webhookImageIngestion.service.js");
const { default: express } = await import("express");
const { default: createRouter, bangkokLocalToIso } = await import("../src/routes/adminFreePolicy.routes.js");
const { default: createLegacyRouter } = await import("../src/routes/adminFreeTrial.routes.js");
const { requireAdminSessionOnly } = await import("../src/middleware/requireAdmin.js");
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const OFFER = { configVersion: "t", freeQuotaPerDay: 1, paidPriceThb: 49, paidScanCount: 4, paidWindowHours: 24, defaultPackageKey: "p49",
  packages: [{ key: "p49", label: "49", active: true, priceThb: 49, scanCount: 4, windowHours: 24 }] };
const daily = decideScanGate({ freeQuotaPerDay: 1, freeUsedToday: 0, paidRemainingScans: 0 });
const st = (mode, extra = {}) => ({ enabled: mode === "new_customer", mode, daily_enabled: mode === "daily", eligible: false, used: 0, pending: 0, limit: 2, eligible_since: null, ...extra });
const noneAccess = (extra = {}) => ({ allowed: false, reason: "payment_required", remaining: 0, usedScans: 0, freeScansLimit: 0, freeScansRemaining: 0,
  paidUntil: null, paidRemainingScans: 0, freePolicy: "none", trialEligible: false, bonusScansAvailable: 0, ...extra });
const forbid = (text, policy) => assert.equal(C.findForbiddenPhrase(text, policy), null, `${policy}: "${text}"`);

test("gate: none ปิดฟรีทุกบัญชี (0 ไม่ใช่ 1) · paid คงเดิม · daily/new_customer เหมือนเดิม · DB เก่าไม่มี mode → อนุมานจาก enabled", () => {
  const g = T.applyTrialToGate(daily, st("none"));
  assert.equal(g.allowed, false); assert.equal(g.freePolicy, "none"); assert.equal(g.freeScansLimit, 0); assert.equal(g.freeScansRemaining, 0); assert.equal(g.trialEligible, false);
  const paid = T.applyTrialToGate({ ...daily, reason: "paid", remaining: 4, allowed: true }, st("none"));
  assert.equal(paid.allowed, true); assert.equal(paid.reason, "paid"); assert.equal(paid.remaining, 4); assert.equal(paid.freePolicy, "none");
  assert.equal(T.applyTrialToGate(daily, st("daily")), daily);
  assert.equal(T.applyTrialToGate(daily, st("new_customer", { eligible: true })).freePolicy, "new_customer");
  assert.equal(T.freePolicyModeOf({ enabled: true }), "new_customer"); assert.equal(T.freePolicyModeOf({ enabled: false }), "daily"); assert.equal(T.freePolicyModeOf(st("none")), "none");
});

test("status RPC: mode แปลก หรือ mode ขัดกับ enabled → fail-closed · mode none ผ่าน validation", async () => {
  for (const data of [st("bogus"), { ...st("none"), enabled: true }, { ...st("daily"), enabled: true }, { ...st("new_customer"), enabled: false }]) {
    await assert.rejects(T.getNewCustomerTrialStatus("u", { rpc: async () => ({ data }) }), /unavailable/);
  }
  assert.equal((await T.getNewCustomerTrialStatus("u", { rpc: async () => ({ data: st("none") }) })).mode, "none");
  assert.equal((await T.getNewCustomerTrialStatus("u", { rpc: async () => ({ data: { enabled: false, eligible: false, used: 0, limit: 2 } }) })).mode, "daily", "pre-067 shape");
});

test("resolveFreePolicy อ่าน mode จาก DB (none ได้) · ล้ม = unknown", async () => {
  assert.equal(await C.resolveFreePolicy({ getNewCustomerTrialStatus: async () => st("none") }), "none");
  assert.equal(await C.resolveFreePolicy({ getNewCustomerTrialStatus: async () => st("daily") }), "daily");
  assert.equal(await C.resolveFreePolicy({ getNewCustomerTrialStatus: async () => ({ enabled: true }) }), "new_customer");
  assert.equal(await C.resolveFreePolicy({ getNewCustomerTrialStatus: async () => { throw new Error("x"); } }), "unknown");
});

test("copy โหมด none: ทุกสถานะไม่สัญญาฟรี/ทดลองฟรี/พรุ่งนี้ · โบนัส/แพ็กยังบอกว่ามีสิทธิ์ · soft-close/welcome ไม่พูดฟรี", () => {
  const cases = [
    ["existing_no_rights", noneAccess()],
    ["paid_expired", noneAccess({ paidUntil: "2026-08-11T18:35:26Z" })],
    ["bonus", noneAccess({ allowed: true, reason: "free", remaining: 1, bonusScansAvailable: 1 })],
    ["paid", noneAccess({ allowed: true, reason: "paid", remaining: 4, paidUntil: "2027-01-01T00:00:00Z" })],
  ];
  for (const [state, access] of cases) {
    const es = C.resolveEntitlementState(access);
    assert.equal(es.policy, "none"); assert.equal(es.state, state, state); assert.equal(es.freeLeft, 0);
    const line = C.buildEntitlementStatusLine(es); forbid([line.headline, line.detail, ...line.breakdown].join(" "), "none");
    const pw = C.buildPaywallCopy(es, { offer: OFFER }); forbid(pw.textLines.join("\n"), "none"); forbid(pw.altText, "none");
    if (state === "bonus" || state === "paid") assert.doesNotMatch(line.headline, /ไม่มีสิทธิ์|หมด/);
  }
  forbid(C.buildSoftCloseCopy("none"), "none"); assert.doesNotMatch(C.buildSoftCloseCopy("none"), /พรุ่งนี้/);
  forbid(C.buildFirstScanInviteLine("none"), "none");
  const W = read("src/utils/webhookText.util.js"); assert.match(W, /buildFirstScanInviteLine\(policy/);
  // โหมด none ยังต้องไม่หลุดคำต้องห้ามของ trial ด้วย (none เข้มกว่า new_customer)
  assert.notEqual(C.findForbiddenPhrase("ลูกค้าใหม่ทดลองฟรี 2 ครั้ง", "none"), null);
  assert.equal(C.findForbiddenPhrase("ลูกค้าใหม่ทดลองฟรี 2 ครั้ง", "new_customer"), null);
});

test("offer pool โหมด none → existing_no_rights_trial เสมอ (ไม่มีฟรีรายวัน/ทดลองฟรี) ทั้ง primary และ alternates", () => {
  const ctx = { ...resolveScanOfferAccessContext({ offer: { ...OFFER, freeQuotaPerDay: 0 }, freeUsedToday: 0, paidUntil: null, paidRemainingScans: 0 }), freePolicy: "none", trialEligible: false };
  const r = buildScanOfferReply({ offer: OFFER, accessContext: ctx, gate: { allowed: false, reason: "payment_required" }, userId: "u1" });
  forbid(r.primaryText, "none"); for (const a of r.alternateTexts || []) forbid(a, "none");
  assert.match(r.primaryText, /เติมสิทธิ์เพื่อสแกนองค์ใหม่/);
});

test("checkScanAccess + buildPaymentGateReply โหมด none: ไม่นับฟรีรายวัน · ไม่ได้ฟรี · paid/bonus ยังใช้ได้ · paywall ไม่พูดฟรี · LIFF rights สอดคล้อง", async () => {
  const { supabase } = await import("../src/config/supabase.js");
  const { checkScanAccess, buildPaymentGateReply } = await import("../src/services/paymentAccess.service.js");
  const { resolveLiffRights } = await import("../src/routes/liff.routes.js");
  const originalFrom = supabase.from; const originalRpc = supabase.rpc;
  let countReads = 0;
  const user = { id: "fixture", line_user_id: "test-user", paid_remaining_scans: 0, paid_until: null, bonus_scans: 0, free_scan_daily_offset: 0, free_scan_offset_date: null };
  supabase.rpc = async () => ({ data: st("none") });
  supabase.from = (table) => {
    const result = () => table === "scan_results" ? (countReads++, { count: 0 }) : { data: user };
    const q = { select() { return q; }, eq() { return q; }, limit() { return q; }, gte() { return q; }, lt() { return q; }, update() { return q; },
      maybeSingle: async () => result(), then: (res, rej) => Promise.resolve(result()).then(res, rej) };
    return q;
  };
  try {
    const check = () => checkScanAccess({ userId: "test-user", now: new Date("2026-10-20T03:00:00Z") });
    let a = await check();
    assert.equal(a.allowed, false); assert.equal(a.freePolicy, "none"); assert.equal(a.freeScansLimit, 0); assert.equal(a.freeScansRemaining, 0); assert.equal(a.freeAccessKind, "none"); assert.equal(a.trialPending, 0);
    assert.equal(countReads, 0, "none ไม่นับสแกนวันนี้");
    const reply = await buildPaymentGateReply({ decision: a, userId: "test-user" });
    forbid(reply.fallbackText, "none"); assert.equal(reply.scanOffer.scanOfferMeta.freePolicy, "none"); assert.match(reply.fallbackText, /เติมสิทธิ์เพื่อสแกนองค์ใหม่/);
    const rights = await resolveLiffRights("test-user", a);
    assert.deepEqual([rights.freePolicy, rights.freeLeft, rights.total, rights.trialEligible, rights.unavailable], ["none", 0, 0, false, false]);
    user.bonus_scans = 2; a = await check();
    assert.equal(a.allowed, true); assert.equal(a.freeAccessKind, "bonus"); assert.equal(a.remaining, 2); assert.equal((await resolveLiffRights("test-user", a)).bonusLeft, 2);
    user.bonus_scans = 0; user.paid_until = "2026-12-01T00:00:00Z"; user.paid_remaining_scans = 4; a = await check();
    assert.equal(a.reason, "paid"); assert.equal(a.remaining, 4); assert.equal((await resolveLiffRights("test-user", a)).paidLeft, 4);
  } finally { supabase.from = originalFrom; supabase.rpc = originalRpc; }
});

test("ด่านอื่นรู้จัก none: ingestion guard code free_policy_none · webhook pre_object_check · LIFF client zero-state · worker sweep", () => {
  assert.equal(quotaGuardCodeFromError(new Error('insert failed: free_policy_none')), "free_policy_none");
  assert.match(read("src/routes/lineWebhook.js"), /routeAccessDecision\?\.freePolicy === "none"/);
  const liff = read("src/routes/liff.routes.js");
  assert.match(liff, /else if\(rights\.freePolicy === "none"\)\{/);
  const noneBranch = liff.slice(liff.indexOf('else if(rights.freePolicy === "none"){'), liff.indexOf("} else {", liff.indexOf('else if(rights.freePolicy === "none"){')));
  const noneShown = [...noneBranch.matchAll(/textContent = [\s\S]*?;/g)].map((m) => m[0]).join("\n");
  assert.ok(noneShown.includes("ยังไม่มีสิทธิ์สำหรับสแกนองค์ใหม่") && noneShown.includes("แพ็กสแกนหมดอายุแล้ว"), "none zero-state shows real text");
  assert.ok(!/ทดลองฟรี|พรุ่งนี้|ฟรีวันนี้|หลังเที่ยงคืน/.test(noneShown), "LIFF zero-state none must not promise free/trial");
  assert.match(liff, /j\.freePolicy === "none" \? "ฟรี"/);
  const w = read("src/workers/maintenanceWorker.js");
  assert.match(w, /async function sweepFreePolicySchedule/); assert.match(w, /await sweepFreePolicySchedule\(\);/); assert.match(w, /applyDueFreePolicySchedule/);
  assert.match(read("src/app.js"), /createAdminFreePolicyRouter\(\)/);
});

test("store: readiness (key ใดก็ได้ใน 2 ตัว) · args RPC ถูกต้อง · แปลง error (RAISE text / 42501 / ไม่มี key) · โหมดผิดไม่ยิง RPC", async () => {
  assert.equal(S.freePolicyStoreReadiness({ LOCAL_POSTGREST_URL: "http://x" }).ready, false);
  assert.equal(S.freePolicyStoreReadiness({ LOCAL_POSTGREST_URL: "http://x", TELEGRAM_CONFIG_DB_KEY: "a.b.c" }).ready, true);
  assert.equal(S.freePolicyStoreReadiness({ LOCAL_POSTGREST_URL: "http://x", FREE_POLICY_DB_KEY: "a.b.c" }).keySource, "FREE_POLICY_DB_KEY");
  const calls = []; const client = { rpc: async (name, args) => { calls.push([name, args]); return { data: { mode: "none" } }; } };
  await S.setFreePolicyMode({ mode: "none", actor: "kob", announcedAt: "2026-10-14T01:00:00+07:00", cancelPending: true }, { client });
  assert.deepEqual(calls.at(-1), ["set_free_policy_mode", { p_mode: "none", p_actor: "kob", p_announced_at: "2026-10-13T18:00:00.000Z", p_cancel_pending: true }]);
  await S.scheduleFreePolicy({ mode: "new_customer", effectiveAt: "2026-10-20T09:00:00+07:00", announcedAt: null, actor: "kob" }, { client });
  assert.deepEqual(calls.at(-1), ["free_policy_schedule_set", { p_target_mode: "new_customer", p_effective_at: "2026-10-20T02:00:00.000Z", p_announced_at: null, p_actor: "kob" }]);
  await S.cancelFreePolicySchedule({ id: "7", actor: "kob" }, { client }); assert.deepEqual(calls.at(-1), ["free_policy_schedule_cancel", { p_id: 7, p_actor: "kob" }]);
  await S.applyDueFreePolicySchedule({ client }); assert.equal(calls.at(-1)[0], "free_policy_schedule_apply_due");
  const n = calls.length;
  await assert.rejects(S.setFreePolicyMode({ mode: "bogus", actor: "k" }, { client }), (e) => e.code === "invalid_mode");
  await assert.rejects(S.scheduleFreePolicy({ mode: "none", effectiveAt: "", actor: "k" }, { client }), (e) => e.code === "effective_at_must_be_future");
  assert.equal(calls.length, n, "invalid input never reaches RPC");
  assert.equal(S.rpcErrorCode({ message: "notice_period_72h", code: "P0001" }), "notice_period_72h");
  assert.equal(S.rpcErrorCode({ message: "permission denied for function set_free_policy_mode", code: "42501" }), "permission_denied");
  const failing = { rpc: async () => ({ error: { message: "schedule_pending", code: "P0001" } }) };
  await assert.rejects(S.setFreePolicyMode({ mode: "daily", actor: "k" }, { client: failing }), (e) => e.code === "schedule_pending");
  assert.throws(() => S.freePolicyDbClient({ LOCAL_POSTGREST_URL: "http://x" }), (e) => e.code === "db_key_missing");
  for (const code of ["notice_required", "notice_period_72h", "schedule_pending", "permission_denied", "db_key_missing"]) assert.ok(S.RPC_ERROR_TH[code]);
});

test("bangkokLocalToIso: datetime-local เวลาไทย → UTC · ว่าง = null · ผิดรูป = error", () => {
  assert.equal(bangkokLocalToIso("2026-10-20T09:00"), "2026-10-20T02:00:00.000Z");
  assert.equal(bangkokLocalToIso("2026-10-20T09:00:30"), "2026-10-20T02:00:30.000Z");
  assert.equal(bangkokLocalToIso(""), null); assert.equal(bangkokLocalToIso(undefined), null);
  assert.throws(() => bangkokLocalToIso("20/10/2026 09:00"), (e) => e.code === "invalid_datetime");
});

// ───────── หน้า Admin ─────────
function fakeStore({ ready = true, status = st("daily"), schedule = null, audit = [], fail = null } = {}) {
  const calls = [];
  return { calls,
    FREE_POLICY_MODES: S.FREE_POLICY_MODES, MODE_LABEL_TH: S.MODE_LABEL_TH, RPC_ERROR_TH: S.RPC_ERROR_TH, NOTICE_HOURS: S.NOTICE_HOURS,
    freePolicyStoreReadiness: () => ready ? { ready: true, missing: [] } : { ready: false, missing: ["FREE_POLICY_DB_KEY|TELEGRAM_CONFIG_DB_KEY"] },
    applyDueFreePolicySchedule: async () => { calls.push(["apply_due"]); return { applied: false }; },
    getFreePolicyStatus: async () => ({ ...status, stored_mode: status.stored_mode ?? status.mode, schedule, last_applied: null }),
    listFreePolicyAudit: async () => audit,
    setFreePolicyMode: async (p) => { calls.push(["set", p]); if (fail) { const e = new Error(fail); e.code = fail; throw e; } return { mode: p.mode }; },
    scheduleFreePolicy: async (p) => { calls.push(["schedule", p]); if (fail) { const e = new Error(fail); e.code = fail; throw e; } return { id: 9, status: "pending" }; },
    cancelFreePolicySchedule: async (p) => { calls.push(["cancel", p]); if (fail) { const e = new Error(fail); e.code = fail; throw e; } return { id: Number(p.id), status: "cancelled" }; },
  };
}
function boot({ store, session = { admin: { authenticated: true } }, realAuth = false }) {
  const app = express();
  app.use((req, _res, next) => { req.session = session; next(); });
  app.use(createRouter({ store, offer: () => ({ freeQuotaPerDay: 1 }), envSrc: { APP_ENV: "staging", LOCAL_POSTGREST_URL: "http://127.0.0.1:9" }, ...(realAuth ? {} : { authorize: (_q, _r, n) => n() }) }));
  app.use(createLegacyRouter({ authorize: (_q, _r, n) => n() }));
  return new Promise((resolve) => { const server = app.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port, session })); });
}
const form = (o) => Object.entries(o).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
function req(port, method, path, { body = "", headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ hostname: "127.0.0.1", port, path, method, headers: { "Content-Type": "application/x-www-form-urlencoded", Connection: "close", ...headers } }, (res) => {
      let text = ""; res.on("data", (c) => { text += c; }); res.on("end", () => resolve({ status: res.statusCode, text, location: res.headers.location }));
    });
    r.on("error", reject); r.end(body);
  });
}
const close = (server) => new Promise((r) => { server.closeAllConnections?.(); server.close(r); });

test("Admin GET: แสดง 3 โหมด + โหมดที่มีผล + cutoff + กำหนดการ + ประวัติ · reconcile ตอนเปิด · CSRF ออกใน session · หน้าเก่า 302/410", async () => {
  const store = fakeStore({ status: st("daily", { eligible_since: "2026-09-26T09:07:59Z" }), schedule: { id: 4, target_mode: "none", effective_at: "2026-10-20T02:00:00Z", created_by: "kob", created_at: "2026-10-14T01:00:00Z", announced_at: "2026-10-14T00:00:00Z" },
    audit: [{ at: "2026-10-14T01:00:00Z", action: "schedule_set", from_mode: "daily", to_mode: "none", actor: "kob", announced_at: "2026-10-14T00:00:00Z", detail: { effective_at: "2026-10-20T02:00:00Z" } }] });
  const { server, port, session } = await boot({ store });
  try {
    const page = await req(port, "GET", "/admin/free-policy");
    assert.equal(page.status, 200);
    for (const s of ["โหมดที่มีผลตอนนี้", "ฟรีรายวัน", "ลูกค้าใหม่ทดลองฟรี 2 ครั้ง", "ปิดสิทธิ์ฟรี", 'value="daily" checked', "กำหนดการที่รออยู่", "ยกเลิกกำหนดการนี้", 'name="schedule_id" value="4"', "Cutoff ลูกค้าใหม่", "2026-09-26T09:07:59", "72 ชั่วโมง", "schedule_set", "Environment: <strong>staging</strong>", "ยกเลิกกำหนดการที่รออยู่ด้วย"]) assert.ok(page.text.includes(s), s);
    assert.ok(session.freePolicyCsrf); assert.ok(page.text.includes(session.freePolicyCsrf));
    assert.deepEqual(store.calls, [["apply_due"]], "GET reconciles due schedule once, no writes");
    const legacy = await req(port, "GET", "/admin/free-trial"); assert.equal(legacy.status, 302); assert.equal(legacy.location, "/admin/free-policy");
    assert.equal((await req(port, "POST", "/admin/free-trial", { body: "enabled=on" })).status, 410);
  } finally { await close(server); }
});

test("Admin POST: CSRF · ยืนยัน · เปลี่ยนทันที (แปลงเวลาไทย, cancel_pending) · ตั้งเวลา · ยกเลิก · error จาก DB แปลไทยไม่เปลี่ยนค่า · key ไม่พร้อม = 503 + ปุ่มปิด", async () => {
  const store = fakeStore({ schedule: { id: 4, target_mode: "none", effective_at: "2026-10-20T02:00:00Z" } });
  const { server, port, session } = await boot({ store });
  try {
    await req(port, "GET", "/admin/free-policy"); const csrf = session.freePolicyCsrf; store.calls.length = 0;
    assert.equal((await req(port, "POST", "/admin/free-policy", { body: form({ mode: "none", confirmed: "1" }) })).status, 403);
    assert.equal((await req(port, "POST", "/admin/free-policy", { body: form({ csrf, mode: "none" }) })).status, 400, "no confirmation");
    assert.equal((await req(port, "POST", "/admin/free-policy", { body: form({ csrf, mode: "weird", confirmed: "1" }) })).status, 400);
    assert.equal(store.calls.filter((c) => c[0] !== "apply_due").length, 0, "rejected requests never write");
    let r = await req(port, "POST", "/admin/free-policy", { body: form({ csrf, mode: "none", when: "now", announced_at: "2026-10-11T08:00", cancel_pending: "1", confirmed: "1" }) });
    assert.equal(r.status, 303); assert.equal(r.location, "/admin/free-policy?saved=1");
    assert.deepEqual(store.calls.at(-1), ["set", { mode: "none", actor: "admin", announcedAt: "2026-10-11T01:00:00.000Z", cancelPending: true }]);
    r = await req(port, "POST", "/admin/free-policy", { body: form({ csrf, mode: "new_customer", when: "schedule", effective_at: "2026-10-20T09:00", announced_at: "2026-10-14T09:00", confirmed: "1" }) });
    assert.equal(r.status, 303); assert.equal(r.location, "/admin/free-policy?saved=scheduled");
    assert.deepEqual(store.calls.at(-1), ["schedule", { mode: "new_customer", effectiveAt: "2026-10-20T02:00:00.000Z", announcedAt: "2026-10-14T02:00:00.000Z", actor: "admin" }]);
    r = await req(port, "POST", "/admin/free-policy", { body: form({ csrf, mode: "none", when: "schedule", confirmed: "1" }) });
    assert.equal(r.status, 400); assert.match(r.text, /เวลามีผลต้องอยู่ในอนาคต/);
    r = await req(port, "POST", "/admin/free-policy", { body: form({ csrf, action: "cancel", schedule_id: "4" }) });
    assert.equal(r.status, 303); assert.equal(r.location, "/admin/free-policy?saved=cancelled"); assert.deepEqual(store.calls.at(-1), ["cancel", { id: "4", actor: "admin" }]);
    r = await req(port, "POST", "/admin/free-policy", { body: form({ csrf, mode: "none", when: "now", announced_at: "2026-10-14T09:00", confirmed: "1" }) });
    assert.equal(r.status, 303, "72h is decided by DB, not the page");
  } finally { await close(server); }
  for (const [code, http, snippet] of [["notice_period_72h", 400, "อย่างน้อย 72 ชั่วโมง"], ["notice_required", 400, "เวลาที่ประกาศลูกค้าแล้ว"], ["schedule_pending", 400, "มีกำหนดการรออยู่"], ["permission_denied", 503, "ไม่มีสิทธิ์เรียก RPC"]]) {
    const s2 = fakeStore({ fail: code }); const b = await boot({ store: s2 });
    try {
      await req(b.port, "GET", "/admin/free-policy");
      const r = await req(b.port, "POST", "/admin/free-policy", { body: form({ csrf: b.session.freePolicyCsrf, mode: "none", when: "now", confirmed: "1" }) });
      assert.equal(r.status, http, code); assert.ok(r.text.includes(snippet), `${code}: ${snippet}`); assert.ok(r.text.includes("โหมดที่มีผลตอนนี้"), "re-rendered with real state");
    } finally { await close(b.server); }
  }
  const s3 = fakeStore({ ready: false }); const c = await boot({ store: s3 });
  try {
    await req(c.port, "GET", "/admin/free-policy");
    const page = await req(c.port, "GET", "/admin/free-policy");
    assert.match(page.text, /ops ยังไม่ตั้ง FREE_POLICY_DB_KEY/); assert.match(page.text, /name="mode" value="none"  disabled/);
    const r = await req(c.port, "POST", "/admin/free-policy", { body: form({ csrf: c.session.freePolicyCsrf, mode: "none", when: "now", confirmed: "1" }) });
    assert.equal(r.status, 503); assert.equal(s3.calls.filter((x) => x[0] === "set").length, 0);
  } finally { await close(c.server); }
});

test("Admin: กำหนดการที่ถึงเวลาแล้ว (worker ยังไม่บันทึก) → แสดง 'มีผลแล้ว' ไม่มีปุ่มยกเลิก ไม่มีช่อง cancel_pending · error schedule_already_effective แปลไทย", async () => {
  const due = fakeStore({ status: st("new_customer", { stored_mode: "daily", eligible_since: "2026-10-14T02:00:00Z" }), schedule: { id: 5, target_mode: "new_customer", effective_at: "2026-10-14T02:00:00Z", created_by: "kob", created_at: "2026-10-10T01:00:00Z" } });
  const d = await boot({ store: due });
  try {
    const page = await req(d.port, "GET", "/admin/free-policy");
    assert.ok(page.text.includes("กำหนดการถึงเวลาแล้ว (มีผลกับลูกค้าแล้ว รอระบบบันทึก)"), "honest label");
    assert.ok(page.text.includes("ยกเลิกย้อนหลังไม่ได้"), "explains irreversibility");
    assert.ok(!page.text.includes("ยกเลิกกำหนดการนี้"), "no cancel button"); assert.ok(!page.text.includes('name="cancel_pending"'), "no cancel_pending checkbox");
    assert.ok(page.text.includes("ค่าที่บันทึกเดิม"), "shows stored vs effective mismatch");
    assert.ok(page.text.includes('value="new_customer" checked'), "radio reflects effective mode");
  } finally { await close(d.server); }
  const fut = fakeStore({ schedule: { id: 6, target_mode: "none", effective_at: "2999-01-01T00:00:00Z" } });
  const g = await boot({ store: fut });
  try {
    const page = await req(g.port, "GET", "/admin/free-policy");
    assert.ok(page.text.includes("ยกเลิกกำหนดการนี้") && page.text.includes('name="cancel_pending"'), "future schedule keeps cancel controls");
  } finally { await close(g.server); }
  const failing = fakeStore({ fail: "schedule_already_effective", schedule: { id: 7, target_mode: "none", effective_at: "2026-10-14T02:00:00Z" } });
  const h = await boot({ store: failing });
  try {
    await req(h.port, "GET", "/admin/free-policy");
    const r = await req(h.port, "POST", "/admin/free-policy", { body: form({ csrf: h.session.freePolicyCsrf, action: "cancel", schedule_id: "7" }) });
    assert.equal(r.status, 400); assert.ok(r.text.includes("ยกเลิกย้อนหลังไม่ได้"), "Thai error for schedule_already_effective");
  } finally { await close(h.server); }
  assert.ok(S.RPC_ERROR_TH.schedule_already_effective && S.RPC_ERROR_TH.free_policy_protected);
});

test("auth จริง: session ว่าง + legacy x-admin-token → 302 ไม่เรนเดอร์/ไม่บันทึก · session login → 200", async () => {
  process.env.ADMIN_TOKEN = "legacy-secret";
  const store = fakeStore();
  const anon = await boot({ store, session: {}, realAuth: true });
  try {
    const g = await req(anon.port, "GET", "/admin/free-policy", { headers: { "x-admin-token": "legacy-secret" } });
    assert.equal(g.status, 302); assert.match(g.location, /\/admin\/login/);
    const p = await req(anon.port, "POST", "/admin/free-policy", { body: form({ mode: "none", confirmed: "1" }), headers: { "x-admin-token": "legacy-secret" } });
    assert.equal(p.status, 302); assert.equal(store.calls.length, 0);
  } finally { await close(anon.server); }
  const logged = await boot({ store, session: { admin: { authenticated: true } }, realAuth: true });
  try { assert.equal((await req(logged.port, "GET", "/admin/free-policy")).status, 200); } finally { await close(logged.server); }
  assert.equal(typeof requireAdminSessionOnly, "function");
});
