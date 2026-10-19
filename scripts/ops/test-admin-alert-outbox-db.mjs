// 068 admin_alert_outbox — DB-level test บน container แยก (ener-trial-policy-test, network none) · ไม่แตะ DB จริง
// ครอบ (รอบ 2 Codex): idempotent ×2 · web_anon ไม่มีสิทธิ์ตาราง/RPC ใด ๆ (insert/select/enqueue/claim/finish ถูกปฏิเสธ) · role admin_alert_writer เรียก RPC ได้แต่เขียนตารางตรงไม่ได้ ·
//   enqueue: dedupe_key ค้าง queued = duplicate ไม่เพิ่มแถว · claim เฉพาะที่ถึงเวลา + sending ค้าง >10 นาที หยิบใหม่ · finish: ok → sent (ซ้ำ = already ไม่เปลี่ยน) ·
//   fail → queued + backoff (เคารพ retry_after) + p_text แทนข้อความที่เหลือ · 12 ครั้ง / 24 ชม. → failed · claim พร้อมกัน 2 ตัว = คนละแถว
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
  const w = (s) => sql(`SET ROLE admin_alert_writer; ${s}; RESET ROLE;`);
  const enq = (k, role = w, text = "t") => JSON.parse(role(`SELECT admin_alert_outbox_enqueue('staging','dlq','high','${text}',${k ? `'${k}'` : "NULL"},'http_500',NULL)`));
  // ── web_anon: ปฏิเสธทุกทาง ──
  assert.throws(() => anon("SELECT count(*) FROM admin_alert_outbox"), /permission denied/, "anon อ่านตารางไม่ได้");
  assert.throws(() => anon("INSERT INTO admin_alert_outbox(env_label,category,severity,text) VALUES ('s','c','i','x')"), /permission denied/, "anon เขียนตารางไม่ได้");
  assert.throws(() => enq("k0", anon), /permission denied/, "anon enqueue ไม่ได้ (ยัดข้อความให้ worker ส่งหาแอดมินไม่ได้)");
  assert.throws(() => anon("SELECT count(*) FROM admin_alert_outbox_claim(10)"), /permission denied/, "anon claim ไม่ได้");
  assert.throws(() => anon("SELECT admin_alert_outbox_finish(1, true, NULL, NULL, NULL)"), /permission denied/, "anon finish ไม่ได้ (ทำเครื่องหมาย sent ปลอมไม่ได้)");
  // ── admin_alert_writer: RPC ได้ · ตารางตรงไม่ได้ ──
  assert.throws(() => w("INSERT INTO admin_alert_outbox(env_label,category,severity,text) VALUES ('s','c','i','x')"), /permission denied/, "writer เขียนตารางตรงไม่ได้ (ต้องผ่าน RPC)");
  assert.throws(() => w("UPDATE admin_alert_outbox SET status='sent'"), /permission denied/);
  const r1 = enq("k1"); assert.equal(r1.queued, true); assert.equal(r1.duplicate, false); const id1 = r1.id;
  const r1b = enq("k1"); assert.equal(r1b.duplicate, true); assert.equal(r1b.id, id1, "dedupe_key ค้าง queued = ไม่เพิ่มแถว");
  enq(null); enq(null); // ไม่มี key ซ้ำได้
  assert.equal(sql("SELECT count(*) FROM admin_alert_outbox"), "3");
  assert.equal(sql(`SELECT attempts||' '||status||' '||(next_attempt_at > now())::text FROM admin_alert_outbox WHERE id=${id1}`), "1 queued true", "enqueue หลังส่งตรงล้ม = attempts 1 + รอ 60 วิ");
  sql("UPDATE admin_alert_outbox SET next_attempt_at = now() - interval '1 second'");
  assert.equal(w("SELECT count(*) FROM admin_alert_outbox_claim(10)"), "3");
  assert.equal(sql("SELECT count(*) FROM admin_alert_outbox WHERE status='sending'"), "3");
  assert.equal(w("SELECT count(*) FROM admin_alert_outbox_claim(10)"), "0", "sending ใหม่ ๆ ไม่ถูกหยิบซ้ำ");
  sql(`UPDATE admin_alert_outbox SET updated_at = now() - interval '11 minutes' WHERE id=${id1}`);
  assert.equal(w("SELECT count(*) FROM admin_alert_outbox_claim(10)"), "1", "sending ค้าง >10 นาที (worker ตาย) หยิบใหม่");
  let r = JSON.parse(w(`SELECT admin_alert_outbox_finish(${id1}, false, 'http_429', 300, '(ต่อ) เหลือส่วนนี้')`));
  assert.equal(r.status, "queued"); assert.equal(r.attempts, 2);
  assert.equal(sql(`SELECT text FROM admin_alert_outbox WHERE id=${id1}`), "(ต่อ) เหลือส่วนนี้", "p_text แทนข้อความที่เหลือ (ส่งสำเร็จบางก้อน)");
  assert.ok(Number(sql(`SELECT round(extract(epoch from (next_attempt_at - now()))) FROM admin_alert_outbox WHERE id=${id1}`)) >= 295, "retry_after 300s ชนะ backoff");
  assert.equal(w("SELECT count(*) FROM admin_alert_outbox_claim(10)"), "0", "ยังไม่ถึง next_attempt");
  sql(`UPDATE admin_alert_outbox SET next_attempt_at = now() - interval '1 second' WHERE id=${id1}`);
  assert.equal(w("SELECT count(*) FROM admin_alert_outbox_claim(10)"), "1");
  w(`SELECT admin_alert_outbox_finish(${id1}, false, 'x', NULL, NULL)`);
  assert.equal(sql(`SELECT text FROM admin_alert_outbox WHERE id=${id1}`), "(ต่อ) เหลือส่วนนี้", "p_text NULL = ข้อความเดิมคงอยู่");
  sql(`UPDATE admin_alert_outbox SET status='sending' WHERE id=${id1}`);
  r = JSON.parse(w(`SELECT admin_alert_outbox_finish(${id1}, true, NULL, NULL, NULL)`)); assert.equal(r.status, "sent");
  assert.equal(sql(`SELECT status||' '||(sent_at IS NOT NULL)::text||' '||attempts FROM admin_alert_outbox WHERE id=${id1}`), "sent true 4");
  r = JSON.parse(w(`SELECT admin_alert_outbox_finish(${id1}, true, NULL, NULL, NULL)`)); assert.equal(r.already, true, "finish ซ้ำบน sent = idempotent");
  r = JSON.parse(w(`SELECT admin_alert_outbox_finish(${id1}, false, 'late', NULL, NULL)`)); assert.equal(r.status, "sent", "sent แล้วไม่ถอยกลับ queued");
  assert.equal(sql(`SELECT attempts FROM admin_alert_outbox WHERE id=${id1}`), "4");
  // หลัง sent แล้ว dedupe_key เดิมใส่ใหม่ได้ (partial unique เฉพาะ queued/sending)
  const r2 = enq("k1", w, "t2"); assert.equal(r2.duplicate, false);
  // backoff ทวีคูณ: attempts 1..7 → 2,4,8,16,32,60,60 นาที (enqueue เริ่มที่ attempts=1 เพราะส่งตรงล้มแล้ว 1 ครั้ง)
  const id3 = enq(null, w, "b").id;
  const mins = [];
  for (let i = 0; i < 7; i++) { sql(`UPDATE admin_alert_outbox SET status='sending' WHERE id=${id3}`); w(`SELECT admin_alert_outbox_finish(${id3}, false, 'x', NULL, NULL)`); mins.push(Number(sql(`SELECT round(extract(epoch from (next_attempt_at - now()))/60) FROM admin_alert_outbox WHERE id=${id3}`))); }
  assert.deepEqual(mins, [2, 4, 8, 16, 32, 60, 60]);
  // 12 ครั้ง → failed (คงแถว)
  sql(`UPDATE admin_alert_outbox SET attempts=11, status='sending' WHERE id=${id3}`);
  assert.equal(JSON.parse(w(`SELECT admin_alert_outbox_finish(${id3}, false, 'x', NULL, NULL)`)).status, "failed");
  // อายุ > 24 ชม. → failed
  const id4 = enq(null, w, "old").id;
  sql(`UPDATE admin_alert_outbox SET status='sending', created_at = now()-interval '25 hours' WHERE id=${id4}`);
  assert.equal(JSON.parse(w(`SELECT admin_alert_outbox_finish(${id4}, false, 'x', NULL, NULL)`)).status, "failed");
  assert.equal(sql("SELECT count(*) FROM admin_alert_outbox"), "6", "ไม่มีแถวถูกลบ (ตรวจสอบได้)");
  // claim พร้อมกัน: 2 connection หยิบคนละแถว ไม่ซ้ำ
  enq(null, w, "c1"); enq(null, w, "c2"); sql("UPDATE admin_alert_outbox SET next_attempt_at = now() - interval '1 second' WHERE status='queued'");
  const [a, b] = await Promise.all([concurrent("SET ROLE admin_alert_writer; BEGIN; SELECT id FROM admin_alert_outbox_claim(1); SELECT pg_sleep(0.3); COMMIT;"), concurrent("SET ROLE admin_alert_writer; SELECT id FROM admin_alert_outbox_claim(1);")]);
  assert.ok(!a.error && !b.error, a.stderr + b.stderr);
  assert.notEqual(a.stdout.trim(), b.stdout.trim(), "claim พร้อมกันต้องได้คนละแถว");
  // สิทธิ์: service_role อ่าน+EXECUTE ได้ · web_anon ไม่มีอะไรเลย · PUBLIC ไม่มี EXECUTE
  assert.equal(sql("SELECT has_table_privilege('service_role','admin_alert_outbox','SELECT')::text||has_function_privilege('service_role','admin_alert_outbox_enqueue(text,text,text,text,text,text,timestamptz)','EXECUTE')::text"), "truetrue");
  assert.equal(sql("SELECT (SELECT count(*) FROM pg_proc p WHERE proname LIKE 'admin_alert_outbox_%' AND has_function_privilege('web_anon', p.oid, 'EXECUTE'))||' '||has_table_privilege('web_anon','admin_alert_outbox','SELECT')::text||' '||has_table_privilege('web_anon','admin_alert_outbox','INSERT')::text"), "0 false false");
  assert.equal(sql("SELECT count(*) FROM pg_proc p WHERE proname LIKE 'admin_alert_outbox_%' AND has_function_privilege('admin_alert_writer', p.oid, 'EXECUTE')"), "3");
  console.log("PASS admin_alert_outbox 068 (รอบ 2): idempotent ×2 · web_anon denied (table+3 RPCs) · admin_alert_writer RPC-only · enqueue dedupe · claim due/stale-sending/concurrent · finish sent/already/backoff(2,4,8,16,32,60)/retry_after/p_text/failed(12 attempts, >24h) · rows retained");
} finally {
  sql(`DROP DATABASE ${db} WITH (FORCE);`, "postgres");
  console.log(`Removed synthetic database ${db}; no customer data used.`);
}
