// Runs only against the disposable, network-isolated LOCAL test container.
// Never uses .env or an application database. Launch postgres:16-alpine as
// ener-trial-policy-test before running; remove that container after testing.
import { execFileSync, execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const container = "ener-trial-policy-test";
const meta = JSON.parse(execFileSync("docker", ["inspect", container], { encoding: "utf8" }))[0];
assert.equal(meta.HostConfig.NetworkMode, "none", "must be an isolated test container");
const db = `trial_test_${process.pid}`;
const args = name => ["exec", "-i", container, "psql", "-U", "postgres", "-d", name, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"];
const sql = (s, name = db) => execFileSync("docker", args(name), { input: s, encoding: "utf8", stdio: ["pipe","pipe","pipe"] }).trim();
const concurrent = s => new Promise(resolve => {
  const child = execFile("docker", args(db), (error, stdout, stderr) => resolve({ error, stdout, stderr }));
  child.stdin.end(s);
});
const uid = n => `00000000-0000-0000-0000-${String(n).padStart(12,"0")}`;
let jid = 1000;
const insert = (user, kind = "free", extra = "NULL") => `INSERT INTO scan_jobs(id,app_user_id,line_user_id,access_source,status,free_access_kind) VALUES ('${uid(++jid)}','${uid(user)}','user${user}','${kind}','queued',${extra});`;
sql(`CREATE DATABASE ${db}`, "postgres");
try {
  sql(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='web_anon') THEN CREATE ROLE web_anon; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF; END $$;
    CREATE TABLE app_settings(key text PRIMARY KEY,value jsonb,updated_at timestamptz DEFAULT now());
    CREATE TABLE app_users(id uuid PRIMARY KEY,line_user_id text UNIQUE,created_at timestamptz DEFAULT now(),bonus_scans integer DEFAULT 0);
    CREATE TABLE scan_jobs(id uuid PRIMARY KEY,app_user_id uuid REFERENCES app_users(id),line_user_id text,
      access_source text,status text,result_id uuid,created_at timestamptz DEFAULT now());
    CREATE TABLE outbound_messages(id bigserial PRIMARY KEY,related_job_id uuid,kind text,status text,payload_json jsonb);
    INSERT INTO app_users(id,line_user_id,created_at,bonus_scans) VALUES ('${uid(1)}','user1',now()-interval '1 day',1);`);
  const migration = readFileSync(new URL("../../sql/057_new_customer_trial.sql", import.meta.url),"utf8");
  sql(migration); sql(migration);
  // 064 (โบนัสจอง/คืนที่ scan_jobs) ต้องไม่เปลี่ยนกติกา trial ของ 057 — apply ทับแล้วรันชุดเดิม
  const m064 = readFileSync(new URL("../../sql/064_bonus_reservation.sql", import.meta.url),"utf8");
  sql(m064); sql(m064);
  assert.equal(JSON.parse(sql("SELECT new_customer_trial_status(NULL)" )).enabled,false);
  sql(insert(1)); sql(insert(1)); sql(insert(1)); // OFF retains daily admission behavior
  sql("SET ROLE web_anon; SELECT set_new_customer_trial_policy(true); RESET ROLE;");
  const first = JSON.parse(sql("SELECT new_customer_trial_status(NULL)")).eligible_since;
  assert.throws(() => sql(insert(1)), /trial_not_eligible/);
  for (let n=2;n<=5;n++) sql(`INSERT INTO app_users(id,line_user_id,created_at) VALUES ('${uid(n)}','user${n}',now());`);
  sql(insert(2)); sql(insert(2));
  assert.throws(() => sql(insert(2)), /trial_quota_exhausted/);
  sql(insert(2,"paid")); sql(insert(1,"free","'bonus'"));
  assert.throws(() => sql(insert(1,"free","'bonus'")), /bonus_quota_exhausted/);
  assert.equal(JSON.parse(sql("SELECT new_customer_trial_status('user2')")).used,2);
  sql("SELECT set_new_customer_trial_policy(false); SELECT set_new_customer_trial_policy(true);");
  assert.equal(JSON.parse(sql("SELECT new_customer_trial_status(NULL)")).eligible_since,first);
  assert.throws(() => sql(insert(2)), /trial_quota_exhausted/);
  sql(`UPDATE scan_jobs SET status='failed' WHERE id=(SELECT id FROM scan_jobs WHERE app_user_id='${uid(2)}' AND access_source='free' LIMIT 1);`);
  sql(insert(2)); // failure releases slot
  assert.throws(() => sql(`UPDATE scan_jobs SET status='queued' WHERE app_user_id='${uid(2)}' AND status='failed';`), /trial_quota_exhausted/);
  sql(`UPDATE scan_jobs SET status='delivered' WHERE app_user_id='${uid(2)}' AND access_source='free' AND status='queued';`);
  assert.throws(() => sql(insert(2)), /trial_quota_exhausted/); // delivery does not release
  sql(insert(3)); const cachedId = uid(jid);
  sql(`INSERT INTO outbound_messages(related_job_id,kind,status,payload_json) VALUES ('${cachedId}','scan_result','sent','{"skipQuotaDecrement":true}');`);
  assert.equal(JSON.parse(sql("SELECT new_customer_trial_status('user3')")).used,0);
  sql(insert(3)); sql(insert(3)); assert.throws(() => sql(insert(3)), /trial_quota_exhausted/);
  // Two concurrent connections compete for the final slot; the first retains
  // its transaction lock so the second really waits before checking usage.
  sql(insert(4));
  const a = concurrent(`BEGIN; ${insert(4)} SELECT pg_sleep(0.4); COMMIT;`);
  const b = concurrent(`BEGIN; ${insert(4)} COMMIT;`);
  const raced = await Promise.all([a,b]);
  assert.equal(raced.filter(r => !r.error).length,1, JSON.stringify(raced));
  assert.equal(raced.filter(r => /trial_quota_exhausted/.test(r.stderr)).length,1);
  assert.equal(JSON.parse(sql("SELECT new_customer_trial_status('user4')")).used,2);
  assert.equal(JSON.parse(sql("SELECT new_customer_trial_status('user4')")).pending,2);
  // Re-apply must preserve ON + first activation + consumed quota.
  sql(migration);
  assert.equal(JSON.parse(sql("SELECT new_customer_trial_status(NULL)")).eligible_since, first);
  assert.throws(() => sql(insert(4)), /trial_quota_exhausted/);
  console.log("PASS: idempotent migration, OFF/ON, cohort, paid/bonus, failure/retry, delivered, cache skip, toggle persistence, concurrent last slot");
} finally {
  sql(`DROP DATABASE ${db} WITH (FORCE);`,"postgres");
  console.log(`Removed synthetic database ${db}; no customer data used.`);
}
