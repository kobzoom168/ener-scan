/**
 * Integration test — เส้น LINE webhook จริงสำหรับ "ลูกค้าใหม่ทดลอง 2 ครั้ง" (057 ON) ด้วยบัญชีสังเคราะห์
 * (Codex 1 ต.ค. 2026: กบไม่มีบัญชี LINE ใหม่ → ทดสอบ follow/ข้อความแรก → webhook รูป → สิทธิ์ trial → paywall ครั้งที่ 3
 *  ผ่าน handler/router จริงในระบบแยก · ใช้ secret ทดสอบ · ไม่ยิง webhook สังเคราะห์เข้า Pro/staging)
 *
 * ของจริง: express + `line.middleware` (ตรวจลายเซ็นจริง) + `lineWebhookRouter` + handleEvent/handleImageMessage/finalizeAcceptedImage
 *          + checkScanAccess + ingestScanImageAsyncV2 + trigger 057/064 บน Postgres 16 (schema เต็มของ staging, ไม่มีข้อมูล) + PostgREST
 * guard: net.Socket#connect บล็อกทุก host ที่ไม่ใช่ loopback ก่อนส่ง (fixtures/it-network-guard.mjs) · child ไม่สืบทอด env จริง (fixtures/it-child-env.mjs)
 * ของปลอม (ผ่าน --import hook): @line/bot-sdk Client (บันทึก reply · ส่งรูปจาก memory) · objectCheck AI → single_supported · S3 · thumbnail
 * สิ่งที่ยังไม่ใช่ของจริง: LINE platform เอง (ลายเซ็น/การส่ง), AI, worker สแกน (จำลองการส่งมอบด้วย updateScanJob)
 *
 * รัน:  node scripts/ops/test-line-webhook-trial-integration.mjs
 */
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import crypto from "node:crypto";
import assert from "node:assert/strict";

// ชื่อ container/network ไม่ซ้ำต่อรอบ — cleanup เฉพาะที่รอบนี้สร้าง (ไม่ rm -f ชื่อคงที่ของรอบอื่น)
const RUN = process.env.ENER_LINE_IT_RUN || `${process.pid}-${crypto.randomBytes(3).toString("hex")}`;
const NET = `ener-line-it-${RUN}-net`, PG = `ener-line-it-${RUN}-pg`, PGRST = `ener-line-it-${RUN}-pgrst`;
const PORT = 31000 + (process.pid % 20000);
const JWT_SECRET = crypto.randomBytes(32).toString("hex");
const CHANNEL_SECRET = "it-channel-secret-" + crypto.randomBytes(8).toString("hex");
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

if (!process.env.ENER_LINE_IT_CHILD) {
  process.on("uncaughtException", (e) => { console.error(e); teardown(); process.exit(1); });
  sh("docker", ["network", "create", NET]);
  sh("docker", ["run", "-d", "--name", PG, "--network", NET, "-e", "POSTGRES_PASSWORD=pg", "pgvector/pgvector:pg16"]);
  // init script ของ image รีสตาร์ต server หนึ่งครั้ง — ต้องรอจน CREATE DATABASE สำเร็จจริง ไม่ใช่แค่ select 1 ครั้งแรก
  let created = false;
  for (let i = 0; i < 120 && !created; i++) { try { psql("CREATE DATABASE line_it"); created = true; } catch { execFileSync("sleep", ["0.5"]); } }
  if (!created) { teardown(); assert.ok(created, "Postgres ไม่พร้อม"); }
  psql(readFileSync(new URL("fixtures/staging-schema-2026-10-01.sql", import.meta.url), "utf8"), "line_it");
  psql(readFileSync(new URL("sql/057_new_customer_trial.sql", root), "utf8"), "line_it");
  psql(readFileSync(new URL("sql/064_bonus_reservation.sql", root), "utf8"), "line_it");
  psql(readFileSync(new URL("sql/065_trial_dedup_evidence.sql", root), "utf8"), "line_it");
  sh("docker", ["run", "-d", "--name", PGRST, "--network", NET, "-p", `127.0.0.1:${PORT}:3000`,
    "-e", `PGRST_DB_URI=postgres://authenticator:authenticator@${PG}:5432/line_it`,
    "-e", "PGRST_DB_SCHEMA=public", "-e", "PGRST_DB_ANON_ROLE=web_anon", "-e", `PGRST_JWT_SECRET=${JWT_SECRET}`,
    "-e", "PGRST_SERVER_PORT=3000", "postgrest/postgrest:v12.2.3"]);
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/`); up = r.status < 500; } catch { /* ยังไม่ขึ้น */ }
    if (!up) execFileSync("sleep", ["0.5"]);
  }
  if (!up) { teardown(); assert.ok(up, "PostgREST ไม่ขึ้น"); }
  const { buildChildEnv } = await import("./fixtures/it-child-env.mjs");
  const env = buildChildEnv(root, {
    ENER_LINE_IT_CHILD: "1", ENER_LINE_IT_PG: PG, ENER_LINE_IT_APP_LOG: process.env.ENER_LINE_IT_APP_LOG || "",
    LOCAL_POSTGREST_URL: `http://127.0.0.1:${PORT}`, LOCAL_POSTGREST_ANON_KEY: jwt("web_anon"),
    LOCAL_POSTGREST_SERVICE_KEY: jwt("service_role"), SUPABASE_URL: "http://127.0.0.1:9", SUPABASE_SERVICE_ROLE_KEY: "x",
    OPENAI_API_KEY: "sk-test", CHANNEL_ACCESS_TOKEN: "it-token", CHANNEL_SECRET, GEMINI_API_KEY: "g", REDIS_URL: "",
    IMAGE_DEDUP_ENABLED: "true", SCAN_V2_UPLOAD_BUCKET: "it-bucket", NODE_ENV: "test", ENABLE_ASYNC_SCAN_V2: "true",
    LIFF_ID: "2000000000-abcdefgh", SESSION_SECRET: "it-session-secret", ADMIN_LINE_USER_ID: "U" + "a".repeat(32),
  });
  const r = spawnSync(process.execPath, ["--import", new URL("fixtures/line-it-hooks.mjs", import.meta.url).pathname, new URL(import.meta.url).pathname],
    { env, stdio: "inherit" });
  teardown();
  process.exit(r.status ?? 1);
}

// ───────────────────────── child: router จริง ─────────────────────────
const PGC = process.env.ENER_LINE_IT_PG;
const q = (s, db = "line_it") => sh("docker", ["exec", "-i", PGC, "psql", "-U", "postgres", "-d", db, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"], { input: s });

// กันเครือข่ายออกนอกเครื่องก่อนส่ง (ทุกช่องทาง TCP/TLS) — import ก่อนโมดูลแอป · loading animation ของ LINE ตัดจบในเครื่อง
const { blockedAttempts, shortCircuitFetch, selfTestGuard } = await import("./fixtures/it-network-guard.mjs");
await selfTestGuard(); // ยืนยันว่าบล็อกก่อนส่งจริง ก่อนโหลดโมดูลแอป
const loadingHits = [];
shortCircuitFetch(/^https:\/\/api\.line\.me\/v2\/bot\/chat\/loading\/start/, undefined, (u) => loadingHits.push(u));
const express = (await import("express")).default;
const line = (await import("@line/bot-sdk")).default;
const { lineWebhookRouter } = await import(new URL("src/routes/lineWebhook.js", root));
const { lineWebhookErrorHandler } = await import(new URL("src/middleware/lineWebhookError.middleware.js", root));
const { updateScanJob } = await import(new URL("src/stores/scanV2/scanJobs.db.js", root));
const { resolveLiffRights } = await import(new URL("src/routes/liff.routes.js", root));
const { findForbiddenPhrase } = await import(new URL("src/services/entitlementCopy.service.js", root));
const { checkScanAccess } = await import(new URL("src/services/paymentAccess.service.js", root));
const { processScanJob } = await import(new URL("src/services/scanV2/processScanJob.service.js", root));
const { getScanJobById } = await import(new URL("src/stores/scanV2/scanJobs.db.js", root));

const lineCfg = { channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN, channelSecret: process.env.CHANNEL_SECRET };
const app = express();
app.post("/webhook/line", line.middleware(lineCfg), lineWebhookRouter(lineCfg));
app.use(lineWebhookErrorHandler);
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const port = server.address().port;

const ORIG = { log: console.log, error: console.error, warn: console.warn };
const appLogs = [];
console.log = (...a) => { appLogs.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")); };
console.error = console.log; console.warn = console.log;
const out = (s) => process.stdout.write(s + "\n");
const LINE = globalThis.__lineIt;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sign = (body) => crypto.createHmac("sha256", process.env.CHANNEL_SECRET).update(body).digest("base64");
async function post(events, { badSignature = false } = {}) {
  const body = JSON.stringify({ destination: "Ubot", events });
  const r = await fetch(`http://127.0.0.1:${port}/webhook/line`, { method: "POST", headers: { "content-type": "application/json", "x-line-signature": badSignature ? "bad" : sign(body) }, body });
  return r.status;
}
async function waitFor(fn, { timeoutMs = 20000, label = "" } = {}) {
  const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > timeoutMs) throw new Error(`timeout: ${label}`); await sleep(200); }
}
// timestamp ของ event ต้องเป็นเวลาจริง — ระบบใช้มันวัด burst window (8 วิ) ไม่ใช่เวลาที่ webhook มาถึง
const ts = () => Date.now();
const evFollow = (uid) => ({ type: "follow", timestamp: ts(), replyToken: "rt-follow-" + uid.slice(1, 8), source: { type: "user", userId: uid }, mode: "active" });
const evImage = (uid, mid) => ({ type: "message", timestamp: ts(), replyToken: "rt-" + mid, source: { type: "user", userId: uid }, mode: "active",
  message: { id: mid, type: "image", contentProvider: { type: "line" } } });
const image = (seed) => Buffer.concat([Buffer.from("\xff\xd8\xff\xe0IT"), Buffer.from(seed.repeat(64))]);
const callsSince = (n, type) => LINE.calls.slice(n).filter((c) => c.type === type);
const textOf = (m) => (m.type === "text" ? m.text : m.type === "flex" ? `${m.altText} ${JSON.stringify(m.contents)}` : JSON.stringify(m));
const repliesText = (calls) => calls.flatMap((c) => c.messages || []).map(textOf).join("\n");
const jobsOf = (uid) => q(`select id||'|'||status||'|'||coalesce(free_access_kind,'-')||'|'||access_source from scan_jobs where line_user_id='${uid}' order by created_at`).split("\n").filter(Boolean);
const deliver = async (uid) => { for (const j of jobsOf(uid)) { const id = j.split("|")[0]; if (/\|queued\|/.test(j)) { await updateScanJob(id, { status: "processing" }); await updateScanJob(id, { status: "completed" }); await updateScanJob(id, { status: "delivered" }); } } };
let n = 0;
const newUid = () => `Uline${String(++n).padStart(3, "0")}${"b".repeat(24)}`;
const results = [];
async function t(name, fn) { try { await fn(); results.push(`PASS ${name}`); } catch (e) { results.push(`FAIL ${name}: ${e?.message || e}${e?.stderr ? " :: " + String(e.stderr).trim().slice(0, 300) : ""}`); process.exitCode = 1; } }
const noForbidden = (text, where) => { const f = findForbiddenPhrase(text, "new_customer"); assert.equal(f, null, `${where}: คำต้องห้าม "${f}" ใน: ${text.slice(0, 300)}`); };

/** ส่งรูปผ่าน webhook จริง แล้วรอจน handler ตอบ (reply ของ messageId นี้) หรือสร้างงาน */
// คนจริงส่งทีละรูปห่างกัน — ระบบรวม candidate 5 วิ (multi-image) + request-block หลังจบเทิร์น → เว้น gap ให้พ้นหน้าต่างเหล่านี้
const lastImageAt = new Map();
async function sendImage(uid, mid, seed, { expectJob, gapMs = 9000 } = {}) {
  const wait = (lastImageAt.get(uid) || 0) + gapMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastImageAt.set(uid, Date.now());
  LINE.images.set(mid, image(seed));
  const before = LINE.calls.length;
  assert.equal(await post([evImage(uid, mid)]), 200);
  // จบเทิร์น = CHAT_TURN_AI_CHAIN ของ messageId นี้ (พิมพ์ทุกเทิร์นแม้ reply ถูกกันซ้ำ/เงียบ) · สำรอง: reply หรืองานถูกสร้าง
  await waitFor(() => appLogs.some((l) => l.includes(`"event":"CHAT_TURN_AI_CHAIN"`) && l.includes(`"messageId":"${mid}"`))
    || callsSince(before, "reply").some((c) => c.replyToken === "rt-" + mid) || (expectJob && jobsOf(uid).length >= expectJob), { timeoutMs: 30000, label: `image ${mid}` });
  await sleep(300);
  return { before, replies: callsSince(before, "reply").filter((c) => c.replyToken === "rt-" + mid), downloads: callsSince(before, "getMessageContent").filter((c) => c.messageId === mid), ai: callsSince(before, "objectCheckAI").filter((c) => c.messageId === mid) };
}

q(`select set_new_customer_trial_policy(true)`);
const since = q(`select (value->>'eligible_since') from app_settings where key='new_customer_trial'`);
assert.ok(since, "ต้องมี eligible_since หลังเปิดสวิตช์");

await t("0 ลายเซ็นผิด → 401 ไม่ประมวลผล · ลายเซ็นถูก → 200 ack", async () => {
  const uid = newUid();
  assert.equal(await post([evFollow(uid)], { badSignature: true }), 401);
  assert.equal(q(`select count(*) from app_users where line_user_id='${uid}'`), "0");
});

const A = newUid();
await t("1 follow ผ่าน router จริง → app_users ถูกสร้าง (created_at ≥ eligible_since ตามธรรมชาติ) · welcome ไม่สัญญาฟรีรายวัน", async () => {
  const before = LINE.calls.length;
  assert.equal(await post([evFollow(A)]), 200);
  await waitFor(() => q(`select count(*) from app_users where line_user_id='${A}'`) === "1", { label: "app_users หลัง follow" });
  assert.equal(q(`select (created_at >= '${since}'::timestamptz) from app_users where line_user_id='${A}'`), "t");
  assert.equal(JSON.parse(q(`select new_customer_trial_status('${A}')`)).eligible, true);
  await waitFor(() => callsSince(before, "reply").length > 0 || callsSince(before, "push").length > 0, { label: "welcome" });
  const welcome = repliesText(LINE.calls.slice(before));
  noForbidden(welcome, "welcome");
  // วันเกิดเป็นข้อมูลที่ลูกค้าพิมพ์เอง — ใส่ตรงใน DB (ขั้นสังเคราะห์เดียวของบัญชีใหม่) เพื่อไม่ผ่านเส้นแชท AI
  q(`insert into users(id,birthdate) values('${A}','1990-01-01') on conflict (id) do update set birthdate=excluded.birthdate`);
});

await t("2 รูป #1 ผ่าน webhook จริง → ดาวน์โหลด → objectCheck → งาน kind=trial · webhook ส่งซ้ำ (message id เดิม) = งานเดียว", async () => {
  const r = await sendImage(A, "mid-A-1", "P", { expectJob: 1 });
  assert.equal(jobsOf(A).length, 1, JSON.stringify({ jobs: jobsOf(A), replies: r.replies.map((c) => c.messages.map(textOf)) }));
  assert.match(jobsOf(A)[0], /\|queued\|trial\|free$/);
  assert.equal(r.downloads.length, 1); assert.equal(r.ai.length, 1);
  const a1 = await checkScanAccess({ userId: A }); assert.equal(a1.freeScansRemaining, 1); assert.equal(a1.freePolicy, "new_customer");
  // LINE ส่ง event เดิมซ้ำ (retry)
  const again = await sendImage(A, "mid-A-1", "P");
  assert.equal(jobsOf(A).length, 1, "inbound ซ้ำต้องไม่สร้างงานใหม่");
  void again;
});

await t("3 ครั้งที่ 3 ขณะงานก่อนหน้ายังรอผล → แจ้ง 'รอรับผลก่อน' ไม่มีงาน ไม่ดาวน์โหลด ไม่เรียก AI", async () => {
  const r2 = await sendImage(A, "mid-A-2", "Q", { expectJob: 2 });
  assert.equal(jobsOf(A).length, 2, JSON.stringify(r2.replies.map((c) => c.messages.map(textOf))));
  const r3 = await sendImage(A, "mid-A-3", "R");
  assert.equal(jobsOf(A).length, 2);
  assert.equal(r3.downloads.length, 0, "ต้องไม่ดาวน์โหลดรูป"); assert.equal(r3.ai.length, 0, "ต้องไม่เรียก AI");
  const txt = repliesText(r3.replies);
  assert.match(txt, /รอรับผลก่อน|รอผล/, txt); noForbidden(txt, "in-flight notice");
});

await t("4 ส่งมอบงาน 1–2 แล้วรูป #3 → paywall 'ทดลองฟรีครบ 2 ครั้ง' ก่อนดาวน์โหลด/AI · ไม่มีงาน · LIFF = 0 · ไม่มีคำต้องห้าม", async () => {
  await deliver(A);
  const r = await sendImage(A, "mid-A-4", "S");
  assert.equal(jobsOf(A).length, 2, "ครั้งที่ 3 ต้องไม่มีงานใหม่");
  assert.equal(r.downloads.length, 0); assert.equal(r.ai.length, 0);
  const txt = repliesText(r.replies);
  assert.match(txt, /ใช้สิทธิ์ทดลองฟรีครบ 2 ครั้งแล้ว/, txt);
  noForbidden(txt, "paywall");
  assert.ok(r.replies.some((c) => c.messages.some((m) => m.type === "flex")), "paywall ต้องเป็น Flex เลือกแพ็ก");
  const liff = await resolveLiffRights(A);
  assert.equal(liff.total, 0); assert.equal(liff.freePolicy, "new_customer"); assert.equal(liff.trialEligible, true);
  // ส่งอีกรูป (ครั้งที่ 4) ยังกันเหมือนเดิม
  const r5 = await sendImage(A, "mid-A-5", "T");
  assert.equal(jobsOf(A).length, 2); assert.equal(r5.downloads.length, 0);
});

await t("5 บัญชีเก่า (created_at ก่อน cutoff) ส่งรูป → 'เติมสิทธิ์เพื่อสแกนองค์ใหม่' ไม่มีฟรีรายวัน ไม่ดาวน์โหลด ไม่เรียก AI", async () => {
  const B = newUid();
  assert.equal(await post([evFollow(B)]), 200);
  await waitFor(() => q(`select count(*) from app_users where line_user_id='${B}'`) === "1", { label: "follow B" });
  q(`update app_users set created_at=now()-interval '30 days' where line_user_id='${B}'`); // บัญชีเก่าสังเคราะห์
  q(`insert into users(id,birthdate) values('${B}','1985-05-05') on conflict (id) do update set birthdate=excluded.birthdate`);
  const r = await sendImage(B, "mid-B-1", "U");
  assert.equal(jobsOf(B).length, 0);
  assert.equal(r.downloads.length, 0); assert.equal(r.ai.length, 0);
  const txt = repliesText(r.replies);
  assert.match(txt, /เติมสิทธิ์เพื่อสแกนองค์ใหม่|ยังไม่มีสิทธิ์/, txt); noForbidden(txt, "old-account paywall");
});

await t("6 รูปซ้ำ (065): งานที่ 2 เป็นรูปเดิม → worker จริงพบซ้ำ → หลักฐาน queued → สิทธิ์คืนทันทีไม่รอส่ง → รูปใหม่ได้งาน", async () => {
  const C = newUid();
  assert.equal(await post([evFollow(C)]), 200);
  await waitFor(() => q(`select count(*) from app_users where line_user_id='${C}'`) === "1", { label: "follow C" });
  q(`insert into users(id,birthdate) values('${C}','1992-02-02') on conflict (id) do update set birthdate=excluded.birthdate`);
  const r1 = await sendImage(C, "mid-C-1", "V", { expectJob: 1 });
  assert.equal(jobsOf(C).length, 1, JSON.stringify(r1.replies.map((c) => c.messages.map(textOf))));
  const j1 = jobsOf(C)[0].split("|")[0];
  const appUserId = q(`select app_user_id from scan_jobs where id='${j1}'`);
  const resId = q(`insert into scan_results_v2(scan_job_id,line_user_id,app_user_id,report_url) values('${j1}','${C}','${appUserId}','https://example.test/r/c1') returning id`);
  await updateScanJob(j1, { status: "processing" }); await updateScanJob(j1, { status: "completed", result_id: resId }); await updateScanJob(j1, { status: "delivered" });
  // รูปเดิม (bytes เดิม) message ใหม่ → ผ่าน router → งานที่ 2 (จองช่องสุดท้ายไว้ก่อน)
  const r2 = await sendImage(C, "mid-C-2", "V", { expectJob: 2 });
  assert.equal(jobsOf(C).length, 2, JSON.stringify(r2.replies.map((c) => c.messages.map(textOf))));
  assert.equal(Number(q(`select new_customer_trial_used('${appUserId}')`)), 2);
  const j2 = jobsOf(C)[1].split("|")[0];
  q(`update scan_jobs set status='processing', locked_at=now(), worker_id='it' where id='${j2}'`);
  const row = await getScanJobById(j2);
  await processScanJob("it-worker", row); // worker จริง: sha256 dedup → outbound skipQuotaDecrement=true (queued)
  assert.equal(q(`select count(*) from outbound_messages where related_job_id='${j2}' and kind='scan_result' and status='queued' and payload_json->>'skipQuotaDecrement'='true'`), "1", "หลักฐานรูปซ้ำยัง queued (ยังไม่ส่ง)");
  assert.equal(Number(q(`select new_customer_trial_used('${appUserId}')`)), 1, "065: คืนทันทีจากหลักฐาน ไม่รอ sent");
  const liff = await resolveLiffRights(C); assert.equal(liff.total, 1); assert.equal(liff.freeLeft, 1);
  const r3 = await sendImage(C, "mid-C-3", "W", { expectJob: 3 });
  assert.equal(jobsOf(C).length, 3, "ช่องที่คืนมาใช้ได้จริง " + JSON.stringify(r3.replies.map((c) => c.messages.map(textOf))));
  assert.equal(Number(q(`select new_customer_trial_used('${appUserId}')`)), 2);
});

await t("7 ตลอดชุด: ไม่มีการเรียกออกนอกเครื่อง — guard บล็อกก่อนส่ง (blocked=0) · loading ตัดจบในเครื่อง", async () => {
  assert.deepEqual(blockedAttempts, [], JSON.stringify([...new Set(blockedAttempts)]));
  assert.ok(loadingHits.length > 0, "loading animation ต้องถูกตัดจบในเครื่อง (ยืนยันว่า guard/short-circuit ทำงาน)");
});

q(`select set_new_customer_trial_policy(false)`);
server.close();
console.log = ORIG.log; console.error = ORIG.error; console.warn = ORIG.warn;
if (process.env.ENER_LINE_IT_APP_LOG) { (await import("node:fs")).writeFileSync(process.env.ENER_LINE_IT_APP_LOG, appLogs.join("\n")); }
else if (process.exitCode) { out("── app log ท้าย ๆ (ช่วยวินิจฉัย; ตั้ง ENER_LINE_IT_APP_LOG=ไฟล์ เพื่อเก็บทั้งหมด) ──"); out(appLogs.slice(-60).map((l) => l.slice(0, 220)).join("\n")); }
out(results.join("\n"));
out(`blocked external attempts: ${blockedAttempts.length} · loading short-circuit hits: ${loadingHits.length}`);
out(process.exitCode ? "RESULT: FAIL" : "RESULT: PASS (LINE webhook router → trial → paywall · 065)");
process.exit(process.exitCode || 0);
