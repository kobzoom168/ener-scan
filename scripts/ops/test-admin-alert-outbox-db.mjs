// 068 admin_alert_outbox — DB-level test บน container แยก (ener-trial-policy-test, network none) · ไม่แตะ DB จริง
// ครอบ: idempotent ×2 · web_anon insert/claim/finish ได้ · dedupe_key กันแถวซ้ำขณะ queued · claim เฉพาะที่ถึงเวลา + sending ค้าง >10 นาที หยิบใหม่ ·
//        finish: ok → sent · fail → queued + backoff (เคารพ retry_after) · 12 ครั้ง / 24 ชม. → failed · claim พร้อมกัน 2 ตัว = คนละแถว
import { execFileSync, execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const container = "ener-trial-policy-test";
const meta = JSON.parse(execFileSync("docker", ["inspect", container], { encoding: "utf8" }))[0];
assert.equal(meta.HostConfig.NetworkMode, "none", "must be an isolated test container");
const db = `aao_test_${process.pid}`;
const args = (name) => ["exec", "-i", container, "psql", "-U", "postgres", "-d", name, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"];
const sql = (s, name = db) => execFileSync("docker", args(name), { input: s, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const concurrent = (s) => new Promise((resolve) => { const ch = execFile("docker", args(db), (error, stdout, stderr) => resolve({ error, stdout, stderr })); ch.stdin.end(s); });
const M = readFileSync(new URL("../../sql/068_admin_alert_outbox.sql", import.meta.url), "utf8");
sql(`CREATE DATABASE ${db}`, "postgres");
try {
  sql(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='web_anon') THEN CREATE ROLE web_anon; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF; END $$; GRANT USAGE ON SCHEMA public TO web_anon, service_role;`);
  sql(M); sql(M);
  const anon = (s) => sql(`SET ROLE web_anon; ${s}; RESET ROLE;`);
  const ins = (k, extra = "") => anon(`INSERT INTO admin_alert_outbox(env_label,category,severity,text,dedupe_key${extra ? "," + extra.split("=")[0] : ""}) VALUES ('staging','dlq','high','t',${k ? `'${k}'` : "NULL"}${extra ? "," + extra.split("=")[1] : ""}) RETURNING id`);
  const id1 = ins("k1");
  assert.throws(() => ins("k1"), /duplicate key/, "dedupe_key ซ้ำขณะ queued ถูกกัน");
  ins(null); ins(null); // ไม่มี key ซ้ำได้
  assert.equal(anon("SELECT count(*) FROM admin_alert_outbox_claim(10)"), "3");
  assert.equal(sql("SELECT count(*) FROM admin_alert_outbox WHERE status='sending'"), "3");
  assert.equal(anon("SELECT count(*) FROM admin_alert_outbox_claim(10)"), "0", "sending ใหม่ ๆ ไม่ถูกหยิบซ้ำ");
  sql(`UPDATE admin_alert_outbox SET updated_at = now() - interval '11 minutes' WHERE id=${id1}`);
  assert.equal(anon("SELECT count(*) FROM admin_alert_outbox_claim(10)"), "1", "sending ค้าง >10 นาที (worker ตาย) หยิบใหม่");
  let r = JSON.parse(anon(`SELECT admin_alert_outbox_finish(${id1}, false, 'http_429', 300)`));
  assert.equal(r.status, "queued"); assert.equal(r.attempts, 1);
  assert.ok(Number(sql(`SELECT round(extract(epoch from (next_attempt_at - now()))) FROM admin_alert_outbox WHERE id=${id1}`)) >= 295, "retry_after 300s ชนะ backoff 1 นาที");
  assert.equal(anon("SELECT count(*) FROM admin_alert_outbox_claim(10)"), "0", "ยังไม่ถึง next_attempt");
  sql(`UPDATE admin_alert_outbox SET next_attempt_at = now() - interval '1 second' WHERE id=${id1}`);
  assert.equal(anon("SELECT count(*) FROM admin_alert_outbox_claim(10)"), "1");
  r = JSON.parse(anon(`SELECT admin_alert_outbox_finish(${id1}, true, NULL, NULL)`)); assert.equal(r.status, "sent");
  assert.equal(sql(`SELECT status||' '||(sent_at IS NOT NULL)::text||' '||attempts FROM admin_alert_outbox WHERE id=${id1}`), "sent true 2");
  // หลัง sent แล้ว dedupe_key เดิมใส่ใหม่ได้ (partial unique เฉพาะ queued/sending)
  const id2 = anon(`INSERT INTO admin_alert_outbox(env_label,category,severity,text,dedupe_key) VALUES ('staging','dlq','high','t2','k1') RETURNING id`);
  assert.ok(Number(id2) > 0);
  // backoff ทวีคูณ: attempts 0..6 → 1,2,4,8,16,32,60 นาที
  const id3 = anon(`INSERT INTO admin_alert_outbox(env_label,category,severity,text) VALUES ('staging','ops','info','b') RETURNING id`);
  const mins = [];
  for (let i = 0; i < 7; i++) { sql(`UPDATE admin_alert_outbox SET status='sending' WHERE id=${id3}`); anon(`SELECT admin_alert_outbox_finish(${id3}, false, 'x', NULL)`); mins.push(Number(sql(`SELECT round(extract(epoch from (next_attempt_at - now()))/60) FROM admin_alert_outbox WHERE id=${id3}`))); }
  assert.deepEqual(mins, [1, 2, 4, 8, 16, 32, 60]);
  // 12 ครั้ง → failed (คงแถว)
  sql(`UPDATE admin_alert_outbox SET attempts=11, status='sending' WHERE id=${id3}`);
  assert.equal(JSON.parse(anon(`SELECT admin_alert_outbox_finish(${id3}, false, 'x', NULL)`)).status, "failed");
  // อายุ > 24 ชม. → failed
  const id4 = anon(`INSERT INTO admin_alert_outbox(env_label,category,severity,text,created_at) VALUES ('staging','ops','info','old', now()-interval '25 hours') RETURNING id`);
  sql(`UPDATE admin_alert_outbox SET status='sending' WHERE id=${id4}`);
  assert.equal(JSON.parse(anon(`SELECT admin_alert_outbox_finish(${id4}, false, 'x', NULL)`)).status, "failed");
  assert.equal(sql("SELECT count(*) FROM admin_alert_outbox"), "6", "ไม่มีแถวถูกลบ (ตรวจสอบได้)");
  // claim พร้อมกัน: 2 connection หยิบคนละแถว ไม่ซ้ำ
  anon(`INSERT INTO admin_alert_outbox(env_label,category,severity,text) VALUES ('staging','ops','info','c1'),('staging','ops','info','c2')`);
  const [a, b] = await Promise.all([concurrent("SET ROLE web_anon; BEGIN; SELECT id FROM admin_alert_outbox_claim(1); SELECT pg_sleep(0.3); COMMIT;"), concurrent("SET ROLE web_anon; SELECT id FROM admin_alert_outbox_claim(1);")]);
  assert.ok(!a.error && !b.error, a.stderr + b.stderr);
  assert.notEqual(a.stdout.trim(), b.stdout.trim(), "claim พร้อมกันต้องได้คนละแถว");
  // service_role/anon อ่านได้ · PUBLIC ไม่มี EXECUTE
  assert.equal(sql("SELECT has_function_privilege('web_anon','admin_alert_outbox_claim(integer)','EXECUTE')::text||has_function_privilege('service_role','admin_alert_outbox_finish(bigint,boolean,text,integer)','EXECUTE')::text"), "truetrue");
  console.log("PASS admin_alert_outbox 068: idempotent ×2 · dedupe queued · claim due/stale-sending/concurrent · finish sent/backoff(1,2,4,8,16,32,60)/retry_after/failed(12 attempts, >24h) · rows retained");
} finally {
  sql(`DROP DATABASE ${db} WITH (FORCE);`, "postgres");
  console.log(`Removed synthetic database ${db}; no customer data used.`);
}
