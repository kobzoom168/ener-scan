// POST /admin/payments/:id/settlement (sql/069 รอบ 3 — Codex): session-only + CSRF · actor จาก session.admin.loginAt · store → render คอลัมน์ settlement
//  - legacy ADMIN_TOKEN อย่างเดียว → ปฏิเสธ (ไม่เรียก ops) · login แต่ CSRF ผิด → 403 · login + CSRF ถูก → ผ่าน และ actor = admin_dashboard:<loginAt>
//  - หน้ารายการ: store จริง (getPaymentsForAdminByStatus) + client ปลอมที่เคารพ select projection → แถวมี settlement_status → render ป้าย "เงินรอดำเนินการ"
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
for (const [k, v] of Object.entries({ SUPABASE_URL: "http://127.0.0.1:9", LOCAL_POSTGREST_URL: "http://127.0.0.1:9", LOCAL_POSTGREST_ANON_KEY: "x", LOCAL_POSTGREST_SERVICE_KEY: "x", SUPABASE_SERVICE_ROLE_KEY: "x", OPENAI_API_KEY: "sk-test", CHANNEL_ACCESS_TOKEN: "t", CHANNEL_SECRET: "s", GEMINI_API_KEY: "g", REDIS_URL: "", ADMIN_TOKEN: "legacy-secret-token" })) process.env[k] ??= v;
globalThis.fetch = async () => { throw new Error("external network forbidden"); };
const { default: createRouter } = await import("../src/routes/adminPaymentsDashboard.routes.js");
const { getPaymentsForAdminByStatus } = await import("../src/stores/payments.db.js");
const { env } = await import("../src/config/env.js");

const PID = "c9d2b025-e7a6-49c3-aef2-41122ebb73f8";
const LOGIN_AT = "2026-10-20T06:12:33.123Z";
/** client PostgREST ปลอม: คืนเฉพาะคอลัมน์ที่ query เลือกจริง (projection) — ถ้า select ไม่มี settlement_* หน้าเว็บจะไม่เห็น */
function fakeSupabase(rowsAll) {
  const calls = [];
  const project = (sel, row) => {
    const cols = String(sel).replace(/\s+/g, " ").split(",").map((c) => c.trim()).filter(Boolean);
    const out = {};
    for (const c of cols) {
      if (c.startsWith("app_users")) out.app_users = row.app_users ?? null;
      else if (c in row) out[c] = row[c];
    }
    return out;
  };
  return { calls, from(table) {
    const q = { table, sel: "*", filters: [] };
    const chain = {
      select(sel) { q.sel = sel; return chain; }, eq(k, v) { q.filters.push([k, v]); return chain; }, ilike() { return chain; },
      order() { return chain; }, limit() { return chain; },
      then(res, rej) { calls.push(q); const data = rowsAll.filter((r) => q.filters.every(([k, v]) => String(r[k]) === String(v))).map((r) => project(q.sel, r)); return Promise.resolve({ data, error: null }).then(res, rej); },
    };
    return chain;
  } };
}
function boot({ session, ops, rows = [] }) {
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use((req, _res, next) => { req.session = session; next(); });
  const client = fakeSupabase(rows);
  app.use(createRouter(null, { paymentOps: ops, listPayments: (args) => getPaymentsForAdminByStatus(args, { client }), statusCounts: async () => ({ pending_verify: 0, awaiting_payment: 0, paid: 0, rejected: rows.length }) }));
  return new Promise((resolve) => { const server = app.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port, session, client })); });
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
const fakeOps = () => { const calls = []; return { calls, resolveSettlement: async (a) => { calls.push(a); return { ok: true, settlementStatus: a.status }; } }; };
const quiet = async (fn) => { const ol = console.log; console.log = () => {}; try { return await fn(); } finally { console.log = ol; } };

test("settlement: legacy x-admin-token/query/body อย่างเดียว (ไม่มี session) → 302 login หรือ 401 JSON · ops ไม่ถูกเรียก", async () => {
  assert.equal(env.ADMIN_TOKEN, "legacy-secret-token", "เทสต์ต้องมี ADMIN_TOKEN เพื่อพิสูจน์ว่า route ไม่รับ");
  const ops = fakeOps(); const b = await boot({ session: {}, ops });
  try {
    const body = form({ csrf: "whatever", settlement_status: "refunded", settlement_note: "โอนคืนแล้ว 10 บาท" });
    const h = await req(b.port, "POST", `/admin/payments/${PID}/settlement`, { body, headers: { "x-admin-token": "legacy-secret-token" } });
    assert.equal(h.status, 302); assert.match(h.location, /\/admin\/login/);
    const qy = await req(b.port, "POST", `/admin/payments/${PID}/settlement?token=legacy-secret-token`, { body });
    assert.equal(qy.status, 302);
    const bd = await req(b.port, "POST", `/admin/payments/${PID}/settlement`, { body: body + "&token=legacy-secret-token" });
    assert.equal(bd.status, 302);
    const j = await req(b.port, "POST", `/admin/payments/${PID}/settlement`, { body, headers: { "x-admin-token": "legacy-secret-token", Accept: "application/json" } });
    assert.equal(j.status, 401); assert.match(j.text, /unauthorized/);
    assert.equal(ops.calls.length, 0, "legacy token ห้ามถึง ops");
  } finally { await close(b.server); }
});

test("settlement: login แล้วแต่ CSRF ผิด/ไม่มี/ยังไม่ออก → 403 ไม่เรียก ops · login + CSRF ถูก → redirect settlement=ok และ actor = admin_dashboard:<loginAt 19 ตัวแรก>", async () => {
  const ops = fakeOps(); const session = { admin: { authenticated: true, loginAt: LOGIN_AT } };
  const b = await boot({ session, ops });
  try {
    const base = { settlement_status: "refunded", settlement_note: "โอนคืนแล้ว 10 บาท slip#123" };
    // ยังไม่เคยเปิดหน้ารายละเอียด → ไม่มี csrf ใน session → ปฏิเสธ
    let r = await req(b.port, "POST", `/admin/payments/${PID}/settlement`, { body: form({ ...base, csrf: "abc" }) });
    assert.equal(r.status, 403); assert.match(r.text, /csrf_invalid/);
    session.paymentOpsCsrf = "0123456789abcdef0123456789abcdef0123456789abcdef";
    r = await req(b.port, "POST", `/admin/payments/${PID}/settlement`, { body: form({ ...base, csrf: "0123456789abcdef0123456789abcdef0123456789abcdeX" }) });
    assert.equal(r.status, 403);
    r = await req(b.port, "POST", `/admin/payments/${PID}/settlement`, { body: form(base) });
    assert.equal(r.status, 403); assert.equal(ops.calls.length, 0, "CSRF ผิดห้ามถึง ops");
    r = await quiet(() => req(b.port, "POST", `/admin/payments/${PID}/settlement`, { body: form({ ...base, csrf: session.paymentOpsCsrf }) }));
    assert.equal(r.status, 302); assert.equal(r.location, `/admin/payments/${PID}?settlement=ok`);
    assert.equal(ops.calls.length, 1);
    assert.deepEqual(ops.calls[0], { paymentId: PID, status: "refunded", note: "โอนคืนแล้ว 10 บาท slip#123", actor: `admin_dashboard:${LOGIN_AT.slice(0, 19)}` });
    assert.equal(ops.calls[0].actor, "admin_dashboard:2026-10-20T06:12:33", "actor ต้องระบุ session ที่ login ไม่ใช่คำว่า session เปล่า ๆ");
    // JSON client + CSRF ถูก → { ok: true }
    const j = await quiet(() => req(b.port, "POST", `/admin/payments/${PID}/settlement`, { body: form({ ...base, csrf: session.paymentOpsCsrf }), headers: { "X-Admin-Json": "1" } }));
    assert.equal(j.status, 200); assert.deepEqual(JSON.parse(j.text), { ok: true, reason: null });
  } finally { await close(b.server); }
});

test("store → render: getPaymentsForAdminByStatus (query จริง + client ปลอมเคารพ projection) → หน้ารายการ rejected แสดงป้าย 'เงินรอดำเนินการ' เฉพาะแถว money_pending", async () => {
  const rows = [
    { id: PID, user_id: "u1", line_user_id: "U3e463f4aaaaaaaaaaaaaaaaaaaaaaaaa", payment_ref: "PAY-AB51E942", package_code: "29baht_1scan_24h", package_name: "29 บาท 1 ครั้ง", expected_amount: 29, amount: 10, currency: "THB", status: "rejected", slip_url: null, created_at: "2026-10-20T04:50:00Z", verified_at: null, rejected_at: "2026-10-20T04:54:15Z", reject_reason: "ยอดเงินไม่ตรง", settlement_status: "money_pending", settlement_note: "ปฏิเสธสิทธิ์ (amount) แต่มียอดโอนที่อ่านได้ 10 บาท", settlement_by: "telegram:7486743496", reject_notify_pending: false, app_users: { paid_until: null, paid_remaining_scans: 0 } },
    { id: "22222222-2222-4222-8222-222222222222", user_id: "u2", line_user_id: "U2", payment_ref: "PAY-00000002", package_code: "29baht_1scan_24h", package_name: "29 บาท 1 ครั้ง", expected_amount: 29, amount: null, currency: "THB", status: "rejected", slip_url: null, created_at: "2026-10-20T04:40:00Z", verified_at: null, rejected_at: "2026-10-20T04:41:00Z", reject_reason: "สลิปไม่ชัด", settlement_status: "none", settlement_note: null, settlement_by: null, app_users: null },
  ];
  const b = await boot({ session: { admin: { authenticated: true, loginAt: LOGIN_AT } }, ops: fakeOps(), rows });
  try {
    const page = await req(b.port, "GET", "/admin/payments?status=rejected");
    assert.equal(page.status, 200);
    assert.equal(b.client.calls.length, 1); assert.match(b.client.calls[0].sel, /settlement_status/); assert.match(b.client.calls[0].sel, /settlement_note/); assert.match(b.client.calls[0].sel, /settlement_by/);
    assert.deepEqual(b.client.calls[0].filters, [["status", "rejected"]]);
    assert.equal((page.text.match(/data-settlement="money_pending"/g) || []).length, 2, "ป้ายเงินรอดำเนินการ 2 จุดของแถวเดียว: การ์ดมือถือ + ช่องเหตุผลในตารางเดสก์ท็อป (acceptance 20 ต.ค. พบว่าตารางไม่มีป้าย)");
    assert.match(page.text, /<td style="max-width:100px;font-size:0\.76rem;">ยอดเงินไม่ตรง<span class="settlement-badge" data-settlement="money_pending"/, "ตารางเดสก์ท็อปต้องมีป้ายในช่องเหตุผล");
    assert.match(page.text, /PAY-AB51E942/); assert.match(page.text, /เงินรอดำเนินการ/); assert.match(page.text, /PAY-00000002/);
    assert.doesNotMatch(page.text, /data-settlement="none"/, "แถว none ไม่ต้องแสดงป้าย");
    // พิสูจน์ว่าป้ายมาจาก projection จริง: client ที่ตัดคอลัมน์ settlement ออก (select เดิมรอบ 2) → ไม่มีป้าย
    const stripped = await getPaymentsForAdminByStatus({ status: "rejected" }, { client: { from: () => { const c = { select: (s) => { c.sel = s; return c; }, eq: () => c, order: () => c, limit: () => c, then: (res) => res({ data: rows.map((r) => { const o = { ...r }; delete o.settlement_status; delete o.settlement_note; delete o.settlement_by; return o; }), error: null }) }; return c; } } });
    assert.equal(stripped.rows[0].settlement_status, undefined);
    const live = await getPaymentsForAdminByStatus({ status: "rejected" }, { client: b.client });
    assert.equal(live.rows[0].settlement_status, "money_pending"); assert.equal(live.rows[0].settlement_by, "telegram:7486743496"); assert.equal(live.rows[1].settlement_status, "none");
  } finally { await close(b.server); }
});
