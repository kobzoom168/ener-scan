// 069 — DB test บน container แยก (ener-trial-policy-test, network none): reject atomic vs approve, idempotent, token kinds, settlement resolve
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
sql(`CREATE DATABASE ${db}`, "postgres");
try {
  sql(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='web_anon') THEN CREATE ROLE web_anon; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF; END $$; GRANT USAGE ON SCHEMA public TO web_anon, service_role;
    CREATE TABLE payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, line_user_id text, status text, package_code text, expected_amount numeric, slip_amount numeric, payment_ref text, rejected_at timestamptz, reject_reason text, approved_by text, verified_at timestamptz, updated_at timestamptz DEFAULT now());`);
  sql(read("061_telegram_slip_approval.sql")); // tokens/audit (ตารางที่ 061 สร้าง)
  const M = read("069_telegram_reject_and_settlement.sql"); sql(M); sql(M);
  const pid = sql("INSERT INTO payments(line_user_id,status,package_code,expected_amount,slip_amount,payment_ref) VALUES ('Utest',' pending_verify','49',49,10,'PAY-T1') RETURNING id");
  sql(`UPDATE payments SET status='pending_verify' WHERE id='${pid}'`);
  const anon = (s) => sql(`SET ROLE web_anon; ${s}; RESET ROLE;`);
  // token kinds
  assert.equal(anon(`SELECT issue_telegram_reject_token('tok-r1','${pid}',900,'pending_verify','amount')`), "t");
  assert.throws(() => anon(`SELECT issue_telegram_reject_token('tok-r2','${pid}',900,'pending_verify','BAD CODE')`), /reason_code_required/);
  assert.equal(anon(`SELECT issue_telegram_approval_token('tok-a1','${pid}',900,49,'49','pending_verify')`), "t");
  let c = JSON.parse(anon("SELECT consume_telegram_approval_token('tok-r1','7486')"));
  assert.equal(c.kind, "reject_confirm"); assert.equal(c.rejectReasonCode, "amount");
  c = JSON.parse(anon("SELECT consume_telegram_approval_token('tok-r1','7486')")); assert.equal(c.ok, false, "ใช้ซ้ำไม่ได้");
  c = JSON.parse(anon("SELECT consume_telegram_approval_token('tok-a1','7486')")); assert.equal(c.kind, "confirm"); assert.equal(c.rejectReasonCode, null);
  // reject atomic (money pending) — ไม่แตะสิทธิ์ (ไม่มีตาราง app_users ก็รันได้ = ไม่แตะ)
  let r = JSON.parse(anon(`SELECT reject_payment_atomic('${pid}','telegram:7486','amount','ยอดเงินไม่ตรง',true)`));
  assert.equal(r.ok, true); assert.equal(r.already, false); assert.equal(r.settlementStatus, "money_pending"); assert.equal(Number(r.slipAmount), 10);
  assert.equal(sql(`SELECT status||' '||settlement_status||' '||approved_by||' '||reject_reason FROM payments WHERE id='${pid}'`), "rejected money_pending telegram:7486 ยอดเงินไม่ตรง");
  r = JSON.parse(anon(`SELECT reject_payment_atomic('${pid}','telegram:7486','amount','x',true)`)); assert.equal(r.already, true, "กดซ้ำ = idempotent ไม่เปลี่ยนอะไร");
  assert.equal(sql(`SELECT count(*) FROM payments WHERE id='${pid}' AND reject_reason='ยอดเงินไม่ตรง'`), "1");
  // paid แล้ว → ปฏิเสธไม่ได้
  const pid2 = sql("INSERT INTO payments(line_user_id,status,expected_amount,payment_ref) VALUES ('U2','paid',49,'PAY-T2') RETURNING id");
  r = JSON.parse(anon(`SELECT reject_payment_atomic('${pid2}','telegram:7486','blur','สลิปไม่ชัด',false)`)); assert.equal(r.ok, false); assert.equal(r.reason, "already_paid");
  // race: reject vs "approve" (จำลอง approve = UPDATE ที่ล็อกแถวก่อน) → ฝ่ายที่มาทีหลังต้องเห็นสถานะใหม่
  const pid3 = sql("INSERT INTO payments(line_user_id,status,expected_amount,payment_ref) VALUES ('U3','pending_verify',49,'PAY-T3') RETURNING id");
  const [a, b] = await Promise.all([
    concurrent(`BEGIN; SELECT id FROM payments WHERE id='${pid3}' FOR UPDATE; SELECT pg_sleep(0.4); UPDATE payments SET status='paid', verified_at=now() WHERE id='${pid3}'; COMMIT;`),
    new Promise((res) => setTimeout(() => res(concurrent(`SELECT reject_payment_atomic('${pid3}','telegram:7486','blur','x',false)`)), 100)),
  ]);
  assert.ok(!a.error, a.stderr); const rb = JSON.parse(b.stdout.trim()); assert.equal(rb.ok, false); assert.equal(rb.reason, "already_paid", "ปฏิเสธรอล็อก แล้วเห็นว่า paid → ไม่ทับ");
  assert.equal(sql(`SELECT status FROM payments WHERE id='${pid3}'`), "paid");
  // settlement resolve: ต้องมีหมายเหตุ · เฉพาะจาก money_pending
  assert.throws(() => anon(`SELECT payment_settlement_resolve('${pid}','refunded','','admin')`), /settlement_note_required/);
  assert.throws(() => anon(`SELECT payment_settlement_resolve('${pid}','paid','note ok','admin')`), /invalid_settlement_status/);
  r = JSON.parse(anon(`SELECT payment_settlement_resolve('${pid}','refunded','โอนคืน 10 บาท 20 ต.ค. slip#123','admin')`)); assert.equal(r.ok, true);
  r = JSON.parse(anon(`SELECT payment_settlement_resolve('${pid}','topped_up','x2 note','admin')`)); assert.equal(r.ok, false); assert.equal(r.reason, "not_money_pending");
  assert.equal(sql(`SELECT settlement_status||' '||settlement_by FROM payments WHERE id='${pid}'`), "refunded admin");
  assert.equal(sql("SELECT count(*) FROM payments"), "3", "ไม่มีแถวถูกลบ");
  console.log("PASS 069: idempotent ×2 · reject token kind/reason · consume returns kind · reject atomic (money_pending, idempotent, paid untouched, race-safe) · settlement resolve rules");
} finally {
  sql(`DROP DATABASE ${db} WITH (FORCE);`, "postgres");
  console.log(`Removed synthetic database ${db}; no customer data used.`);
}
