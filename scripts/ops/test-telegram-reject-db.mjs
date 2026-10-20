// 069 รอบ 2 — DB test บน container แยก (ener-trial-policy-test, network none)
// apply 061→062→063→069 จริง แล้วทดสอบ: สิทธิ์ (anon/service_role ถูกปฏิเสธ, payment_ops_writer ได้) · token kinds · reject atomic ตัดสิน money ใน DB ·
// race กับ approve_payment_and_grant จริงทั้งสองลำดับ (approve ชนะ / reject ชนะ) ตรวจ grant/ยอด/วันหมดอายุ · notify pending/queued · settlement resolve + audit
import { execFileSync, execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const container = "ener-trial-policy-test";
const meta = JSON.parse(execFileSync("docker", ["inspect", container], { encoding: "utf8" }))[0];
assert.equal(meta.HostConfig.NetworkMode, "none", "must be an isolated test container");
const db = `tgrej_${process.pid}`;
const args = (name) => ["exec", "-i", container, "psql", "-U", "postgres", "-d", name, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"];
const sql = (s, name = db) => execFileSync("docker", args(name), { input: s, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const concurrent = (s) => new Promise((resolve) => { const ch = execFile("docker", args(db), (error, stdout, stderr) => resolve({ error, stdout, stderr })); ch.stdin.end(s); });
const read = (f) => readFileSync(new URL(`../../sql/${f}`, import.meta.url), "utf8");
const J = (s) => JSON.parse(s);
sql(`CREATE DATABASE ${db}`, "postgres");
try {
  sql(`DO $$ DECLARE r record; BEGIN FOR r IN SELECT unnest(ARRAY['web_anon','service_role','authenticator']) AS n LOOP IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r.n) THEN EXECUTE 'CREATE ROLE '||r.n||' NOLOGIN'; END IF; END LOOP; END $$; GRANT USAGE ON SCHEMA public TO web_anon, service_role;
    CREATE TABLE app_users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), line_user_id text UNIQUE, paid_until timestamptz, paid_remaining_scans integer DEFAULT 0, paid_plan_code text, updated_at timestamptz DEFAULT now());
    CREATE TABLE payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, line_user_id text, status text, package_code text, package_name text, expected_amount numeric, slip_amount numeric, unlock_hours integer, payment_ref text, rejected_at timestamptz, reject_reason text, approved_by text, verified_at timestamptz, updated_at timestamptz DEFAULT now());
    CREATE TABLE outbound_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), related_payment_id uuid, kind text, status text, line_user_id text, created_at timestamptz DEFAULT now());`);
  for (const f of ["061_telegram_slip_approval.sql", "062_atomic_payment_approval.sql", "063_payment_approval_snapshot.sql"]) sql(read(f));
  const M = read("069_telegram_reject_and_settlement.sql"); sql(M); sql(M);
  const as = (role) => (s) => sql(`SET ROLE ${role}; ${s}; RESET ROLE;`);
  const anon = as("web_anon"), svc = as("service_role"), ops = as("payment_ops_writer");
  const mkUser = (uid) => sql(`INSERT INTO app_users(line_user_id) VALUES ('${uid}') RETURNING id`);
  const mkPay = (userId, uid, ref, slip = 10) => sql(`INSERT INTO payments(user_id,line_user_id,status,package_code,expected_amount,slip_amount,payment_ref,unlock_hours) VALUES ('${userId}','${uid}','pending_verify','29baht_1scan_24h',29,${slip},'${ref}',24) RETURNING id`);
  // snapshot ที่ JS คำนวณจากแถวที่อ่าน "ก่อน" ล็อก (063 บังคับให้ตรงกับแถวจริง ณ commit) — ในเทสต์ race ใช้ค่าตอน pending_verify
  const snap = (pid, userId, uid) => `jsonb_build_object('package_code','29baht_1scan_24h','expected_amount',29::numeric,'unlock_hours',24,'user_id','${userId}'::uuid,'line_user_id','${uid}','status','pending_verify')`;
  const approveSql = (pid, userId, uid) => `SELECT approve_payment_and_grant('${pid}','telegram','telegram:7486','29baht_1scan_24h',29,'29baht_1scan_24h',1,now()+interval '24 hours',false,${snap(pid, userId, uid)})`;
  // ── สิทธิ์
  const u1 = mkUser("U1"); const p1 = mkPay(u1, "U1", "PAY-1");
  for (const role of [anon, svc]) {
    assert.throws(() => role(`SELECT reject_payment_atomic('${p1}','x','telegram','amount','t',false)`), /permission denied/, "reject: anon/service_role ถูกปฏิเสธ");
    assert.throws(() => role(`SELECT payment_settlement_resolve('${p1}','refunded','note ok','x')`), /permission denied/);
    assert.throws(() => role(`SELECT mark_reject_notify_queued('${p1}')`), /permission denied/);
    assert.throws(() => role(`SELECT count(*) FROM list_reject_notify_pending(5)`), /permission denied/);
  }
  assert.equal(sql("SELECT pg_has_role('authenticator','payment_ops_writer','MEMBER')"), "t");
  // ── token kinds
  assert.equal(anon(`SELECT issue_telegram_reject_token('tok-r1','${p1}',900,'pending_verify','amount')`), "t");
  assert.throws(() => anon(`SELECT issue_telegram_reject_token('tok-r2','${p1}',900,'pending_verify','BAD CODE')`), /reason_code_required/);
  assert.equal(anon(`SELECT issue_telegram_approval_token('tok-a1','${p1}',900,29,'29baht_1scan_24h','pending_verify')`), "t");
  let c = J(anon("SELECT consume_telegram_approval_token('tok-r1','7486')")); assert.equal(c.kind, "reject_confirm"); assert.equal(c.rejectReasonCode, "amount");
  assert.equal(J(anon("SELECT consume_telegram_approval_token('tok-r1','7486')")).ok, false, "ใช้ซ้ำไม่ได้");
  c = J(anon("SELECT consume_telegram_approval_token('tok-a1','7486')")); assert.equal(c.kind, "confirm"); assert.equal(c.rejectReasonCode, null);
  // ── reject: money ตัดสินใน DB (สลิปไม่ชัด แต่ slip_amount=10 → money_pending) · notify pending · audit
  let r = J(ops(`SELECT reject_payment_atomic('${p1}','admin_dashboard','web','blur','สลิปไม่ชัด',false)`));
  assert.equal(r.ok, true); assert.equal(r.settlementStatus, "money_pending", "DB ตัดสินจาก slip_amount ที่ล็อกอยู่ ไม่ใช่ flag ผู้เรียก"); assert.equal(r.notifyPending, true);
  assert.equal(sql(`SELECT status||' '||settlement_status||' '||reject_notify_pending||' '||approved_by FROM payments WHERE id='${p1}'`), "rejected money_pending true admin_dashboard");
  assert.equal(sql(`SELECT count(*) FROM payment_approval_audit WHERE payment_id='${p1}' AND action='rejected' AND channel='web'`), "1");
  r = J(ops(`SELECT reject_payment_atomic('${p1}','telegram:7486','telegram','amount','x',true)`)); assert.equal(r.already, true); assert.equal(r.notifyPending, true, "already ยังบอกว่างานแจ้งค้าง");
  assert.equal(sql(`SELECT count(*) FROM payment_approval_audit WHERE payment_id='${p1}' AND action='rejected'`), "1", "already ไม่บันทึก audit ซ้ำ");
  // สลิปอ่านยอดไม่ได้ + เหตุผลไม่บ่งเงิน → none
  const u0 = mkUser("U0"); const p0 = sql(`INSERT INTO payments(user_id,line_user_id,status,package_code,expected_amount,payment_ref) VALUES ('${u0}','U0','pending_verify','29baht_1scan_24h',29,'PAY-0') RETURNING id`);
  r = J(ops(`SELECT reject_payment_atomic('${p0}','a','web','blur','สลิปไม่ชัด',false)`)); assert.equal(r.settlementStatus, "none");
  // ── notify pending: list หลัง 1 นาที · mark queued ครั้งเดียว
  assert.equal(ops("SELECT count(*) FROM list_reject_notify_pending(10)"), "0", "ยังไม่ถึง 1 นาที");
  sql(`UPDATE payments SET rejected_at = now() - interval '2 minutes' WHERE id IN ('${p1}','${p0}')`);
  assert.equal(ops("SELECT count(*) FROM list_reject_notify_pending(10)"), "2");
  assert.equal(ops(`SELECT mark_reject_notify_queued('${p1}')`), "t"); assert.equal(ops(`SELECT mark_reject_notify_queued('${p1}')`), "f", "mark ซ้ำ = false");
  assert.equal(ops("SELECT count(*) FROM list_reject_notify_pending(10)"), "1");
  // ── race 1: approve ชนะ (approve ถือล็อกก่อน) → reject เห็น paid ไม่ทับ · grant 1 · สิทธิ์เติม · notify ไม่ pending
  const u3 = mkUser("U3"); const p3 = mkPay(u3, "U3", "PAY-3");
  const [a1, b1] = await Promise.all([
    concurrent(`BEGIN; SELECT id FROM payments WHERE id='${p3}' FOR UPDATE; SELECT pg_sleep(0.5); SET LOCAL ROLE web_anon; ${approveSql(p3, u3, "U3")}; RESET ROLE; COMMIT;`),
    new Promise((res) => setTimeout(() => res(concurrent(`SET ROLE payment_ops_writer; SELECT reject_payment_atomic('${p3}','telegram:7486','telegram','amount','x',true);`)), 150)),
  ]);
  assert.ok(!a1.error, a1.stderr); assert.match(a1.stdout, /"ok": true/, "approve จริงต้องสำเร็จ: " + a1.stdout.slice(-200)); const rb1 = J(b1.stdout.trim()); assert.equal(rb1.ok, false); assert.equal(rb1.reason, "already_paid");
  assert.equal(sql(`SELECT status||' grants='||(SELECT count(*) FROM payment_entitlement_grants WHERE payment_id='${p3}')||' notify_pending='||reject_notify_pending||' settlement='||settlement_status FROM payments WHERE id='${p3}'`), "paid grants=1 notify_pending=false settlement=none");
  assert.equal(sql(`SELECT paid_remaining_scans||' '||(paid_until > now() + interval '23 hours')||' '||paid_plan_code FROM app_users WHERE id='${u3}'`), "1 true 29baht_1scan_24h", "approve ชนะ: ยอด 1 ครั้ง หมดอายุ +24 ชม.");
  // ── race 2: reject ชนะ (reject ถือล็อกก่อน) → approve_payment_and_grant จริงเห็น rejected → not_pending · ไม่มี grant · สิทธิ์ไม่เปลี่ยน
  const u4 = mkUser("U4"); const p4 = mkPay(u4, "U4", "PAY-4");
  const [a2, b2] = await Promise.all([
    concurrent(`BEGIN; SELECT id FROM payments WHERE id='${p4}' FOR UPDATE; SELECT pg_sleep(0.5); SET LOCAL ROLE payment_ops_writer; SELECT reject_payment_atomic('${p4}','telegram:7486','telegram','amount','x',true); RESET ROLE; COMMIT;`),
    new Promise((res) => setTimeout(() => res(concurrent(`SET ROLE web_anon; ${approveSql(p4, u4, "U4")};`)), 150)),
  ]);
  assert.ok(!a2.error, a2.stderr); const rb2 = J(b2.stdout.trim()); assert.equal(rb2.ok, false); assert.equal(rb2.reason, "not_pending");
  assert.equal(sql(`SELECT status||' grants='||(SELECT count(*) FROM payment_entitlement_grants WHERE payment_id='${p4}')||' settlement='||settlement_status||' notify_pending='||reject_notify_pending FROM payments WHERE id='${p4}'`), "rejected grants=0 settlement=money_pending notify_pending=true");
  assert.equal(sql(`SELECT coalesce(paid_remaining_scans,0)||' '||coalesce(paid_until::text,'-') FROM app_users WHERE id='${u4}'`), "0 -", "reject ชนะ: สิทธิ์ไม่เปลี่ยน");
  // ── settlement resolve
  assert.throws(() => ops(`SELECT payment_settlement_resolve('${p1}','refunded','','admin')`), /settlement_note_required/);
  assert.throws(() => ops(`SELECT payment_settlement_resolve('${p1}','paid','note ok','admin')`), /invalid_settlement_status/);
  r = J(ops(`SELECT payment_settlement_resolve('${p1}','refunded','โอนคืน 10 บาท 20 ต.ค. slip#123','admin_dashboard')`)); assert.equal(r.ok, true);
  r = J(ops(`SELECT payment_settlement_resolve('${p1}','topped_up','x2 note','admin')`)); assert.equal(r.ok, false); assert.equal(r.reason, "not_money_pending");
  assert.equal(sql(`SELECT settlement_status||' '||settlement_by FROM payments WHERE id='${p1}'`), "refunded admin_dashboard");
  assert.equal(sql(`SELECT count(*) FROM payment_approval_audit WHERE payment_id='${p1}' AND action='settlement_resolved'`), "1");
  assert.equal(sql("SELECT count(*) FROM payments"), "4", "ไม่มีแถวถูกลบ");
  console.log("PASS 069 v2: roles (anon/service_role denied, payment_ops_writer ok) · token kinds · reject atomic money decided in DB · notify pending/list/mark · race vs real approve_payment_and_grant both orders (grants/scans/expiry) · settlement resolve + audit");
} finally {
  sql(`DROP DATABASE ${db} WITH (FORCE);`, "postgres");
  console.log(`Removed synthetic database ${db}; no customer data used.`);
}
