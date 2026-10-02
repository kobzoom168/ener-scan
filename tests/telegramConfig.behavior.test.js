/**
 * ตั้งค่า Telegram อนุมัติสลิปผ่านหน้า Admin (sql/066) — Codex 2 ต.ค. 2026
 * ครอบ: เข้ารหัส/ถอดรหัส · authority env > DB (ENABLED=false ไม่ fallback) · อ่าน config ล้ม = ปฏิเสธ · ถอนผู้อนุมัติมีผลทันที (ไม่มี cache)
 *       · หน้า Admin: login/CSRF/token ว่าง=คงเดิม/ยืนยันเปลี่ยน/env override บล็อกบันทึก/ไม่รั่ว secret ใน HTML/log
 */
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import crypto from "node:crypto";

for (const [k, v] of Object.entries({ SUPABASE_URL: "http://127.0.0.1:9", LOCAL_POSTGREST_URL: "http://127.0.0.1:9", LOCAL_POSTGREST_ANON_KEY: "x", SUPABASE_SERVICE_ROLE_KEY: "x", OPENAI_API_KEY: "sk-test", CHANNEL_ACCESS_TOKEN: "t", CHANNEL_SECRET: "s", GEMINI_API_KEY: "g", REDIS_URL: "" })) process.env[k] ??= v;
const KEY = crypto.randomBytes(32).toString("hex");
const DBKEY = "h.p.s";
const store = await import("../src/services/payments/telegramConfig.store.js");
const svc = await import("../src/services/payments/telegramSlipApproval.service.js");
const createRouter = (await import("../src/routes/adminTelegramApproval.routes.js")).default;
const { requireAdminSessionOnly, requireAdminSession } = await import("../src/middleware/requireAdmin.js");
const { env: appEnv } = await import("../src/config/env.js");
const TOKEN = "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij";
const ENV5 = ["TELEGRAM_SLIP_APPROVAL_ENABLED", "TELEGRAM_APPROVAL_BOT_TOKEN", "TELEGRAM_APPROVAL_CHAT_ID", "TELEGRAM_WEBHOOK_SECRET", "TELEGRAM_APPROVER_USER_IDS"];
const envDb = { TELEGRAM_CONFIG_KEY: KEY, TELEGRAM_CONFIG_DB_KEY: DBKEY, LOCAL_POSTGREST_URL: "http://127.0.0.1:9" };

test("เข้ารหัส/ถอดรหัส AES-256-GCM: roundtrip · key ผิดล้ม · ciphertext เพี้ยนล้ม · readiness", () => {
  const enc = store.encryptSecret(TOKEN, envDb);
  assert.match(enc, /^v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/); assert.ok(!enc.includes("123456789"));
  assert.equal(store.decryptSecret(enc, envDb), TOKEN);
  assert.throws(() => store.decryptSecret(enc, { ...envDb, TELEGRAM_CONFIG_KEY: crypto.randomBytes(32).toString("hex") }));
  assert.throws(() => store.decryptSecret(enc.slice(0, -2) + "zz", envDb));
  assert.deepEqual(store.configStoreReadiness({}), { ready: false, missing: ["TELEGRAM_CONFIG_KEY", "TELEGRAM_CONFIG_DB_KEY"] });
  assert.equal(store.configStoreReadiness({ TELEGRAM_CONFIG_KEY: "test-placeholder", TELEGRAM_CONFIG_DB_KEY: DBKEY }).ready, false, "placeholder ไม่ใช่ key");
  assert.equal(store.configStoreReadiness(envDb).ready, true);
});

const fakeStoreWith = (secrets) => ({
  configStoreReadiness: () => ({ ready: true, missing: [] }),
  loadRuntimeConfigFromDb: async () => { if (secrets instanceof Error) throw secrets; return secrets; },
});
const dbCfg = { token: TOKEN, chatId: "-1001", approvers: new Set(["111", "222"]), webhookSecret: "s".repeat(40), source: "db" };

test("authority: env ตั้ง (แม้ ENABLED=false) → ใช้ env อย่างเดียว ไม่ fallback DB · env ว่าง → DB · ops ยังไม่ตั้ง key → ปิด · อ่าน DB ล้ม → throw", async () => {
  const envOff = { TELEGRAM_SLIP_APPROVAL_ENABLED: "false", ...envDb };
  assert.equal(svc.telegramConfigAuthority(envOff), "env");
  assert.equal(await svc.resolveTelegramApprovalConfig({ env: envOff, store: fakeStoreWith(dbCfg) }), null, "ENABLED=false ชัดเจน ต้องไม่เปิดจาก DB");
  const envEmpty = { TELEGRAM_SLIP_APPROVAL_ENABLED: "", TELEGRAM_APPROVAL_BOT_TOKEN: "", ...envDb };
  assert.equal(svc.telegramConfigAuthority(envEmpty), "db");
  const r = await svc.resolveTelegramApprovalConfig({ env: envEmpty, store: fakeStoreWith(dbCfg) });
  assert.equal(r.source, "db"); assert.ok(r.approvers.has("222"));
  assert.equal(await svc.resolveTelegramApprovalConfig({ env: { LOCAL_POSTGREST_URL: "x" }, store: { configStoreReadiness: () => ({ ready: false, missing: ["TELEGRAM_CONFIG_KEY"] }), loadRuntimeConfigFromDb: async () => dbCfg } }), null, "ไม่มี key = ปิด แม้ DB เปิด");
  await assert.rejects(svc.resolveTelegramApprovalConfig({ env: envEmpty, store: fakeStoreWith(new Error("pgrst_down")) }), /pgrst_down/);
});

test("env แหล่งเดียว: deps.env ENABLED=false แต่ process.env เปิดครบ → ปิด · deps.env เปิดครบแต่ process.env ปิด → ใช้ deps.env · readTelegramApprovalConfig(envSrc)", async () => {
  const saved = Object.fromEntries(ENV5.map((k) => [k, process.env[k]]));
  try {
    Object.assign(process.env, { TELEGRAM_SLIP_APPROVAL_ENABLED: "true", TELEGRAM_APPROVAL_BOT_TOKEN: TOKEN, TELEGRAM_APPROVAL_CHAT_ID: "-9", TELEGRAM_WEBHOOK_SECRET: "x".repeat(40), TELEGRAM_APPROVER_USER_IDS: "999" });
    assert.ok(svc.readTelegramApprovalConfig(), "process.env เปิดครบ (ค่าเริ่มต้น)");
    assert.equal(await svc.resolveTelegramApprovalConfig({ env: { TELEGRAM_SLIP_APPROVAL_ENABLED: "false", ...envDb }, store: fakeStoreWith(dbCfg) }), null, "env ที่ส่งมาปิด ต้องปิด แม้ process.env เปิด");
    assert.equal(svc.readTelegramApprovalConfig({ TELEGRAM_SLIP_APPROVAL_ENABLED: "false" }), null);
    for (const k of ENV5) process.env[k] = "";
    process.env.TELEGRAM_SLIP_APPROVAL_ENABLED = "false";
    const injected = { TELEGRAM_SLIP_APPROVAL_ENABLED: "true", TELEGRAM_APPROVAL_BOT_TOKEN: TOKEN, TELEGRAM_APPROVAL_CHAT_ID: "-7", TELEGRAM_WEBHOOK_SECRET: "y".repeat(40), TELEGRAM_APPROVER_USER_IDS: "111" };
    const r = await svc.resolveTelegramApprovalConfig({ env: injected, store: fakeStoreWith(dbCfg) });
    assert.equal(r?.source, "env"); assert.equal(r.chatId, "-7", "ต้องมาจาก env ที่ส่งมา ไม่ใช่ process.env");
    assert.equal(svc.readTelegramApprovalConfig(), null, "process.env ปิด");
  } finally { for (const k of ENV5) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
});

test("handler: อ่าน config ล้ม → ปฏิเสธ ไม่อนุมัติ ไม่ใช้ค่าเก่า · ถอนผู้อนุมัติแล้วกดปุ่มเดิม → denied", async () => {
  const audits = [];
  const db = { rpc: async (name, args) => { if (name === "record_payment_approval_audit") { audits.push(args); return { data: true, error: null }; } return { data: null, error: null }; }, from: () => ({ insert: async () => ({ data: null, error: null }) }) };
  const cb = { id: "c1", from: { id: 222 }, message: { chat: { id: -1001 } }, data: "cf:tok" };
  const envEmpty = { TELEGRAM_SLIP_APPROVAL_ENABLED: "", TELEGRAM_APPROVAL_BOT_TOKEN: "", ...envDb };
  let approved = 0;
  const base = { db, env: envEmpty, approvePayment: async () => { approved++; return {}; }, loadPayment: async () => ({ status: "pending_verify" }) };
  const r1 = await svc.handleApprovalCallback(cb, { ...base, store: fakeStoreWith(new Error("pgrst_down")) });
  assert.equal(r1.result, "error"); assert.match(r1.text, /ตรวจสอบสิทธิ์ไม่ได้/); assert.equal(approved, 0);
  assert.ok(audits.some((a) => a.p_result === "error" && a.p_detail?.reason === "config_unavailable"));
  // ถอน 222 ออก (DB ล่าสุด) → callback เดิมของ 222 ต้อง denied
  const revoked = { ...dbCfg, approvers: new Set(["111"]) };
  const r2 = await svc.handleApprovalCallback(cb, { ...base, store: fakeStoreWith(revoked) });
  assert.equal(r2.result, "denied"); assert.match(r2.text, /ไม่มีสิทธิ์/); assert.equal(approved, 0);
});

// ───────────── หน้า Admin (HTTP จริง, store ปลอม, authorize ปลอม) ─────────────
function boot({ storeFake, env, authorized = true, realAuth = false, session = null }) {
  const app = express();
  session = session ?? (authorized ? { admin: { authenticated: true } } : {});
  app.use((req, _res, next) => { req.session = session; next(); });
  const authorize = realAuth ? undefined : (req, res, next) => (authorized ? next() : res.redirect(302, "/admin/login"));
  app.use(createRouter({ ...(authorize ? { authorize } : {}), store: storeFake, svc, envSrc: env }));
  return new Promise((resolve) => { const server = app.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port, session })); });
}
const shut = (server) => { server.closeAllConnections?.(); server.close(); };
function req(port, method, path, { body = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: "127.0.0.1", port, method, path, agent: false, headers: { connection: "close", ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}), ...headers } }, (res) => { let t = ""; res.on("data", (c) => (t += c)); res.on("end", () => resolve({ status: res.statusCode, text: t, location: res.headers.location })); });
    r.on("error", reject); if (body) r.write(body); r.end();
  });
}
const form = (o) => new URLSearchParams(o).toString();
const envEmpty = { TELEGRAM_SLIP_APPROVAL_ENABLED: "", TELEGRAM_APPROVAL_BOT_TOKEN: "", APP_ENV: "staging", ...envDb };
function adminStore(state) {
  const calls = [];
  return { calls, configStoreReadiness: () => ({ ready: true, missing: [] }), getPublicStatus: async () => state,
    saveSettings: async (p) => { if (!state.token_set && !p.token) throw new Error("token_required_on_first_save"); calls.push(p); return { ...state, configured: true, token_set: true }; } };
}
const logs = []; const origLog = console.log, origErr = console.error;
const capture = () => { console.log = (...a) => logs.push(a.join(" ")); console.error = console.log; };
const restore = () => { console.log = origLog; console.error = origErr; };

test("หน้า Admin: ไม่ login → redirect · ยังไม่ตั้งค่า → ฟอร์มครั้งแรก ต้องมี token · บันทึกครั้งแรกสำเร็จ → redirect saved=1 · HTML/log ไม่มี token", async () => {
  capture();
  try {
    const st = adminStore({ configured: false, token_set: false, enabled: false, approvers: [] });
    const { server, port, session } = await boot({ storeFake: st, env: envEmpty });
    const unauth = await boot({ storeFake: st, env: envEmpty, authorized: false });
    assert.equal((await req(unauth.port, "GET", "/admin/telegram-approval")).status, 302); shut(unauth.server);
    const g = await req(port, "GET", "/admin/telegram-approval");
    assert.equal(g.status, 200); assert.match(g.text, /ยังไม่ตั้งค่า/); assert.match(g.text, /Environment: <strong>staging/); assert.match(g.text, /type="password" name="bot_token"/);
    assert.ok(!g.text.includes("telegram_settings_get_secrets"));
    const csrf = session.telegramCfgCsrf; assert.ok(csrf);
    const bad = await req(port, "POST", "/admin/telegram-approval", { body: form({ csrf: "nope", chat_id: "-1001", approver1_id: "111" }) });
    assert.equal(bad.status, 403); assert.equal(st.calls.length, 0);
    const noTok = await req(port, "POST", "/admin/telegram-approval", { body: form({ csrf, chat_id: "-1001", approver1_label: "กบ", approver1_id: "111" }) });
    assert.equal(noTok.status, 400); assert.match(noTok.text, /ครั้งแรกต้องใส่ Bot Token/); assert.equal(st.calls.length, 0);
    const ok = await req(port, "POST", "/admin/telegram-approval", { body: form({ csrf, bot_token: TOKEN, chat_id: "-1001", approver1_label: "กบ", approver1_id: "111", approver2_label: "คนที่สอง", approver2_id: "222" }) });
    assert.equal(ok.status, 303); assert.equal(ok.location, "/admin/telegram-approval?saved=1");
    assert.equal(st.calls.length, 1); assert.equal(st.calls[0].token, TOKEN); assert.deepEqual(st.calls[0].approvers.map((a) => a.tgUserId), ["111", "222"]);
    const after = await req(port, "GET", "/admin/telegram-approval?saved=1");
    assert.match(after.text, /บันทึกการตั้งค่าแล้ว/); assert.match(after.text, /ยังไม่เปิดใช้งาน/);
    assert.ok(!after.text.includes(TOKEN) && !g.text.includes(TOKEN) && !ok.text.includes(TOKEN), "token ต้องไม่อยู่ใน HTML");
    assert.ok(!logs.some((l) => l.includes(TOKEN)), "token ต้องไม่อยู่ใน log");
    shut(server);
  } finally { restore(); }
});

test("หน้า Admin: มี Token แล้ว → ว่าง=คงเดิม (token:null) · เปลี่ยนโดยไม่ยืนยัน → 400 ไม่เรียก store · ยืนยันครบ → เปลี่ยน", async () => {
  const st = adminStore({ configured: true, token_set: true, enabled: false, chat_id: "-1001", approvers: [{ label: "กบ", tg_user_id: "111" }], token_set_at: "2026-10-02T00:00:00Z", updated_at: "2026-10-02T00:00:00Z", updated_by: "admin" });
  const { server, port, session } = await boot({ storeFake: st, env: envEmpty });
  const g = await req(port, "GET", "/admin/telegram-approval"); assert.match(g.text, /ตั้งค่าแล้ว — ยังไม่เปิดใช้งาน/); assert.match(g.text, /ตั้งค่า Token แล้ว/); assert.match(g.text, /คงค่าเดิม/);
  const csrf = session.telegramCfgCsrf;
  const keep = await req(port, "POST", "/admin/telegram-approval", { body: form({ csrf, bot_token: "", chat_id: "-1001", approver1_label: "กบ", approver1_id: "111" }) });
  assert.equal(keep.status, 303); assert.equal(st.calls.at(-1).token, null, "ว่าง = คงเดิม");
  const noConfirm = await req(port, "POST", "/admin/telegram-approval", { body: form({ csrf, bot_token: TOKEN, chat_id: "-1001", approver1_id: "111" }) });
  assert.equal(noConfirm.status, 400); assert.equal(st.calls.length, 1, "ไม่ยืนยัน ต้องไม่เรียก store");
  const wrongText = await req(port, "POST", "/admin/telegram-approval", { body: form({ csrf, bot_token: TOKEN, confirm_token_change: "1", confirm_text: "ok", chat_id: "-1001", approver1_id: "111" }) });
  assert.equal(wrongText.status, 400); assert.equal(st.calls.length, 1);
  const confirmed = await req(port, "POST", "/admin/telegram-approval", { body: form({ csrf, bot_token: TOKEN, confirm_token_change: "1", confirm_text: "เปลี่ยน TOKEN", chat_id: "-1001", approver1_id: "111" }) });
  assert.equal(confirmed.status, 303); assert.equal(st.calls.at(-1).token, TOKEN);
  assert.ok(![g, keep, noConfirm, wrongText, confirmed].some((r) => r.text.includes(TOKEN)));
  shut(server);
});

test("หน้า Admin: env เป็นผู้คุม → แสดง 'ควบคุมโดย config เซิร์ฟเวอร์' + ปฏิเสธบันทึก 409 · ops ยังไม่ตั้ง key → 503 ไม่บันทึก", async () => {
  const st = adminStore({ configured: true, token_set: true, enabled: true, approvers: [] });
  const envCtl = { ...envEmpty, TELEGRAM_SLIP_APPROVAL_ENABLED: "false" };
  const a = await boot({ storeFake: st, env: envCtl });
  const g = await req(a.port, "GET", "/admin/telegram-approval"); assert.match(g.text, /ควบคุมโดย config เซิร์ฟเวอร์/); assert.match(g.text, /disabled>บันทึกการตั้งค่า/);
  const p = await req(a.port, "POST", "/admin/telegram-approval", { body: form({ csrf: a.session.telegramCfgCsrf, bot_token: TOKEN, chat_id: "-1001", approver1_id: "111" }) });
  assert.equal(p.status, 409); assert.equal(st.calls.length, 0); shut(a.server);
  const notReady = { ...st, configStoreReadiness: () => ({ ready: false, missing: ["TELEGRAM_CONFIG_KEY"] }) };
  const b = await boot({ storeFake: notReady, env: envEmpty });
  const g2 = await req(b.port, "GET", "/admin/telegram-approval"); assert.match(g2.text, /ops ต้องตั้ง TELEGRAM_CONFIG_KEY/);
  const p2 = await req(b.port, "POST", "/admin/telegram-approval", { body: form({ csrf: b.session.telegramCfgCsrf, bot_token: TOKEN, chat_id: "-1001", approver1_id: "111" }) });
  assert.equal(p2.status, 503); assert.equal(st.calls.length, 0); shut(b.server);
});

test("auth จริง (middleware จริง ไม่ mock): session ว่าง + legacy x-admin-token/?token → 302 (GET) / 302 (POST) ไม่บันทึก · session login จริง → 200 · หน้าอื่นยังรับ legacy", async () => {
  const savedTok = appEnv.ADMIN_TOKEN; appEnv.ADMIN_TOKEN = "legacy-admin-token-for-test";
  try {
    const st = adminStore({ configured: false, token_set: false, enabled: false, approvers: [] });
    const anon = await boot({ storeFake: st, env: envEmpty, realAuth: true, session: {} });
    const hdr = { "x-admin-token": appEnv.ADMIN_TOKEN };
    assert.equal((await req(anon.port, "GET", "/admin/telegram-approval", { headers: hdr })).status, 302, "legacy header ต้องไม่ผ่าน");
    assert.equal((await req(anon.port, "GET", "/admin/telegram-approval?token=" + appEnv.ADMIN_TOKEN)).status, 302, "legacy ?token ต้องไม่ผ่าน");
    const p = await req(anon.port, "POST", "/admin/telegram-approval", { headers: hdr, body: form({ token: appEnv.ADMIN_TOKEN, csrf: "x", bot_token: TOKEN, chat_id: "-1001", approver1_id: "111" }) });
    assert.equal(p.status, 302); assert.equal(st.calls.length, 0, "POST ด้วย legacy token ต้องไม่บันทึก");
    const j = await req(anon.port, "GET", "/admin/telegram-approval", { headers: { ...hdr, accept: "application/json" } }); assert.equal(j.status, 401);
    shut(anon.server);
    const logged = await boot({ storeFake: st, env: envEmpty, realAuth: true, session: { admin: { authenticated: true } } });
    assert.equal((await req(logged.port, "GET", "/admin/telegram-approval")).status, 200);
    const csrf = logged.session.telegramCfgCsrf;
    assert.equal((await req(logged.port, "POST", "/admin/telegram-approval", { body: form({ csrf: "wrong", bot_token: TOKEN, chat_id: "-1001", approver1_id: "111" }) })).status, 403);
    assert.equal((await req(logged.port, "POST", "/admin/telegram-approval", { body: form({ csrf, bot_token: TOKEN, chat_id: "-1001", approver1_id: "111" }) })).status, 303);
    assert.equal(st.calls.length, 1); shut(logged.server);
    // middleware เดิมของหน้าอื่นยังรับ legacy (ไม่เปลี่ยน)
    const legacyApp = express(); legacyApp.use((req, _r, n) => { req.session = {}; n(); }); legacyApp.get("/admin/other", requireAdminSession, (_q, r) => r.send("ok"));
    const ls = legacyApp.listen(0, "127.0.0.1"); await new Promise((r) => ls.once("listening", r));
    assert.equal((await req(ls.address().port, "GET", "/admin/other", { headers: hdr })).status, 200); shut(ls);
    assert.equal(typeof requireAdminSessionOnly, "function");
  } finally { appEnv.ADMIN_TOKEN = savedTok; }
});

test("ข้อความหลังบันทึกยึดสถานะจริง: OFF → 'ยังไม่เปิดใช้งาน' · ON → 'เปิดใช้งานอยู่ … มีผลกับระบบที่เปิดอยู่ทันที' และไม่พูดว่ายังไม่เปิด", async () => {
  const base = { configured: true, token_set: true, chat_id: "-1001", approvers: [{ label: "กบ", tg_user_id: "111" }], token_set_at: "2026-10-02T00:00:00Z", updated_at: "2026-10-02T00:00:00Z" };
  const off = await boot({ storeFake: adminStore({ ...base, enabled: false }), env: envEmpty });
  const g0 = await req(off.port, "GET", "/admin/telegram-approval?saved=1");
  assert.match(g0.text, /สถานะ:<\/strong> ตั้งค่าแล้ว — ยังไม่เปิดใช้งาน/); assert.match(g0.text, /บันทึกการตั้งค่าแล้ว — <strong>ยังไม่เปิดใช้งาน/); assert.match(g0.text, /ไม่ได้เปลี่ยนสวิตช์/); shut(off.server);
  const on = await boot({ storeFake: adminStore({ ...base, enabled: true }), env: envEmpty });
  const g1 = await req(on.port, "GET", "/admin/telegram-approval?saved=1");
  assert.match(g1.text, /สถานะ:<\/strong> ตั้งค่าแล้ว — เปิดใช้งานแล้ว/); assert.match(g1.text, /ระบบ<strong>เปิดใช้งานอยู่/); assert.match(g1.text, /มีผลกับระบบที่เปิดอยู่ทันที/); assert.match(g1.text, /ไม่ได้เปลี่ยนสวิตช์/);
  assert.ok(!/บันทึกการตั้งค่าแล้ว — <strong>ยังไม่เปิดใช้งาน/.test(g1.text), "ON ต้องไม่บอกว่ายังไม่เปิด"); shut(on.server);
});

test("store.saveSettings ตรวจรูปแบบก่อนเข้ารหัส/เรียก RPC: chat id/approver/token ผิด · ซ้ำ · ครั้งแรกไม่มี token", async () => {
  const calls = [];
  const client = { rpc: async (name, args) => { calls.push({ name, args }); return { data: name === "telegram_settings_get_public" ? { token_set: false } : { configured: true }, error: null }; } };
  const deps = { client, env: envDb };
  await assert.rejects(store.saveSettings({ chatId: "abc", approvers: [{ tgUserId: "111" }], token: TOKEN }, deps), /invalid_chat_id/);
  await assert.rejects(store.saveSettings({ chatId: "-1001", approvers: [], token: TOKEN }, deps), /approvers_required/);
  await assert.rejects(store.saveSettings({ chatId: "-1001", approvers: [{ tgUserId: "@name" }], token: TOKEN }, deps), /invalid_approver_id/);
  await assert.rejects(store.saveSettings({ chatId: "-1001", approvers: [{ tgUserId: "111" }, { tgUserId: "111" }], token: TOKEN }, deps), /duplicate_approver_id/);
  await assert.rejects(store.saveSettings({ chatId: "-1001", approvers: [{ tgUserId: "111" }], token: "bad" }, deps), /invalid_bot_token/);
  await assert.rejects(store.saveSettings({ chatId: "-1001", approvers: [{ tgUserId: "111" }], token: null }, deps), /token_required_on_first_save/);
  assert.ok(calls.every((c) => c.name === "telegram_settings_get_public"), "ยังไม่เรียก save เมื่อข้อมูลผิด");
  await store.saveSettings({ chatId: "-1001", approvers: [{ label: "กบ", tgUserId: "111" }], token: TOKEN, actor: "it" }, deps);
  const save = calls.find((c) => c.name === "telegram_settings_save");
  assert.ok(save); assert.match(save.args.p_token_enc, /^v1:/); assert.match(save.args.p_secret_enc, /^v1:/); assert.ok(!JSON.stringify(save.args).includes(TOKEN), "RPC ต้องได้ ciphertext ไม่ใช่ plaintext");
  assert.equal(store.decryptSecret(save.args.p_token_enc, envDb), TOKEN);
});
