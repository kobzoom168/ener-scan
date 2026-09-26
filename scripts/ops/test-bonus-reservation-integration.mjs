/**
 * Integration test — lifecycle โบนัสชวนเพื่อน ผ่านด่านรับรูปจริง + worker จริง + DB จริง (064)
 * (กบ/Codex 26 ก.ย. 2026: "ไม่ใช้แค่ source anchor หรือทดสอบ checkScanAccess แยก")
 *
 * ของจริง: Postgres 16 + PostgREST (container ใช้แล้วทิ้ง บน docker network ส่วนตัว) · trigger 057+064 ·
 *          checkScanAccess · ingestScanImageAsyncV2 · processScanJob (ถึงจุด dedup) · failJob · RPC release/sweep
 * ของปลอม: S3 storage + thumbnail (sharp) — ผ่าน --import hook เท่านั้น
 *
 * รัน:  node scripts/ops/test-bonus-reservation-integration.mjs
 *       (สคริปต์สร้าง container เอง แล้ว spawn ตัวเองเป็น child พร้อม hook · ลบ container เมื่อจบ)
 * ไม่แตะ .env / DB ของแอป / เครือข่ายภายนอก
 */
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import crypto from "node:crypto";
import assert from "node:assert/strict";

const NET = "ener-bonus-it-net", PG = "ener-bonus-it-pg", PGRST = "ener-bonus-it-pgrst";
const PORT = 30000 + (process.pid % 20000);
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

if (!process.env.ENER_BONUS_IT_CHILD) {
  process.on("uncaughtException", (e) => { console.error(e); teardown(); process.exit(1); });
  teardown();
  sh("docker", ["network", "create", NET]);
  sh("docker", ["run", "-d", "--name", PG, "--network", NET, "-e", "POSTGRES_PASSWORD=pg", "postgres:16-alpine"]);
  for (let i = 0; i < 60; i++) {
    try { psql("select 1"); break; } catch { execFileSync("sleep", ["0.5"]); }
  }
  psql("CREATE DATABASE bonus_it");
  psql(readFileSync(new URL("fixtures/scanv2-bonus-schema.sql", import.meta.url), "utf8"), "bonus_it");
  psql(readFileSync(new URL("sql/057_new_customer_trial.sql", root), "utf8"), "bonus_it");
  const m064 = readFileSync(new URL("sql/064_bonus_reservation.sql", root), "utf8");
  psql(m064, "bonus_it"); psql(m064, "bonus_it"); // idempotent
  sh("docker", ["run", "-d", "--name", PGRST, "--network", NET, "-p", `127.0.0.1:${PORT}:3000`,
    "-e", `PGRST_DB_URI=postgres://authenticator:authenticator@${PG}:5432/bonus_it`,
    "-e", "PGRST_DB_SCHEMA=public", "-e", "PGRST_DB_ANON_ROLE=web_anon", "-e", `PGRST_JWT_SECRET=${JWT_SECRET}`,
    "-e", "PGRST_SERVER_PORT=3000", "postgrest/postgrest:v12.2.3"]);
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/`); up = r.status < 500; } catch { /* ยังไม่ขึ้น */ }
    if (!up) execFileSync("sleep", ["0.5"]);
  }
  if (!up) { teardown(); assert.ok(up, "PostgREST ไม่ขึ้น"); }
  const env = {
    ...process.env, ENER_BONUS_IT_CHILD: "1", ENER_BONUS_IT_PG: PG, ENER_BONUS_IT_PORT: String(PORT),
    LOCAL_POSTGREST_URL: `http://127.0.0.1:${PORT}`, LOCAL_POSTGREST_ANON_KEY: jwt("web_anon"),
    LOCAL_POSTGREST_SERVICE_KEY: jwt("service_role"), SUPABASE_URL: "http://127.0.0.1:9", SUPABASE_SERVICE_ROLE_KEY: "x",
    OPENAI_API_KEY: "sk-test", CHANNEL_ACCESS_TOKEN: "t", CHANNEL_SECRET: "s", GEMINI_API_KEY: "g", REDIS_URL: "",
    IMAGE_DEDUP_ENABLED: "true", SCAN_V2_UPLOAD_BUCKET: "it-bucket", NODE_ENV: "test",
  };
  for (const line of readFileSync(new URL(".env.example", root), "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=/); if (m && !env[m[1]]) env[m[1]] = "test-placeholder";
  }
  const r = spawnSync(process.execPath, ["--import", new URL("fixtures/bonus-it-hooks.mjs", import.meta.url).pathname, new URL(import.meta.url).pathname],
    { env, stdio: "inherit" });
  teardown();
  process.exit(r.status ?? 1);
}

// ───────────────────────── child: ทดสอบกับของจริง ─────────────────────────
const PGC = process.env.ENER_BONUS_IT_PG;
const q = (s, db = "bonus_it") => sh("docker", ["exec", "-i", PGC, "psql", "-U", "postgres", "-d", db, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"], { input: s });
const { checkScanAccess } = await import(new URL("src/services/paymentAccess.service.js", root));
const { ingestScanImageAsyncV2, quotaGuardCodeFromError } = await import(new URL("src/services/scanV2/webhookImageIngestion.service.js", root));
const { processScanJob, failJob } = await import(new URL("src/services/scanV2/processScanJob.service.js", root));
const { updateScanJob, getScanJobById, releaseBonusReservation } = await import(new URL("src/stores/scanV2/scanJobs.db.js", root));
const { supabase } = await import(new URL("src/config/supabase.js", root));

// ปิด log ของแอประหว่างเรียก (นับ ref เพราะเทสต์ concurrent เรียกซ้อนกัน) · ผลสรุปเขียนตรง stdout
const ORIG = { log: console.log, error: console.error };
let muted = 0;
const quiet = () => { if (++muted === 1) { console.log = () => {}; console.error = () => {}; } return () => { if (--muted === 0) { console.log = ORIG.log; console.error = ORIG.error; } }; };
const out = (s) => process.stdout.write(s + "\n");
const bonusOf = (uid) => Number(q(`select bonus_scans from app_users where line_user_id='${uid}'`));
const jobsOf = (uid) => q(`select id||'|'||status||'|'||coalesce(free_access_kind,'-') from scan_jobs where line_user_id='${uid}' order by created_at`).split("\n").filter(Boolean);
const image = (seed) => Buffer.concat([Buffer.from("\xff\xd8\xff\xe0IT"), Buffer.from(seed.repeat(64))]);
let n = 0;
async function newUser({ bonus = 1, dailyExhausted = true } = {}) {
  const uid = `Uit${String(++n).padStart(4, "0")}${"a".repeat(25)}`;
  const id = q(`insert into app_users(line_user_id,bonus_scans,status) values('${uid}',${bonus},'active') returning id`);
  if (dailyExhausted) {
    // ฟรีรายวันหมด = มี scan_results ของวันนี้ ≥ โควตา (ใส่ 5 กันไว้ ไม่ว่าโควตาเป็น 1 หรือ 2)
    for (let i = 0; i < 5; i++) q(`insert into scan_results(scan_request_id,user_id,result_text) values(gen_random_uuid(),'${id}','it')`);
  }
  return { uid, id };
}
async function gate(uid) { const r = quiet(); try { return await checkScanAccess({ userId: uid }); } finally { r(); } }
async function ingest(uid, mid, buf, access) {
  const r = quiet();
  try { return await ingestScanImageAsyncV2({ userId: uid, lineMessageId: mid, imageBuffer: buf, birthdateSnapshot: "1990-01-01", accessDecision: access, flowVersion: 1 }); }
  finally { r(); }
}
const results = [];
async function t(name, fn) { try { await fn(); results.push(`PASS ${name}`); } catch (e) { results.push(`FAIL ${name}: ${e?.message || e}`); process.exitCode = 1; } }

await t("0 ดูสิทธิ์ (checkScanAccess ทั้ง consumeBonus true/false) ไม่แตะ bonus_scans", async () => {
  const u = await newUser();
  const a = await gate(u.uid);
  assert.equal(a.allowed, true); assert.equal(a.viaBonus, true); assert.equal(a.freeAccessKind, "bonus");
  const r = quiet(); try { await checkScanAccess({ userId: u.uid, consumeBonus: true }); } finally { r(); }
  assert.equal(bonusOf(u.uid), 1);
});

await t("1 โบนัส 1 → รับรูป (จองที่ INSERT) → งานสำเร็จ → เหลือ 0 และไม่คืน", async () => {
  const u = await newUser();
  const a = await gate(u.uid);
  const ing = await ingest(u.uid, "mid-1-" + u.uid, image("A"), a);
  assert.equal(ing.ok, true, JSON.stringify(ing)); assert.ok(ing.jobId);
  assert.equal(bonusOf(u.uid), 0, "จองตอน INSERT");
  assert.match(jobsOf(u.uid)[0], /\|queued\|bonus_reserved$/);
  await updateScanJob(ing.jobId, { status: "processing" });
  await updateScanJob(ing.jobId, { status: "completed" });
  await updateScanJob(ing.jobId, { status: "delivered" });
  assert.equal(bonusOf(u.uid), 0, "งานสำเร็จใช้โบนัสครั้งเดียว ไม่หักซ้ำ");
  assert.equal(await releaseBonusReservation(ing.jobId), "no_evidence", "งานสำเร็จห้ามคืน");
  assert.equal(bonusOf(u.uid), 0);
  // สิทธิ์หลังจากนั้น: ไม่มีทั้งฟรีและโบนัส
  const b = await gate(u.uid); assert.equal(b.allowed, false); assert.equal(b.reason, "payment_required");
  // A (Codex): ส่งรูปเดิมซ้ำตอนยอด 0 → ถูกกันที่ด่านสิทธิ์ ไม่มีงาน ไม่มีการคืน ยอดต้องไม่งอก
  const again = await ingest(u.uid, "mid-1-again-" + u.uid, image("A"), b);
  assert.equal(again.ok, false); assert.equal(again.error, "access_denied");
  assert.equal(jobsOf(u.uid).length, 1); assert.equal(bonusOf(u.uid), 0, "รูปซ้ำห้ามทำให้โบนัสงอกกลับ");
  assert.equal(await releaseBonusReservation(ing.jobId), "no_evidence"); assert.equal(bonusOf(u.uid), 0);
});

await t("2 inbound เดิมถูกส่งซ้ำ (line_message_id เดิม) → หักครั้งเดียว งานเดียว", async () => {
  const u = await newUser();
  const a = await gate(u.uid);
  const first = await ingest(u.uid, "mid-2-" + u.uid, image("B"), a);
  assert.equal(first.ok, true);
  const again = await ingest(u.uid, "mid-2-" + u.uid, image("B"), a);
  assert.equal(again.ok, true); assert.equal(again.duplicate, true);
  assert.equal(jobsOf(u.uid).length, 1); assert.equal(bonusOf(u.uid), 0);
  // snapshot สิทธิ์เก่า (ยังบอกว่ามีโบนัส) + รูปใหม่ → DB กันที่ INSERT ไม่มีงาน ไม่ติดลบ
  const stale = await ingest(u.uid, "mid-2b-" + u.uid, image("C"), a);
  assert.equal(stale.ok, false); assert.equal(stale.error, "quota_exhausted_at_insert"); assert.equal(stale.errorMessage, "bonus_quota_exhausted");
  assert.equal(jobsOf(u.uid).length, 1); assert.equal(bonusOf(u.uid), 0);
  assert.equal(q(`select count(*) from scan_uploads where line_message_id='mid-2b-${u.uid}'`), "0", "upload กำพร้าต้องถูกลบ");
  // ได้โบนัสใหม่ → LINE ส่ง message id เดิมซ้ำ (retry) ต้องสร้างงานได้ ไม่ถูกกลืนเป็น duplicate
  q(`update app_users set bonus_scans=1 where line_user_id='${u.uid}'`);
  const retry = await ingest(u.uid, "mid-2b-" + u.uid, image("C"), await gate(u.uid));
  assert.equal(retry.ok, true); assert.equal(Boolean(retry.duplicate), false); assert.equal(jobsOf(u.uid).length, 2); assert.equal(bonusOf(u.uid), 0);
  assert.equal(quotaGuardCodeFromError(new Error("x")), null);
});

await t("3a งานล้ม (failJob จริง → trigger) → คืนครั้งเดียว ล้มซ้ำ/เรียกคืนซ้ำไม่คืนอีก", async () => {
  const u = await newUser();
  const ing = await ingest(u.uid, "mid-3a-" + u.uid, image("D"), await gate(u.uid));
  assert.equal(bonusOf(u.uid), 0);
  const r = quiet();
  try {
    await updateScanJob(ing.jobId, { status: "processing" });
    await failJob(ing.jobId, "object_validation_failed", "it", u.uid, "it-worker");
    assert.equal(bonusOf(u.uid), 1, "คืนเมื่อ failed");
    assert.match(jobsOf(u.uid)[0], /\|failed\|bonus_released$/);
    await failJob(ing.jobId, "object_validation_failed", "it-again", u.uid, "it-worker");
  } finally { r(); }
  assert.equal(bonusOf(u.uid), 1, "failed ซ้ำไม่คืนซ้ำ");
  assert.equal(await releaseBonusReservation(ing.jobId), "noop");
  assert.equal(bonusOf(u.uid), 1);
  // retry failed → queued ของงานที่คืนแล้ว = จองใหม่
  await updateScanJob(ing.jobId, { status: "queued" });
  assert.equal(bonusOf(u.uid), 0); assert.match(jobsOf(u.uid)[0], /\|queued\|bonus_reserved$/);
});

await t("3b รูปซ้ำ (processScanJob จริง → sha256 dedup) → คืนครั้งเดียว", async () => {
  const u = await newUser();
  // งานเก่าที่สำเร็จแล้วของรูป E (ให้ dedup มีของให้ชน)
  const old = await ingest(u.uid, "mid-3b-old-" + u.uid, image("E"), await gate(u.uid));
  assert.equal(bonusOf(u.uid), 0);
  const resId = q(`insert into scan_results_v2(scan_job_id,line_user_id,app_user_id,report_url) values('${old.jobId}','${u.uid}','${u.id}','https://example.test/r/old') returning id`);
  await updateScanJob(old.jobId, { status: "completed", result_id: resId });
  // ได้โบนัสใหม่ (เช่นชวนเพื่อนอีกคน) แล้วส่งรูป E ซ้ำ
  q(`update app_users set bonus_scans=1 where line_user_id='${u.uid}'`);
  const dup = await ingest(u.uid, "mid-3b-dup-" + u.uid, image("E"), await gate(u.uid));
  assert.equal(dup.ok, true); assert.equal(bonusOf(u.uid), 0, "จองตอน INSERT");
  q(`update scan_jobs set status='processing', locked_at=now(), worker_id='it' where id='${dup.jobId}'`);
  const row = await getScanJobById(dup.jobId);
  const r = quiet(); try { await processScanJob("it-worker", row); } finally { r(); }
  const job = await getScanJobById(dup.jobId);
  assert.equal(job.status, "completed"); assert.equal(job.free_access_kind, "bonus_released", "คืนตามหลักฐานรูปซ้ำ (เฉพาะการจองใหม่ของงานนี้)");
  assert.equal(q(`select count(*) from outbound_messages where related_job_id='${dup.jobId}' and kind='scan_result' and payload_json->>'skipQuotaDecrement'='true'`), "1");
  assert.equal(bonusOf(u.uid), 1);
  assert.equal(await releaseBonusReservation(dup.jobId), "noop"); assert.equal(bonusOf(u.uid), 1, "คืนซ้ำไม่ได้");
});

await t("4 ส่ง 3 รูปพร้อมกัน โบนัส 1 → งานเดียว อีก 2 ถูกกันที่ DB ยอด 0 ไม่ติดลบ", async () => {
  const u = await newUser();
  const a = await gate(u.uid);
  const rs = await Promise.all(["F", "G", "H"].map((s, i) => ingest(u.uid, `mid-4-${i}-` + u.uid, image(s), a)));
  const ok = rs.filter((r) => r.ok), denied = rs.filter((r) => !r.ok);
  assert.equal(ok.length, 1, JSON.stringify(rs)); assert.equal(denied.length, 2);
  assert.ok(denied.every((r) => r.error === "quota_exhausted_at_insert"));
  assert.equal(jobsOf(u.uid).length, 1); assert.equal(bonusOf(u.uid), 0);
});

await t("5 crash/retry: INSERT abort ไม่หาย · หลักฐานค้าง (worker ตายก่อน release) → sweep คืน 1 ครั้ง · sweep ซ้ำ 0", async () => {
  const u = await newUser();
  // (ก) ทรานแซกชันจอง abort กลางทาง → ยอดเดิม
  q(`begin; insert into scan_jobs(line_user_id,app_user_id,upload_id,access_source,status,free_access_kind) values('${u.uid}','${u.id}',gen_random_uuid(),'free','queued','bonus'); rollback;`);
  assert.equal(bonusOf(u.uid), 1);
  // (ข) งานจองแล้ว + outbound รูปซ้ำถูกเขียน แต่ process ตายก่อนเรียก release
  const ing = await ingest(u.uid, "mid-5-" + u.uid, image("J"), await gate(u.uid));
  assert.equal(bonusOf(u.uid), 0);
  q(`update scan_jobs set status='completed' where id='${ing.jobId}'`);
  q(`insert into outbound_messages(line_user_id,kind,related_job_id,payload_json,status) values('${u.uid}','scan_result','${ing.jobId}','{"skipQuotaDecrement":true,"dedupHit":true}','queued')`);
  const s1 = await supabase.rpc("sweep_bonus_releases", { p_limit: 50 });
  assert.equal(s1.error, null); assert.equal(Number(s1.data), 1, "sweep คืน 1 งาน");
  assert.equal(bonusOf(u.uid), 1);
  const s2 = await supabase.rpc("sweep_bonus_releases", { p_limit: 50 });
  assert.equal(Number(s2.data), 0, "sweep ซ้ำไม่คืนซ้ำ"); assert.equal(bonusOf(u.uid), 1);
  // (ค) งานสำเร็จปกติต้องไม่ถูก sweep คืน
  const u2 = await newUser();
  const ok = await ingest(u2.uid, "mid-5c-" + u2.uid, image("K"), await gate(u2.uid));
  q(`update scan_jobs set status='delivered' where id='${ok.jobId}'`);
  q(`insert into outbound_messages(line_user_id,kind,related_job_id,payload_json,status) values('${u2.uid}','scan_result','${ok.jobId}','{"skipQuotaDecrement":false}','sent')`);
  const s3 = await supabase.rpc("sweep_bonus_releases", { p_limit: 50 });
  assert.equal(Number(s3.data), 0); assert.equal(bonusOf(u2.uid), 0);
});

await t("7 legacy: งาน kind='bonus' ของโค้ดเก่า (ไม่เคยจอง) → failed/รูปซ้ำ/release/sweep ไม่คืนเงินฟรี", async () => {
  const u = await newUser({ bonus: 1 });
  const jid = q(`insert into scan_jobs(line_user_id,app_user_id,upload_id,access_source,status,free_access_kind) values('${u.uid}','${u.id}',gen_random_uuid(),'free','queued','bonus') returning id`);
  assert.equal(bonusOf(u.uid), 1, "INSERT 'bonus' legacy ไม่หัก (โค้ดเก่าจัดการเองแล้ว)");
  q(`update scan_jobs set status='failed' where id='${jid}'`);
  assert.equal(bonusOf(u.uid), 1, "legacy ล้มทีหลัง ห้ามคืน");
  assert.equal(q(`select free_access_kind from scan_jobs where id='${jid}'`), "bonus");
  q(`insert into outbound_messages(line_user_id,kind,related_job_id,payload_json,status) values('${u.uid}','scan_result','${jid}','{"skipQuotaDecrement":true}','sent')`);
  assert.equal(await releaseBonusReservation(jid), "noop");
  const sw = await supabase.rpc("sweep_bonus_releases", { p_limit: 50 }); assert.equal(Number(sw.data), 0);
  assert.equal(bonusOf(u.uid), 1);
  q(`update scan_jobs set status='queued' where id='${jid}'`); // retry legacy → ไม่จอง ไม่หัก
  assert.equal(bonusOf(u.uid), 1);
});

await t("8 ช่วง rollout/rollback: โค้ดเก่า (หักที่ webhook แล้ว INSERT 'bonus') บน 064 → หักครั้งเดียว ไม่ซ้ำ", async () => {
  const u = await newUser({ bonus: 1 });
  // จำลองโค้ดเก่า 0af41f5: CAS หักที่ webhook ก่อน แล้วสร้างงาน kind='bonus'
  assert.equal(q(`update app_users set bonus_scans=0 where line_user_id='${u.uid}' and bonus_scans=1 returning bonus_scans`), "0");
  q(`insert into scan_jobs(line_user_id,app_user_id,upload_id,access_source,status,free_access_kind) values('${u.uid}','${u.id}',gen_random_uuid(),'free','queued','bonus')`);
  assert.equal(bonusOf(u.uid), 0, "trigger ต้องไม่หักซ้ำจนติดลบ/ปฏิเสธงาน");
  // โค้ดเก่า 27fdff4 (turnCache ไม่หัก) → INSERT 'bonus' ยอด 1 → ยัง 1 (บั๊กเดิมคงอยู่ แต่ไม่แย่ลง)
  const u2 = await newUser({ bonus: 1 });
  q(`insert into scan_jobs(line_user_id,app_user_id,upload_id,access_source,status,free_access_kind) values('${u2.uid}','${u2.id}',gen_random_uuid(),'free','queued','bonus')`);
  assert.equal(bonusOf(u2.uid), 1);
});

await t("9 โค้ดใหม่บน DB ที่มีแค่ 057 (ยังไม่ apply 064, trial OFF): INSERT 'bonus_reserved' ไม่พัง ไม่หัก (บั๊กเดิม ไม่แย่ลง)", async () => {
  q("CREATE DATABASE only057", "postgres");
  const q57 = (sql) => q(sql, "only057");
  q57(readFileSync(new URL("fixtures/scanv2-bonus-schema.sql", import.meta.url), "utf8"));
  q57(readFileSync(new URL("sql/057_new_customer_trial.sql", root), "utf8"));
  const id = q57(`insert into app_users(line_user_id,bonus_scans,status) values('Uold057',1,'active') returning id`);
  q57(`insert into scan_jobs(line_user_id,app_user_id,upload_id,access_source,status,free_access_kind) values('Uold057','${id}',gen_random_uuid(),'free','queued','bonus_reserved')`);
  assert.equal(q57(`select bonus_scans from app_users where id='${id}'`), "1");
  assert.equal(q57(`select free_access_kind from scan_jobs where app_user_id='${id}'`), "bonus_reserved");
  assert.equal(q57(`select new_customer_trial_used('${id}')`), "1", "057 เดิมนับ 'bonus_reserved' เป็น trial usage → ต้อง apply 064 ก่อนเปิด trial");
});

await t("6 trial ON: กติกาเดิมของ 057 ยังอยู่ (คนเก่าไม่ eligible · คนใหม่ 2 ครั้ง · โบนัสจองเหมือนกัน)", async () => {
  q(`select set_new_customer_trial_policy(true)`);
  try {
    const oldU = await newUser({ bonus: 0, dailyExhausted: false });
    q(`update app_users set created_at=now()-interval '30 days' where line_user_id='${oldU.uid}'`);
    assert.throws(() => q(`insert into scan_jobs(line_user_id,app_user_id,upload_id,access_source,status) values('${oldU.uid}','${oldU.id}',gen_random_uuid(),'free','queued')`), /trial_not_eligible/);
    const nu = await newUser({ bonus: 1, dailyExhausted: false });
    const ins = () => q(`insert into scan_jobs(line_user_id,app_user_id,upload_id,access_source,status) values('${nu.uid}','${nu.id}',gen_random_uuid(),'free','queued') returning free_access_kind`);
    assert.equal(ins(), "trial"); assert.equal(ins(), "trial");
    assert.throws(ins, /trial_quota_exhausted/);
    q(`insert into scan_jobs(line_user_id,app_user_id,upload_id,access_source,status,free_access_kind) values('${nu.uid}','${nu.id}',gen_random_uuid(),'free','queued','bonus_reserved')`);
    assert.equal(bonusOf(nu.uid), 0);
    assert.equal(Number(q(`select new_customer_trial_used('${nu.id}')`)), 2, "bonus/bonus_released ไม่นับเป็น trial");
  } finally { q(`select set_new_customer_trial_policy(false)`); }
});

out(results.join("\n"));
out(process.exitCode ? "RESULT: FAIL" : "RESULT: PASS (bonus reservation integration)");
