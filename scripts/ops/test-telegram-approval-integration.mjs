/**
 * Integration test — Telegram slip approval (งาน 3) ผ่าน router/handler/RPC จริง ในระบบแยก (Codex 1 ต.ค. 2026)
 *
 * ของจริง: express mount เหมือน app.js (urlencoded เท่านั้นระดับ app · router parse JSON เองที่ path) · telegramWebhook.routes.js ·
 *          telegramSlipApproval.service (authorize/issue/consume/approve/audit) · payments.db.markPaymentApprovedAndUnlock →
 *          RPC approve_payment_and_grant (061–063 จาก schema staging) · outboundAdminEnqueue (ข้อความแจ้งลูกค้าลง outbound_messages — ไม่ส่ง LINE)
 * ของปลอม: api.telegram.org (ตัดจบในเครื่อง บันทึก method/body) · ไม่มี LINE/AI (network guard บล็อกก่อนส่ง)
 * ข้อมูล: บัญชี/รายการสังเคราะห์ใน DB ใช้แล้วทิ้ง · config Telegram ค่าทดสอบ (ไม่ใช่ secret จริง)
 *
 * รัน (automated):  node scripts/ops/test-telegram-approval-integration.mjs
 *
 * โหมดทดสอบด้วยมือ (Codex วิธี A, 1 ต.ค. 2026): "Telegram จริง → ระบบทดสอบแยก" — ไม่ใช่ staging ทั้งชุด
 *   node scripts/ops/test-telegram-approval-integration.mjs --live [--dry-run]
 *   env ที่ต้องมี: ENER_TG_LIVE_SHA=<exact SHA ตายตัว> · ENER_TG_LIVE_ENV_FILE=<ไฟล์ 600 มี TELEGRAM_* 5 ตัว แยกจาก staging/.env>
 *   ทางเลือก: ENER_TG_LIVE_PORT (ค่าเริ่มต้น 3390 bind 127.0.0.1) · ENER_TG_LIVE_OUT (โฟลเดอร์หลักฐาน ค่าเริ่มต้น /tmp/ener-tg-live-out)
 *   - โค้ด router/handler/RPC มาจาก git worktree ของ SHA นั้น (ตรวจ rev-parse) ไม่ใช่ checkout ปัจจุบัน
 *   - DB/PostgREST ใช้แล้วทิ้ง · ไม่มี delivery worker · ไม่แตะ DB/คิว staging/Pro
 *   - Telegram ส่งจริง (guard อนุญาตเฉพาะ host api.telegram.org) · LINE/AI ยังถูกบล็อกก่อนส่ง · --dry-run = Telegram ปลอม (ทดสอบกลไกเอง)
 *   - เซิร์ฟเวอร์รอรับ callback จนกว่าจะมีไฟล์ <OUT>/STOP หรือ SIGINT/SIGTERM → เขียนหลักฐาน <OUT>/evidence-<ts>.json แล้วเก็บกวาด
 *   - ไม่พิมพ์ token/secret ลง log · nginx ชี้ /telegram/webhook-it → 127.0.0.1:<port>/telegram/webhook (ดู ops/nginx/telegram-live-isolated.conf.PROPOSED)
 */
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import * as fsSync from "node:fs";
import crypto from "node:crypto";
import assert from "node:assert/strict";

const RUN = `${process.pid}-${crypto.randomBytes(3).toString("hex")}`;
const NET = `ener-tg-it-${RUN}-net`, PG = `ener-tg-it-${RUN}-pg`, PGRST = `ener-tg-it-${RUN}-pgrst`;
const PORT = 32000 + (process.pid % 20000);
const JWT_SECRET = crypto.randomBytes(32).toString("hex");
const root = new URL("../../", import.meta.url);
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...opts }).trim();
const psql = (s, db = "postgres") => sh("docker", ["exec", "-i", PG, "psql", "-U", "postgres", "-d", db, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"], { input: s });
function jwt(role) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ role, exp: Math.floor(Date.now() / 1000) + 3600 })}`;
  return `${head}.${crypto.createHmac("sha256", JWT_SECRET).update(head).digest("base64url")}`;
}
function teardown() {
  for (const c of [PGRST, PG]) spawnSync("docker", ["rm", "-f", c], { stdio: "ignore" });
  spawnSync("docker", ["network", "rm", NET], { stdio: "ignore" });
}

const LIVE = process.argv.includes("--live");
const DRY = process.argv.includes("--dry-run");
let liveWorktree = null;
function teardownAll() { teardown(); if (liveWorktree) spawnSync("git", ["-C", new URL(".", root).pathname, "worktree", "remove", "--force", liveWorktree], { stdio: "ignore" }); }
/** อ่านไฟล์ secret แยก: รับเฉพาะ TELEGRAM_* 5 ตัว ตรวจรูปแบบ ไม่คืนค่าออกไปที่ log */
function readLiveEnvFile(file) {
  const { statSync } = fsSync;
  const st = statSync(file);
  if (st.mode & 0o077) throw new Error(`ไฟล์ secret ต้อง chmod 600: ${file}`);
  const want = { TELEGRAM_APPROVAL_BOT_TOKEN: /^\d{5,}:[A-Za-z0-9_-]{30,}$/, TELEGRAM_APPROVAL_CHAT_ID: /^-?\d{3,}$/, TELEGRAM_APPROVER_USER_IDS: /^\d+(\s*,\s*\d+)*$/, TELEGRAM_WEBHOOK_SECRET: /^[A-Za-z0-9_-]{32,256}$/, TELEGRAM_SLIP_APPROVAL_ENABLED: /^true$/ };
  const outEnv = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/); if (!m) continue;
    if (!(m[1] in want)) continue;
    const v = m[2].trim().replace(/^"(.*)"$/, "$1");
    if (!want[m[1]].test(v)) throw new Error(`รูปแบบไม่ถูกต้อง: ${m[1]} (ไม่พิมพ์ค่า)`);
    outEnv[m[1]] = v;
  }
  const missing = Object.keys(want).filter((k) => !(k in outEnv));
  if (missing.length) throw new Error(`ขาดตัวแปรในไฟล์ secret: ${missing.join(", ")}`);
  return outEnv;
}
if (!process.env.ENER_TG_IT_CHILD) {
  process.on("uncaughtException", (e) => { console.error(e); teardownAll(); process.exit(1); });
  let codeRoot = root;
  let liveEnv = {};
  if (LIVE) {
    const sha = String(process.env.ENER_TG_LIVE_SHA || "").trim();
    if (!/^[0-9a-f]{7,40}$/.test(sha)) { console.error("ต้องตั้ง ENER_TG_LIVE_SHA เป็น SHA ตายตัว (7–40 hex)"); process.exit(2); }
    const envFile = String(process.env.ENER_TG_LIVE_ENV_FILE || "").trim();
    if (!envFile) { console.error("ต้องตั้ง ENER_TG_LIVE_ENV_FILE (ไฟล์ secret แยก chmod 600)"); process.exit(2); }
    liveEnv = readLiveEnvFile(envFile);
    liveWorktree = `/tmp/ener-tg-live-${sha}-${RUN}`;
    sh("git", ["-C", new URL(".", root).pathname, "worktree", "add", "--detach", liveWorktree, sha]);
    const head = sh("git", ["-C", liveWorktree, "rev-parse", "HEAD"]);
    if (!head.startsWith(sha)) { teardownAll(); console.error("worktree ไม่ตรง SHA"); process.exit(2); }
    const nm = new URL("node_modules", root).pathname;
    if (fsSync.existsSync(nm)) sh("ln", ["-s", nm, `${liveWorktree}/node_modules`]);
    else { console.log("ไม่มี node_modules ใน repo หลัก → npm ci --omit=dev ใน worktree (ต้องมีเครือข่ายไป npm registry)"); sh("npm", ["ci", "--omit=dev", "--no-audit", "--no-fund"], { cwd: liveWorktree, stdio: ["pipe", "inherit", "inherit"] }); }
    codeRoot = new URL(`file://${liveWorktree}/`);
    console.log(JSON.stringify({ event: "TG_LIVE_CODE", sha: head, worktree: liveWorktree, dryRun: DRY }));
  }
  sh("docker", ["network", "create", NET]);
  sh("docker", ["run", "-d", "--name", PG, "--network", NET, "-e", "POSTGRES_PASSWORD=pg", "pgvector/pgvector:pg16"]);
  let created = false;
  for (let i = 0; i < 120 && !created; i++) { try { psql("CREATE DATABASE tg_it"); created = true; } catch { execFileSync("sleep", ["0.5"]); } }
  if (!created) { teardown(); assert.ok(created, "Postgres ไม่พร้อม"); }
  psql(readFileSync(new URL("fixtures/staging-schema-2026-10-01.sql", import.meta.url), "utf8"), "tg_it");
  for (const f of ["057_new_customer_trial", "064_bonus_reservation", "065_trial_dedup_evidence"]) psql(readFileSync(new URL(`sql/${f}.sql`, root), "utf8"), "tg_it");
  sh("docker", ["run", "-d", "--name", PGRST, "--network", NET, "-p", `127.0.0.1:${PORT}:3000`,
    "-e", `PGRST_DB_URI=postgres://authenticator:authenticator@${PG}:5432/tg_it`,
    "-e", "PGRST_DB_SCHEMA=public", "-e", "PGRST_DB_ANON_ROLE=web_anon", "-e", `PGRST_JWT_SECRET=${JWT_SECRET}`,
    "-e", "PGRST_SERVER_PORT=3000", "postgrest/postgrest:v12.2.3"]);
  let up = false;
  for (let i = 0; i < 60 && !up; i++) { try { up = (await fetch(`http://127.0.0.1:${PORT}/`)).status < 500; } catch { /* ยังไม่ขึ้น */ } if (!up) execFileSync("sleep", ["0.5"]); }
  if (!up) { teardown(); assert.ok(up, "PostgREST ไม่ขึ้น"); }
  const { buildChildEnv } = await import("./fixtures/it-child-env.mjs");
  const env = buildChildEnv(codeRoot, {
    ENER_TG_IT_CHILD: "1", ENER_TG_IT_PG: PG, ENER_TG_IT_APP_LOG: process.env.ENER_TG_IT_APP_LOG || "",
    ...(LIVE ? { ENER_TG_IT_MODE: "live", ENER_TG_DRY_RUN: DRY ? "1" : "", ENER_TG_LIVE_SHA: String(process.env.ENER_TG_LIVE_SHA || ""), ENER_TG_LIVE_PORT: String(process.env.ENER_TG_LIVE_PORT || 3390),
      ENER_TG_LIVE_OUT: String(process.env.ENER_TG_LIVE_OUT || "/tmp/ener-tg-live-out"), ENER_IT_ALLOW_HOSTS: DRY ? "" : "api.telegram.org" } : {}),
    LOCAL_POSTGREST_URL: `http://127.0.0.1:${PORT}`, LOCAL_POSTGREST_ANON_KEY: jwt("web_anon"),
    LOCAL_POSTGREST_SERVICE_KEY: jwt("service_role"), SUPABASE_URL: "http://127.0.0.1:9", SUPABASE_SERVICE_ROLE_KEY: "x",
    OPENAI_API_KEY: "sk-test", CHANNEL_ACCESS_TOKEN: "it-token", CHANNEL_SECRET: "it-secret", GEMINI_API_KEY: "g", REDIS_URL: "",
    NODE_ENV: "test", SESSION_SECRET: "it-session-secret", ADMIN_LINE_USER_ID: "U" + "a".repeat(32), APP_BASE_URL: "http://127.0.0.1:9",
    // automated: config Telegram ค่าทดสอบ (bot/ห้อง/ผู้อนุมัติ/secret สมมติ) · live: จากไฟล์ secret แยก (ไม่พิมพ์)
    ...(LIVE ? liveEnv : { TELEGRAM_SLIP_APPROVAL_ENABLED: "true", TELEGRAM_APPROVAL_BOT_TOKEN: "123456:it-bot-token", TELEGRAM_APPROVAL_CHAT_ID: "-1001234",
      TELEGRAM_APPROVER_USER_IDS: "111, 222", TELEGRAM_WEBHOOK_SECRET: crypto.randomBytes(32).toString("hex") }),
  });
  // child = สคริปต์นี้จาก codeRoot (โหมด live = worktree ของ SHA ตายตัว)
  const childScript = new URL("scripts/ops/test-telegram-approval-integration.mjs", codeRoot).pathname;
  const child = spawnSync(process.execPath, [childScript], { env, stdio: "inherit" });
  teardownAll();
  process.exit(child.status ?? 1);
}

// ───────────────────────── child ─────────────────────────
const PGC = process.env.ENER_TG_IT_PG;
const q = (s, db = "tg_it") => sh("docker", ["exec", "-i", PGC, "psql", "-U", "postgres", "-d", db, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"], { input: s });
const { blockedAttempts, shortCircuitFetch, selfTestGuard } = await import("./fixtures/it-network-guard.mjs");
await selfTestGuard();
const tgCalls = [];
shortCircuitFetch(/^https:\/\/api\.telegram\.org\//, () => new Response(JSON.stringify({ ok: true, result: { message_id: 99 } }), { status: 200 }));
// บันทึก method/body ของ Telegram โดยไม่เก็บ token ใน log: ครอบ fetch อีกชั้นเพื่อดึง body (short-circuit ด้านบนตอบ)
{
  const f = globalThis.fetch;
  globalThis.fetch = function (input, init) {
    const u = String(input instanceof Request ? input.url : input);
    if (/^https:\/\/api\.telegram\.org\//.test(u)) {
      const method = u.replace(/^.*\/bot[^/]+\//, "");
      let body = null; try { body = typeof init?.body === "string" ? JSON.parse(init.body) : (init?.body ? "<form>" : null); } catch { body = "<raw>"; }
      tgCalls.push({ method, body });
    }
    return f.call(this, input, init);
  };
}

const express = (await import("express")).default;
const createTelegramWebhookRouter = (await import(new URL("src/routes/telegramWebhook.routes.js", root))).default;
const { notifyTelegramSlipPendingVerify } = await import(new URL("src/services/payments/telegramSlipApproval.service.js", root));
const { runPaymentGrantNotifySweep } = await import(new URL("src/services/payments/paymentGrantNotifier.service.js", root));

// mount เหมือน app.js จริง: urlencoded เท่านั้นก่อน router (ไม่มี express.json ระดับ app)
const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(createTelegramWebhookRouter());
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const port = server.address().port;

const ORIG = { log: console.log, error: console.error, warn: console.warn };
const appLogs = [];
console.log = (...a) => { appLogs.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")); };
console.error = console.log; console.warn = console.log;
const out = (s) => process.stdout.write(s + "\n");
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const CHAT = Number(process.env.TELEGRAM_APPROVAL_CHAT_ID);
let upd = 1, cbq = 1;
async function post(body, { secret = SECRET } = {}) {
  const r = await fetch(`http://127.0.0.1:${port}/telegram/webhook`, { method: "POST", headers: { "content-type": "application/json", ...(secret != null ? { "x-telegram-bot-api-secret-token": secret } : {}) }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => null) };
}
const callback = (data, { from = 111, chat = CHAT } = {}) => ({ update_id: upd++, callback_query: { id: `cbq-${cbq++}`, from: { id: from, is_bot: false, first_name: "it" }, message: { message_id: 5, chat: { id: chat, type: "supergroup" } }, data } });
let n = 0;
function newPayment({ pkg = "49baht_4scans_24h", amount = 49, status = "pending_verify" } = {}) {
  const uid = `Utg${String(++n).padStart(3, "0")}${"c".repeat(26)}`;
  const appUserId = q(`insert into app_users(line_user_id,status) values('${uid}','active') returning id`);
  const pid = q(`insert into payments(user_id,line_user_id,provider,amount,currency,status,package_code,package_name,expected_amount,unlock_hours,payment_ref) values('${appUserId}','${uid}','promptpay_manual',${amount},'THB','${status}','${pkg}','สแกน 4 ครั้ง',${amount},24,'IT-${n}') returning id`);
  return { uid, appUserId, pid };
}
const pay = (pid) => q(`select status||'|'||coalesce(approved_by,'-') from payments where id='${pid}'`);
const grants = (pid) => Number(q(`select count(*) from payment_entitlement_grants where payment_id='${pid}'`));
const audit = (pid, action, result) => Number(q(`select count(*) from payment_approval_audit where payment_id='${pid}' and action='${action}' and result='${result}'`));
// approve_confirmed:ok มี 2 แถวโดยดีไซน์ — RPC approve_payment_and_grant เขียนใน transaction เดียวกับ grant (actor 'telegram:<id>') + handler เขียนหลังแจ้งลูกค้า (actor '<id>', detail.customerNotified)
const confirmedOk = (pid) => ({ rpc: Number(q(`select count(*) from payment_approval_audit where payment_id='${pid}' and action='approve_confirmed' and result='ok' and actor like 'telegram:%'`)), handler: Number(q(`select count(*) from payment_approval_audit where payment_id='${pid}' and action='approve_confirmed' and result='ok' and actor not like 'telegram:%'`)) });
const auditDump = (pid) => q(`select channel||':'||action||':'||result||':'||coalesce(actor,'-') from payment_approval_audit where payment_id='${pid}' order by created_at`).replace(/\n/g, " · ");
const auditDenied = (reason) => Number(q(`select count(*) from payment_approval_audit where channel='telegram' and action='callback' and result='denied' and detail->>'reason'='${reason}'`));
const outbound = (uid) => q(`select kind||'|'||status||'|'||left(payload_json::text,80) from outbound_messages where line_user_id='${uid}' order by created_at`).split("\n").filter(Boolean);
const lastKeyboardToken = () => { const c = [...tgCalls].reverse().find((x) => x.method === "sendMessage" && x.body?.reply_markup); const d = c?.body?.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data || ""; return d.startsWith("cf:") ? d.slice(3) : null; };
const results = [];
async function t(name, fn) { try { await fn(); results.push(`PASS ${name}`); } catch (e) { results.push(`FAIL ${name}: ${e?.message || e}${e?.stderr ? " :: " + String(e.stderr).trim().slice(0, 300) : ""}`); process.exitCode = 1; } }

// ───────────────────────── โหมด live (ด้วยมือ): รอรับ callback จาก Telegram จริงจนสั่งหยุด ─────────────────────────
if (process.env.ENER_TG_IT_MODE === "live") {
  const fs = await import("node:fs");
  const OUT = process.env.ENER_TG_LIVE_OUT; fs.mkdirSync(OUT, { recursive: true });
  const LIVE_PORT = Number(process.env.ENER_TG_LIVE_PORT) || 3390;
  const dry = process.env.ENER_TG_DRY_RUN === "1";
  server.close();
  const live = app.listen(LIVE_PORT, "127.0.0.1");
  await new Promise((r, j) => { live.once("listening", r); live.once("error", j); });
  if (dry) fs.writeFileSync(`${OUT}/telegram-calls.jsonl`, "");
  const tgSeen = tgCalls.length;
  // seed: บัญชี + รายการสังเคราะห์ 2 รายการ (A = เส้นหลัก, B = กดซ้ำ/พร้อมกัน) แล้วส่งข้อความสลิป "รอตรวจ" เข้าห้องของ bot ใหม่
  const seeds = [newPayment(), newPayment()];
  const notified = [];
  for (const [i, p] of seeds.entries()) {
    const r = await notifyTelegramSlipPendingVerify({ paymentId: p.pid, paymentRef: `LIVE-IT-${i + 1}`, packageCode: "49baht_4scans_24h", packageName: "สแกน 4 ครั้ง (ทดสอบระบบแยก)", expectedAmount: 49, slipAmount: 49, reasons: ["ทดสอบระบบแยก — ไม่ใช่ลูกค้าจริง"], lineUserId: p.uid, slipUrl: null });
    notified.push({ pid: p.pid, ok: r.ok, reason: r.reason || null });
  }
  const ready = { event: "TG_LIVE_READY", port: LIVE_PORT, path: "/telegram/webhook", dryRun: dry, payments: seeds.map((p) => ({ pid: p.pid, uid: p.uid })), notified, startedAt: new Date().toISOString(), stopFile: `${OUT}/STOP` };
  fs.writeFileSync(`${OUT}/READY.json`, JSON.stringify(ready, null, 2));
  out(JSON.stringify(ready));
  // สตรีมเหตุการณ์สำคัญ (ไม่มี token/secret ใน log ของ service อยู่แล้ว) + บันทึก Telegram call ใน dry-run
  let logCursor = appLogs.length, tgCursor = tgSeen;
  const tick = () => {
    for (; logCursor < appLogs.length; logCursor++) { const l = appLogs[logCursor]; if (/TELEGRAM_|PAYMENT_APPROVED|OUTBOUND_ADMIN_ENQUEUED|OUTBOUND_ENQUEUE_DEDUPE|approval/.test(l)) out(l.slice(0, 220)); }
    if (dry) for (; tgCursor < tgCalls.length; tgCursor++) fs.appendFileSync(`${OUT}/telegram-calls.jsonl`, JSON.stringify(tgCalls[tgCursor]) + "\n");
  };
  let stopping = false;
  const stop = async (why) => {
    if (stopping) return; stopping = true; tick();
    let evidence;
    try { evidence = {
      event: "TG_LIVE_EVIDENCE", why, sha: process.env.ENER_TG_LIVE_SHA || null, dryRun: dry, stoppedAt: new Date().toISOString(),
      payments: seeds.map((p) => ({ pid: p.pid, uid: p.uid, status: pay(p.pid), grants: grants(p.pid), paidRemaining: q(`select coalesce(paid_remaining_scans,0) from app_users where id='${p.appUserId}'`), audit: auditDump(p.pid), tokens: q(`select count(*)||' total · used='||count(used_at) from telegram_approval_tokens where payment_id='${p.pid}'`), outbound: outbound(p.uid) })),
      deniedAudit: q(`select r||'='||n from (select coalesce(detail->>'reason','-') as r, count(*) as n from payment_approval_audit where channel='telegram' and action='callback' and result='denied' group by 1) x`).split("\n").filter(Boolean),
      lineOrAiAttemptsBlocked: blockedAttempts.length, blockedHosts: [...new Set(blockedAttempts)], telegramCallsDryRun: dry ? tgCalls.length : null,
      deliveryWorker: "none (ระบบแยก)", dbScope: "throwaway only",
    }; } catch (e) { evidence = { event: "TG_LIVE_EVIDENCE_PARTIAL", why, error: String(e?.message || e).slice(0, 300), blocked: blockedAttempts.length }; }
    const file = `${OUT}/evidence-${Date.now()}.json`;
    fs.writeFileSync(file, JSON.stringify(evidence, null, 2));
    out(JSON.stringify({ event: "TG_LIVE_STOPPED", why, evidenceFile: file, blocked: blockedAttempts.length }));
    live.close();
    console.log = ORIG.log; console.error = ORIG.error; console.warn = ORIG.warn;
    process.exit(0);
  };
  process.on("SIGINT", () => stop("SIGINT")); process.on("SIGTERM", () => stop("SIGTERM"));
  for (;;) { await new Promise((r) => setTimeout(r, 2000)); tick(); if (fs.existsSync(`${OUT}/STOP`)) { await stop("STOP file"); } }
}

await t("0 flag ปิด (ENABLED=false) → 404 เหมือนไม่มี endpoint แม้ secret ถูก · เปิด → ไม่ 404", async () => {
  process.env.TELEGRAM_SLIP_APPROVAL_ENABLED = "false";
  assert.equal((await post(callback("ap:x"))).status, 404);
  process.env.TELEGRAM_SLIP_APPROVAL_ENABLED = "true";
  assert.notEqual((await post({ update_id: upd++, message: { text: "hi" } })).status, 404);
});

await t("1 secret ผิด/ไม่มี → 401 ไม่แตะ DB · อัปเดตที่ไม่ใช่ปุ่ม → 200 ignored", async () => {
  const before = Number(q(`select count(*) from payment_approval_audit`));
  assert.equal((await post(callback("ap:x"), { secret: "wrong" })).status, 401);
  assert.equal((await post(callback("ap:x"), { secret: null })).status, 401);
  assert.equal(Number(q(`select count(*) from payment_approval_audit`)), before);
  const r = await post({ update_id: upd++, message: { message_id: 1, chat: { id: CHAT }, text: "อนุมัติ" } });
  assert.equal(r.status, 200); assert.equal(r.json?.ignored, true, "ข้อความตัวอักษรต้องไม่ทำอะไร");
});

await t("1b regression: callback เป็น JSON ต้องถูก parse (เดิม app.js ไม่มี json parser → ignored ทุกปุ่ม)", async () => {
  const r = await post(callback("ap:00000000-0000-4000-8000-000000000000", { from: 999 }));
  assert.equal(r.status, 200); assert.notEqual(r.json?.ignored, true, "callback ต้องไม่ถูกมองเป็น ignored: " + JSON.stringify(r.json));
});

const A = newPayment();
await t("2 แจ้งสลิปรอตรวจเข้า Telegram (bot/ห้องทดสอบ) → ปุ่ม ap:<paymentId> · audit notify_sent · ไม่มี token ใน log", async () => {
  const r = await notifyTelegramSlipPendingVerify({ paymentId: A.pid, paymentRef: "IT-A", packageCode: "49baht_4scans_24h", packageName: "สแกน 4 ครั้ง", expectedAmount: 49, slipAmount: 49, reasons: [], lineUserId: A.uid, slipUrl: null });
  assert.equal(r.ok, true, JSON.stringify(r));
  const c = tgCalls.at(-1); assert.equal(c.method, "sendMessage"); assert.equal(String(c.body.chat_id), String(CHAT));
  assert.equal(c.body.reply_markup.inline_keyboard[0][0].callback_data, `ap:${A.pid}`);
  assert.equal(audit(A.pid, "notify_sent", "ok"), 1);
  assert.ok(!appLogs.some((l) => l.includes("it-bot-token")), "token ต้องไม่อยู่ใน log");
});

await t("3 'คำขอถูก denied': user id ไม่อยู่ในรายชื่อ / ผิด chat → ปฏิเสธ + audit · รายการไม่เปลี่ยน (≠ เจ้าหน้าที่ปฏิเสธสลิป)", async () => {
  const d1 = auditDenied("actor_not_allowed"), d2 = auditDenied("chat_not_allowed");
  const r1 = await post(callback(`ap:${A.pid}`, { from: 999 }));
  assert.equal(r1.status, 200); assert.equal(auditDenied("actor_not_allowed"), d1 + 1);
  const r2 = await post(callback(`ap:${A.pid}`, { from: 111, chat: -42 }));
  assert.equal(r2.status, 200); assert.equal(auditDenied("chat_not_allowed"), d2 + 1);
  assert.equal(pay(A.pid), "pending_verify|-"); assert.equal(grants(A.pid), 0);
  const ans = tgCalls.filter((c) => c.method === "answerCallbackQuery").slice(-2);
  assert.ok(ans.every((c) => c.body.show_alert === true && /ไม่มีสิทธิ์/.test(c.body.text)), JSON.stringify(ans));
});

let tokenA = null;
await t("4 ขั้น 1 ap: โดยผู้อนุมัติในห้องถูก → ออกปุ่มยืนยัน cf:<token> · ยังไม่เปลี่ยนสถานะ/ไม่เติม", async () => {
  const r = await post(callback(`ap:${A.pid}`));
  assert.equal(r.status, 200);
  tokenA = lastKeyboardToken(); assert.ok(tokenA, "ต้องมีปุ่ม cf: " + JSON.stringify(tgCalls.slice(-2)));
  assert.equal(Number(q(`select count(*) from telegram_approval_tokens where payment_id='${A.pid}' and used_at is null`)), 1);
  assert.equal(pay(A.pid), "pending_verify|-"); assert.equal(grants(A.pid), 0); assert.equal(audit(A.pid, "approve_requested", "ok"), 1);
});

await t("5 ขั้น 2 cf: → อนุมัติจริง: payments=paid · grant 1 แถว · audit approve_confirmed ok · ข้อความแจ้งลูกค้าถูก 'กักไว้' ใน outbound (ไม่ส่ง LINE)", async () => {
  const r = await post(callback(`cf:${tokenA}`, { from: 222 }));
  assert.equal(r.status, 200);
  assert.equal(pay(A.pid), "paid|telegram:222"); assert.equal(grants(A.pid), 1, "grants: " + auditDump(A.pid)); assert.deepEqual(confirmedOk(A.pid), { rpc: 1, handler: 1 }, "audit ok (RPC 1 + handler 1): " + auditDump(A.pid));
  assert.equal(q(`select used_by_tg_user_id from telegram_approval_tokens where token='${tokenA}'`), "222");
  const ob = outbound(A.uid); assert.equal(ob.length, 1, JSON.stringify(ob)); assert.match(ob[0], /^approve_notify\|queued\|/);
  assert.equal(q(`select paid_remaining_scans from app_users where id='${A.appUserId}'`), "4");
  const ans = tgCalls.filter((c) => c.method === "answerCallbackQuery").at(-1); assert.match(ans.body.text, /อนุมัติแล้ว/);
});

await t("6 กด cf: เดิมซ้ำ → token ใช้แล้ว ปฏิเสธ · ap: ซ้ำบนรายการที่ paid → stale · ไม่เติมซ้ำ · sweep แจ้งลูกค้าไม่สร้างแถวซ้ำ", async () => {
  await post(callback(`cf:${tokenA}`));
  assert.equal(grants(A.pid), 1, "grants ซ้ำ"); assert.deepEqual(confirmedOk(A.pid), { rpc: 1, handler: 1 }, "audit ต้องไม่เพิ่ม: " + auditDump(A.pid));
  await post(callback(`ap:${A.pid}`));
  assert.equal(audit(A.pid, "approve_requested", "stale"), 1);
  const s = await runPaymentGrantNotifySweep({ limit: 10 });
  assert.equal(outbound(A.uid).length, 1, "ไม่สร้างข้อความซ้ำ"); assert.ok(s.alreadyQueued + s.enqueued >= 0);
  assert.equal(q(`select paid_remaining_scans from app_users where id='${A.appUserId}'`), "4");
});

await t("7 concurrent: 3 คน/3 ครั้งกด cf: token เดียวพร้อมกัน → เติมครั้งเดียว grant 1 · audit ok 1", async () => {
  const B = newPayment();
  await post(callback(`ap:${B.pid}`)); const tok = lastKeyboardToken(); assert.ok(tok);
  const rs = await Promise.all([111, 222, 111].map((from) => post(callback(`cf:${tok}`, { from }))));
  assert.ok(rs.every((r) => r.status === 200));
  assert.equal(grants(B.pid), 1, "grants B"); assert.deepEqual(confirmedOk(B.pid), { rpc: 1, handler: 1 }, "audit B: " + auditDump(B.pid)); assert.equal(pay(B.pid).split("|")[0], "paid");
  assert.equal(q(`select paid_remaining_scans from app_users where id='${B.appUserId}'`), "4");
});

await t("8 ปุ่มหมดอายุ → ปฏิเสธ ไม่เติม · ยอด/แพ็กเปลี่ยนหลังออกปุ่ม → stale ไม่เติม", async () => {
  const C = newPayment();
  await post(callback(`ap:${C.pid}`)); const tok = lastKeyboardToken();
  q(`update telegram_approval_tokens set expires_at = now() - interval '1 minute' where token='${tok}'`);
  await post(callback(`cf:${tok}`));
  assert.equal(grants(C.pid), 0); assert.equal(pay(C.pid).split("|")[0], "pending_verify");
  const D = newPayment();
  await post(callback(`ap:${D.pid}`)); const tok2 = lastKeyboardToken();
  q(`update payments set expected_amount=99 where id='${D.pid}'`);
  await post(callback(`cf:${tok2}`));
  assert.equal(grants(D.pid), 0); assert.equal(audit(D.pid, "approve_confirmed", "stale"), 1);
});

await t("9 'เจ้าหน้าที่ปฏิเสธสลิป' ยังไม่มีใน Telegram handler: ปุ่ม rj: → 'ไม่รองรับ' รายการไม่เปลี่ยน (ช่องว่างฟีเจอร์ ไม่ใช่ denied)", async () => {
  const E = newPayment();
  const r = await post(callback(`rj:${E.pid}`));
  assert.equal(r.status, 200);
  const ans = tgCalls.filter((c) => c.method === "answerCallbackQuery").at(-1); assert.match(ans.body.text, /ไม่รองรับ/);
  assert.equal(pay(E.pid), "pending_verify|-"); assert.equal(Number(q(`select count(*) from payments where id='${E.pid}' and status='rejected'`)), 0);
});

await t("10 ตลอดชุด: Telegram ถูกตัดจบในเครื่องทุกครั้ง · ไม่มีการเรียกออกนอก (LINE/AI/Telegram จริง) blocked=0", async () => {
  assert.ok(tgCalls.length >= 8, String(tgCalls.length));
  assert.deepEqual(blockedAttempts, [], JSON.stringify([...new Set(blockedAttempts)]));
  assert.ok(!appLogs.some((l) => l.includes("it-bot-token") || l.includes(SECRET)), "token/secret ต้องไม่อยู่ใน log");
});

server.close();
console.log = ORIG.log; console.error = ORIG.error; console.warn = ORIG.warn;
if (process.env.ENER_TG_IT_APP_LOG) (await import("node:fs")).writeFileSync(process.env.ENER_TG_IT_APP_LOG, appLogs.join("\n"));
out(results.join("\n"));
out(`telegram calls (short-circuit): ${tgCalls.length} · blocked external attempts: ${blockedAttempts.length}`);
out(process.exitCode ? "RESULT: FAIL" : "RESULT: PASS (Telegram approval router → handler → RPC)");
process.exit(process.exitCode || 0);
