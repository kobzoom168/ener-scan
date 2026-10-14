// 067 free-policy modes + schedule — DB-level test. Runs only against the disposable,
// network-isolated LOCAL container ener-trial-policy-test (postgres:16-alpine / pgvector).
// Never uses .env or an application database. Covers Codex refinements 1–5 (14 ต.ค. 2026):
//  1 migration keeps the current mode (trial ON → daily_enabled=false; OFF → true) + legacy switch obeys new rules
//  2 72h enforced in DB for immediate and scheduled withdrawal of daily free; p_cancel_pending is no shortcut; audit
//  3 effective mode follows DB time (due pending wins before worker applies) at every gate incl. job INSERT (none)
//  4 cutoff on first scheduled trial enable = effective_at, existing cutoff preserved; accounts before/at/after
//  5 mutating RPCs only for free_policy_admin (web_anon/service_role denied); apply vs cancel/manual conflicts
//  Codex รอบ 2: (a) direct app_settings writes on the policy keys blocked for web_anon/service_role (041 grants) · other keys untouched
//               (b) two transactions cannot bypass 72h (lock before read) · (c) cancel after effective_at (before worker) refused, mode/cutoff kept
//  Codex รอบ 3: (a3) caller sets the GUC itself (SET / SET LOCAL, as web_anon/service_role/free_policy_admin) → still blocked (owner check)
//               (d) request starts before effective_at but waits on the lock past it → decided with post-lock time: cancel refused, schedule_set/manual do not revert mode or cutoff
import { execFileSync, execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const container = "ener-trial-policy-test";
const meta = JSON.parse(execFileSync("docker", ["inspect", container], { encoding: "utf8" }))[0];
assert.equal(meta.HostConfig.NetworkMode, "none", "must be an isolated test container");
const db = `fp_test_${process.pid}`;
const args = name => ["exec", "-i", container, "psql", "-U", "postgres", "-d", name, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"];
const sql = (s, name = db) => execFileSync("docker", args(name), { input: s, encoding: "utf8", stdio: ["pipe","pipe","pipe"] }).trim();
const j = s => JSON.parse(sql(s));
const concurrent = s => new Promise(resolve => {
  const child = execFile("docker", args(db), (error, stdout, stderr) => resolve({ error, stdout, stderr }));
  child.stdin.end(s);
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const uid = n => `00000000-0000-0000-0000-${String(n).padStart(12,"0")}`;
let jid = 1000;
const insert = (user, kind = "free", extra = "NULL") => `INSERT INTO scan_jobs(id,app_user_id,line_user_id,access_source,status,free_access_kind) VALUES ('${uid(++jid)}','${uid(user)}','user${user}','${kind}','queued',${extra});`;
const mig = f => readFileSync(new URL(`../../sql/${f}`, import.meta.url), "utf8");
const M = ["057_new_customer_trial.sql","064_bonus_reservation.sql","065_trial_dedup_evidence.sql"].map(mig);
const M067 = mig("067_free_policy_modes_schedule.sql");
const fixture = `DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='web_anon') THEN CREATE ROLE web_anon; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF; END $$;
    CREATE TABLE app_settings(key text PRIMARY KEY,value jsonb,updated_at timestamptz DEFAULT now());
    GRANT USAGE ON SCHEMA public TO web_anon, service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON app_settings TO service_role; GRANT SELECT, INSERT, UPDATE, DELETE ON app_settings TO web_anon; -- สิทธิ์จริงจาก sql/041
    INSERT INTO app_settings(key,value) VALUES ('scan_offer','{"freeQuotaPerDay":1}');
    CREATE TABLE app_users(id uuid PRIMARY KEY,line_user_id text UNIQUE,created_at timestamptz DEFAULT now(),bonus_scans integer DEFAULT 0);
    CREATE TABLE scan_jobs(id uuid PRIMARY KEY,app_user_id uuid REFERENCES app_users(id),line_user_id text,
      access_source text,status text,result_id uuid,created_at timestamptz DEFAULT now());
    CREATE TABLE outbound_messages(id bigserial PRIMARY KEY,related_job_id uuid,kind text,status text,payload_json jsonb);
    INSERT INTO app_users(id,line_user_id,created_at,bonus_scans) VALUES ('${uid(1)}','user1',now()-interval '1 day',2);`;
const mode = () => j("SELECT free_policy_mode_now()");
const trial = u => j(`SELECT new_customer_trial_status(${u ? `'${u}'` : "NULL"})`);
const settings = () => ({ trial: j("SELECT value FROM app_settings WHERE key='new_customer_trial'"), fp: j("SELECT value FROM app_settings WHERE key='free_policy'") });
const exclusive = () => { const s = settings(); assert.ok(!(s.trial.enabled && s.fp.daily_enabled), "both switches on: " + JSON.stringify(s)); };
const denied = (stmt, role) => assert.throws(() => sql(`SET ROLE ${role}; ${stmt}; RESET ROLE;`), /permission denied/, `${role} must not run: ${stmt}`);
const asAdmin = stmt => sql(`SET ROLE free_policy_admin; ${stmt}; RESET ROLE;`);
const jAdmin = stmt => JSON.parse(asAdmin(stmt));
const pass = [];

// ── 1a: migration on a DB where trial is already ON (staging-like) must keep new_customer + cutoff ──
const db2 = `${db}_on`;
sql(`CREATE DATABASE ${db2}`, "postgres");
try {
  sql(fixture, db2); for (const m of M) sql(m, db2);
  sql("SELECT set_new_customer_trial_policy(true)", db2);
  const esBefore = JSON.parse(sql("SELECT value FROM app_settings WHERE key='new_customer_trial'", db2)).eligible_since;
  sql(M067, db2); sql(M067, db2);
  const fp = JSON.parse(sql("SELECT value FROM app_settings WHERE key='free_policy'", db2));
  assert.equal(fp.daily_enabled, false, "trial ON → daily_enabled must default to false");
  const m2 = JSON.parse(sql("SELECT free_policy_mode_now()", db2));
  assert.equal(m2.mode, "new_customer"); assert.equal(m2.eligible_since, esBefore, "cutoff preserved by migration");
  assert.equal(JSON.parse(sql("SELECT new_customer_trial_status(NULL)", db2)).enabled, true);
  pass.push("1a migration keeps trial ON + cutoff");
} finally { sql(`DROP DATABASE ${db2} WITH (FORCE);`, "postgres"); }

sql(`CREATE DATABASE ${db}`, "postgres");
try {
  sql(fixture); for (const m of M) sql(m);
  sql(M067); sql(M067);
  // ── 1b: trial OFF → daily (unchanged behaviour), idempotent re-apply, legacy daily admission still passes ──
  assert.equal(mode().mode, "daily"); assert.equal(settings().fp.daily_enabled, true);
  sql(insert(1)); sql(insert(1)); exclusive();
  assert.equal(trial().enabled, false); assert.equal(trial().mode, "daily"); assert.equal(trial().daily_enabled, true);
  pass.push("1b migration keeps daily when trial OFF (idempotent ×2)");

  // ── 5: privileges ──
  for (const role of ["web_anon", "service_role"]) {
    denied("SELECT set_free_policy_mode('none','x',now()-interval '73 hours',false)", role);
    denied("SELECT free_policy_schedule_set('none',now()+interval '80 hours',now(),'x')", role);
    denied("SELECT free_policy_schedule_cancel(1,'x')", role);
    denied("SELECT free_policy_schedule_apply_due()", role);
    denied("SELECT set_new_customer_trial_policy(true)", role);
    denied("SELECT free_policy_apply_internal('none','x',now(),NULL,NULL)", role);
    denied("SELECT * FROM free_policy_schedule", role); denied("SELECT * FROM free_policy_audit", role);
    sql(`SET ROLE ${role}; SELECT new_customer_trial_status(NULL); SELECT free_policy_mode_now(); SELECT free_policy_status(NULL); RESET ROLE;`);
  }
  denied("SELECT free_policy_apply_internal('none','x',now(),NULL,NULL)", "free_policy_admin");
  assert.equal(mode().mode, "daily", "denied calls changed nothing");
  pass.push("5 web_anon/service_role denied on all mutating RPCs; reads allowed; internal RPC denied to admin role");

  // ── (a) direct table writes on policy keys are blocked (041 grants real) · other keys still writable ──
  for (const role of ["web_anon", "service_role"]) {
    for (const stmt of [
      "UPDATE app_settings SET value = jsonb_set(value,'{daily_enabled}','false') WHERE key='free_policy'",
      "UPDATE app_settings SET value = jsonb_set(value,'{enabled}','true') WHERE key='new_customer_trial'",
      "DELETE FROM app_settings WHERE key='free_policy'",
      "INSERT INTO app_settings(key,value) VALUES ('free_policy','{\"daily_enabled\":false}') ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value",
      "UPDATE app_settings SET key='free_policy_x' WHERE key='free_policy'",
      "UPDATE app_settings SET key='new_customer_trial' WHERE key='scan_offer'",
    ]) assert.throws(() => sql(`SET ROLE ${role}; ${stmt}; RESET ROLE;`), /free_policy_protected/, `${role}: ${stmt}`);
    sql(`SET ROLE ${role}; UPDATE app_settings SET value = jsonb_set(value,'{freeQuotaPerDay}','2') WHERE key='scan_offer'; RESET ROLE;`);
  }
  assert.equal(sql("SELECT value->>'freeQuotaPerDay' FROM app_settings WHERE key='scan_offer'"), "2", "other settings still writable");
  assert.throws(() => sql("UPDATE app_settings SET value = jsonb_set(value,'{daily_enabled}','false') WHERE key='free_policy'"), /free_policy_protected/, "even superuser without the RPC flag");
  assert.equal(mode().mode, "daily"); exclusive(); assert.equal(sql("SELECT count(*) FROM app_settings WHERE key IN ('free_policy','new_customer_trial')"), "2");
  assert.equal(sql("SELECT count(*) FROM free_policy_audit"), "0", "no audit rows from blocked writes");
  assert.throws(() => sql("SET ROLE web_anon; INSERT INTO app_settings(key,value) VALUES ('free_policy','{\"daily_enabled\":false}'); RESET ROLE;"), /duplicate key/, "plain INSERT cannot replace an existing policy row");
  sql("SET ROLE web_anon; INSERT INTO app_settings(key,value) VALUES ('free_policy','{\"daily_enabled\":false}') ON CONFLICT (key) DO NOTHING; RESET ROLE;"); // no-op path allowed, value must stay
  assert.equal(JSON.parse(sql("SELECT value FROM app_settings WHERE key='free_policy'")).daily_enabled, true, "value unchanged by any insert path");
  for (const m of M) sql(m); sql(M067); // re-apply 057/064/065 then 067 after the guard exists (seed-if-absent inserts allowed)
  assert.equal(mode().mode, "daily"); exclusive();
  // (a3) GUC is not a credential: setting it as the caller must not unlock the guard
  for (const role of ["web_anon", "service_role", "free_policy_admin"]) {
    for (const pre of ["SET ener.free_policy_rpc = 'on';", "BEGIN; SET LOCAL ener.free_policy_rpc = 'on';", "SELECT set_config('ener.free_policy_rpc','on',false);"]) {
      for (const stmt of [
        "UPDATE app_settings SET value = jsonb_set(value,'{daily_enabled}','false') WHERE key='free_policy'",
        "UPDATE app_settings SET value = jsonb_set(value,'{enabled}','true') WHERE key='new_customer_trial'",
        "DELETE FROM app_settings WHERE key='new_customer_trial'",
        "UPDATE app_settings SET key='free_policy_old' WHERE key='free_policy'",
      ]) assert.throws(() => sql(`SET ROLE ${role}; ${pre} ${stmt}; ${pre.startsWith("BEGIN") ? "COMMIT;" : ""} RESET ROLE;`),
        role === "free_policy_admin" ? /free_policy_protected|permission denied for table app_settings/ : /free_policy_protected/, // admin role มีแค่ EXECUTE RPC ไม่มีสิทธิ์ตาราง (041 ให้เฉพาะ web_anon/service_role)
        `${role} + GUC: ${stmt}`);
    }
    sql(`SET ROLE ${role}; SET ener.free_policy_rpc = 'on'; RESET ROLE;`); // GUC itself is settable (harmless)
  }
  sql("SET ROLE web_anon; SET ener.free_policy_rpc = 'on'; UPDATE app_settings SET value = jsonb_set(value,'{freeQuotaPerDay}','3') WHERE key='scan_offer'; RESET ROLE;");
  assert.equal(sql("SELECT value->>'freeQuotaPerDay' FROM app_settings WHERE key='scan_offer'"), "3", "other settings still writable with GUC set");
  assert.equal(mode().mode, "daily"); exclusive(); assert.equal(sql("SELECT count(*) FROM free_policy_audit"), "0");
  // legitimate RPC still works when the caller has the GUC set (and when not)
  assert.equal(jAdmin("SET ener.free_policy_rpc = 'on'; SELECT set_free_policy_mode('none','kob',now()-interval '72 hours',false)").mode, "none");
  assert.equal(jAdmin("SELECT set_free_policy_mode('daily','kob',NULL,false)").mode, "daily");
  assert.equal(sql("SELECT count(*) FROM free_policy_audit WHERE action='mode_set'"), "2"); sql("DELETE FROM free_policy_audit"); // keep later counters as before
  assert.equal(sql("SELECT (SELECT prosecdef FROM pg_proc WHERE proname='guard_free_policy_settings')::text"), "false", "guard is SECURITY INVOKER so current_user is the real caller");
  pass.push("(a) direct app_settings writes/deletes/renames on policy keys blocked for web_anon/service_role; other keys fine; RPC path still works");
  pass.push("(a3) caller-set GUC (SET/SET LOCAL/set_config, incl. free_policy_admin) does not unlock the guard; RPC path still works");

  // ── 2: 72h enforced for immediate withdrawal of daily ──
  assert.throws(() => asAdmin("SELECT set_free_policy_mode('none','kob',NULL,false)"), /notice_required/);
  assert.throws(() => asAdmin("SELECT set_free_policy_mode('new_customer','kob',NULL,false)"), /notice_required/);
  assert.throws(() => asAdmin("SELECT set_free_policy_mode('none','kob',now()-interval '71 hours 59 minutes',false)"), /notice_period_72h/);
  assert.throws(() => asAdmin("SELECT set_free_policy_mode('none','kob',now()+interval '1 minute',false)"), /announced_at_in_future/);
  // legacy switch: daily → new_customer has no announced_at → blocked (refinement 1)
  assert.throws(() => asAdmin("SELECT set_new_customer_trial_policy(true)"), /notice_required/);
  assert.equal(mode().mode, "daily"); exclusive();
  // scheduled withdrawal: too early / no notice / ok
  assert.throws(() => asAdmin("SELECT free_policy_schedule_set('none',now()+interval '71 hours',now(),'kob')"), /notice_period_72h/);
  assert.throws(() => asAdmin("SELECT free_policy_schedule_set('none',now()+interval '80 hours',NULL,'kob')"), /notice_required/);
  assert.throws(() => asAdmin("SELECT free_policy_schedule_set('none',now()-interval '1 second',now()-interval '80 hours','kob')"), /effective_at_must_be_future/);
  assert.throws(() => asAdmin("SELECT free_policy_schedule_set('none',now()+interval '80 hours',now()+interval '1 hour','kob')"), /announced_at_in_future/);
  assert.equal(sql("SELECT count(*) FROM free_policy_schedule"), "0", "failed schedule_set must not leave rows");
  const s1 = jAdmin("SELECT free_policy_schedule_set('none',now()+interval '72 hours 1 minute',now(),'kob')");
  assert.equal(s1.status, "pending"); assert.equal(s1.target_mode, "none");
  // pending exists → manual change refused; p_cancel_pending still cannot skip 72h; pending survives the failed call
  assert.throws(() => asAdmin("SELECT set_free_policy_mode('new_customer','kob',now()-interval '73 hours',false)"), /schedule_pending/);
  assert.throws(() => asAdmin("SELECT set_free_policy_mode('none','kob',NULL,true)"), /notice_required/);
  assert.throws(() => asAdmin("SELECT set_free_policy_mode('none','kob',now()-interval '1 hour',true)"), /notice_period_72h/);
  assert.equal(sql(`SELECT status FROM free_policy_schedule WHERE id=${s1.id}`), "pending", "pending must survive a refused manual change");
  // supersede: new schedule replaces old; cancel; cancel twice refused
  const s2 = jAdmin("SELECT free_policy_schedule_set('new_customer',now()+interval '73 hours',now(),'kob')");
  assert.equal(sql(`SELECT status FROM free_policy_schedule WHERE id=${s1.id}`), "superseded");
  assert.equal(sql("SELECT count(*) FROM free_policy_schedule WHERE status='pending'"), "1");
  asAdmin(`SELECT free_policy_schedule_cancel(${s2.id},'kob')`);
  assert.throws(() => asAdmin(`SELECT free_policy_schedule_cancel(${s2.id},'kob')`), /schedule_not_pending/);
  assert.equal(mode().mode, "daily"); exclusive();
  // immediate withdrawal with valid notice → none; audit carries announced_at + actor
  const r = jAdmin("SELECT set_free_policy_mode('none','kob',now()-interval '72 hours',false)");
  assert.equal(r.mode, "none"); exclusive(); assert.equal(settings().fp.daily_enabled, false); assert.equal(settings().trial.enabled, false);
  const audit = j("SELECT to_jsonb(a) FROM free_policy_audit a WHERE action='mode_set' ORDER BY id DESC LIMIT 1");
  assert.equal(audit.actor, "kob"); assert.equal(audit.from_mode, "daily"); assert.equal(audit.to_mode, "none"); assert.ok(audit.announced_at, "audit must record announced_at");
  pass.push("2 72h enforced in DB (immediate + scheduled), no bypass via p_cancel_pending/legacy switch, audit has announced_at/actor");

  // ── 3: none mode blocks free non-bonus job creation at INSERT; paid/bonus still pass; status consistent ──
  assert.throws(() => sql(insert(1)), /free_policy_none/);
  sql(insert(1, "paid")); sql(insert(1, "free", "'bonus_reserved'"));
  assert.equal(sql(`SELECT bonus_scans FROM app_users WHERE id='${uid(1)}'`), "1");
  const t = trial("user1"); assert.equal(t.mode, "none"); assert.equal(t.enabled, false); assert.equal(t.daily_enabled, false); assert.equal(t.eligible, false);
  // none → daily (re-open free): no notice needed, immediate
  assert.equal(jAdmin("SELECT set_free_policy_mode('daily','kob',NULL,false)").mode, "daily"); sql(insert(1)); exclusive();
  // noop + same-mode audit
  jAdmin("SELECT set_free_policy_mode('daily','kob',NULL,false)");
  assert.equal(sql("SELECT count(*) FROM free_policy_audit WHERE action='mode_noop'"), "1");
  pass.push("3a none: free INSERT raises free_policy_none, paid/bonus pass, status mode=none; none→daily immediate");

  // ── 3+4: scheduled first trial enable → effective by DB time before worker; cutoff = effective_at; accounts before/at/after ──
  const eff = sql("SELECT (now() + interval '1500 milliseconds')::text");
  const s3 = jAdmin(`SELECT free_policy_schedule_set('new_customer','${eff}'::timestamptz,now()-interval '72 hours','kob')`);
  assert.equal(mode().mode, "daily", "not yet effective"); assert.equal(trial().enabled, false);
  sql(`INSERT INTO app_users(id,line_user_id,created_at) VALUES ('${uid(2)}','user2','${eff}'::timestamptz - interval '1 millisecond');`); // before
  sql(`INSERT INTO app_users(id,line_user_id,created_at) VALUES ('${uid(3)}','user3','${eff}'::timestamptz);`);                          // exactly at
  sql(`INSERT INTO app_users(id,line_user_id,created_at) VALUES ('${uid(4)}','user4','${eff}'::timestamptz + interval '1 second');`);     // after
  await sleep(1700);
  const due = mode();
  assert.equal(due.mode, "new_customer", "due pending wins before apply"); assert.equal(due.stored_mode, "daily"); assert.equal(due.due_schedule_id, s3.id);
  assert.equal(new Date(due.eligible_since).toISOString(), new Date(eff).toISOString(), "cutoff = effective_at (not worker time)");
  assert.equal(trial().enabled, true); assert.equal(trial("user2").eligible, false); assert.equal(trial("user3").eligible, true); assert.equal(trial("user4").eligible, true);
  assert.throws(() => sql(insert(1)), /trial_not_eligible/, "old account blocked by effective (unapplied) policy at INSERT");
  assert.throws(() => sql(insert(2)), /trial_not_eligible/);
  sql(insert(3)); sql(insert(4)); // at/after → trial
  assert.equal(sql(`SELECT free_access_kind FROM scan_jobs WHERE id='${uid(jid)}'`), "trial");
  // apply_due (worker wakes late): applies once, cutoff still = effective_at, applied_at later than effective_at
  await sleep(400);
  const ap = jAdmin("SELECT free_policy_schedule_apply_due()");
  assert.equal(ap.applied, true); assert.equal(ap.schedule_id, s3.id); assert.equal(ap.from, "daily"); assert.equal(ap.to, "new_customer");
  assert.equal(new Date(ap.eligible_since).toISOString(), new Date(eff).toISOString());
  assert.equal(sql(`SELECT (applied_at > effective_at)::text FROM free_policy_schedule WHERE id=${s3.id}`), "true");
  assert.equal(jAdmin("SELECT free_policy_schedule_apply_due()").applied, false, "second apply is a no-op");
  const after = mode(); assert.equal(after.mode, "new_customer"); assert.equal(after.stored_mode, "new_customer"); assert.equal(after.due_schedule_id, null);
  assert.equal(new Date(after.eligible_since).toISOString(), new Date(eff).toISOString()); exclusive();
  assert.equal(trial("user2").eligible, false); assert.equal(trial("user3").eligible, true);
  sql(insert(3)); assert.throws(() => sql(insert(3)), /trial_quota_exhausted/);
  // restart/idempotent: re-apply 067 keeps mode + cutoff + used quota
  sql(M067);
  assert.equal(mode().mode, "new_customer"); assert.equal(new Date(mode().eligible_since).toISOString(), new Date(eff).toISOString());
  assert.throws(() => sql(insert(3)), /trial_quota_exhausted/);
  pass.push("3b/4 scheduled trial enable: effective by DB time before worker, cutoff = effective_at, accounts before/at/after, apply once, restart-safe");

  // ── 4b: cutoff preserved across new_customer → none → new_customer (scheduled and manual) ──
  assert.equal(jAdmin("SELECT set_free_policy_mode('none','kob',NULL,false)").mode, "none"); // new_customer→none: no daily withdrawn
  assert.equal(jAdmin("SELECT set_free_policy_mode('new_customer','kob',NULL,false)").mode, "new_customer");
  assert.equal(new Date(mode().eligible_since).toISOString(), new Date(eff).toISOString(), "existing cutoff never moves");
  assert.equal(JSON.parse(asAdmin("SELECT set_new_customer_trial_policy(false)")).enabled, false, "legacy switch may re-open daily");
  assert.equal(mode().mode, "daily"); exclusive();
  assert.equal(new Date(settings().trial.eligible_since).toISOString(), new Date(eff).toISOString());
  pass.push("4b cutoff preserved across toggles; legacy switch allowed for opening daily");

  // ── (b) two transactions cannot bypass 72h: A opens daily (uncommitted) while B asks new_customer without notice ──
  assert.equal(jAdmin("SELECT set_free_policy_mode('none','kob',now()-interval '72 hours',false)").mode, "none");
  const ra0 = concurrent("SET ROLE free_policy_admin; BEGIN; SELECT set_free_policy_mode('daily','A',NULL,false); SELECT pg_sleep(0.7); COMMIT;");
  await sleep(200);
  const rb0 = await concurrent("SET ROLE free_policy_admin; SELECT set_free_policy_mode('new_customer','B',NULL,false);");
  const ra1 = await ra0;
  assert.ok(!ra1.error, ra1.stderr);
  assert.ok(rb0.error && /notice_required/.test(rb0.stderr), "B must wait for A's lock and then see daily → notice_required: " + rb0.stderr);
  assert.equal(mode().mode, "daily"); exclusive();
  assert.equal(sql("SELECT count(*) FROM free_policy_audit WHERE action='mode_set' AND from_mode='daily' AND to_mode='new_customer' AND announced_at IS NULL"), "0", "no daily→new_customer without notice ever recorded");
  // same race with a valid notice from B → B applies after A (serialized), audit from_mode = daily
  const ra2 = concurrent("SET ROLE free_policy_admin; BEGIN; SELECT set_free_policy_mode('none','A',now()-interval '72 hours',false); SELECT pg_sleep(0.5); COMMIT;");
  await sleep(200);
  const rb2 = await concurrent("SET ROLE free_policy_admin; SELECT set_free_policy_mode('new_customer','B',now()-interval '72 hours',false);");
  await ra2; assert.ok(!rb2.error, rb2.stderr);
  assert.equal(sql("SELECT from_mode||'>'||to_mode FROM free_policy_audit WHERE action='mode_set' ORDER BY id DESC LIMIT 1"), "none>new_customer", "B saw A's committed state");
  assert.equal(jAdmin("SELECT set_free_policy_mode('daily','kob',NULL,false)").mode, "daily");
  pass.push("(b) lock before read: concurrent manual changes serialize, no 72h bypass, audit reflects committed from_mode");

  // ── (c) cancel after effective_at but before worker apply → refused, mode + cutoff kept, schedule becomes applied ──
  // use a fresh cutoff scenario: reset to a DB without eligible_since is not possible (cutoff is permanent) → verify mode + cutoff unchanged instead
  const effC = sql("SELECT (now() + interval '1100 milliseconds')::text");
  const sC = jAdmin(`SELECT free_policy_schedule_set('none','${effC}'::timestamptz,now()-interval '72 hours','kob')`);
  await sleep(1300);
  const beforeC = mode(); assert.equal(beforeC.mode, "none"); assert.equal(beforeC.stored_mode, "daily");
  assert.throws(() => asAdmin(`SELECT free_policy_schedule_cancel(${sC.id},'kob')`), /schedule_already_effective/);
  const afterC = mode(); assert.equal(afterC.mode, "none", "effective mode must not roll back"); assert.equal(afterC.eligible_since, beforeC.eligible_since, "cutoff must not change");
  assert.equal(sql(`SELECT status FROM free_policy_schedule WHERE id=${sC.id}`), "pending", "failed RPC rolls back its own reconcile too; worker/next RPC applies");
  assert.equal(jAdmin("SELECT free_policy_schedule_apply_due()").applied, true);
  assert.equal(sql(`SELECT status FROM free_policy_schedule WHERE id=${sC.id}`), "applied");
  assert.throws(() => asAdmin(`SELECT free_policy_schedule_cancel(${sC.id},'kob')`), /schedule_not_pending/);
  // first-ever trial enable via schedule, then cancel after due: cutoff must stay = effective_at (separate DB, cutoff never set before)
  const db3 = `${db}_c`; sql(`CREATE DATABASE ${db3}`, "postgres");
  try {
    sql(fixture, db3); for (const m of M) sql(m, db3); sql(M067, db3);
    const eff5 = sql("SELECT (now() + interval '1100 milliseconds')::text", db3);
    const s5c = JSON.parse(sql(`SET ROLE free_policy_admin; SELECT free_policy_schedule_set('new_customer','${eff5}'::timestamptz,now()-interval '72 hours','kob'); RESET ROLE;`, db3));
    await sleep(1300);
    const m1 = JSON.parse(sql("SELECT free_policy_mode_now()", db3)); assert.equal(m1.mode, "new_customer"); assert.equal(new Date(m1.eligible_since).toISOString(), new Date(eff5).toISOString());
    assert.throws(() => sql(`SET ROLE free_policy_admin; SELECT free_policy_schedule_cancel(${s5c.id},'kob'); RESET ROLE;`, db3), /schedule_already_effective/);
    const m2 = JSON.parse(sql("SELECT free_policy_mode_now()", db3)); assert.equal(m2.mode, "new_customer"); assert.equal(m2.eligible_since, m1.eligible_since, "first cutoff survives cancel attempt");
    assert.equal(JSON.parse(sql("SET ROLE free_policy_admin; SELECT free_policy_schedule_apply_due(); RESET ROLE;", db3)).applied, true);
    assert.equal(new Date(JSON.parse(sql("SELECT value FROM app_settings WHERE key='new_customer_trial'", db3)).eligible_since).toISOString(), new Date(eff5).toISOString(), "stored cutoff = effective_at after apply");
  } finally { sql(`DROP DATABASE ${db3} WITH (FORCE);`, "postgres"); }
  assert.equal(jAdmin("SELECT set_free_policy_mode('daily','kob',NULL,false)").mode, "daily");
  pass.push("(c) cancel after effective_at (before worker) refused: effective mode + cutoff kept, schedule later applied; first-ever cutoff survives");

  // ── (d) request starts BEFORE effective_at but waits on the lock until AFTER it → must decide with post-lock time ──
  // holder = superuser holding the settings row locks (same rows free_policy_lock takes) across effective_at
  const hold = () => concurrent("BEGIN; SELECT 1 FROM app_settings WHERE key IN ('new_customer_trial','free_policy') ORDER BY key FOR UPDATE; SELECT pg_sleep(1.6); COMMIT;");
  // d1: cancel — fresh DB so the first-ever cutoff comes from this schedule
  const db4 = `${db}_d`; sql(`CREATE DATABASE ${db4}`, "postgres");
  try {
    sql(fixture, db4); for (const m of M) sql(m, db4); sql(M067, db4);
    const q4 = (s2) => sql(s2, db4); const j4 = (s2) => JSON.parse(q4(s2)); const adm4 = (s2) => `SET ROLE free_policy_admin; ${s2}; RESET ROLE;`;
    const c4 = (s2) => new Promise((resolve) => { const ch = execFile("docker", args(db4), (error, stdout, stderr) => resolve({ error, stdout, stderr })); ch.stdin.end(s2); });
    const effD = q4("SELECT (now() + interval '700 milliseconds')::text");
    const sD = j4(adm4(`SELECT free_policy_schedule_set('new_customer','${effD}'::timestamptz,now()-interval '72 hours','kob')`));
    const hD = c4("BEGIN; SELECT 1 FROM app_settings WHERE key IN ('new_customer_trial','free_policy') ORDER BY key FOR UPDATE; SELECT pg_sleep(1.6); COMMIT;");
    await sleep(150);
    const cancelD = await c4(adm4(`SELECT free_policy_schedule_cancel(${sD.id},'kob')`)); // started before effective_at, lock released after it
    await hD;
    assert.ok(cancelD.error && /schedule_already_effective/.test(cancelD.stderr), "cancel decided with post-lock time: " + cancelD.stderr);
    const mD = j4("SELECT free_policy_mode_now()");
    assert.equal(mD.mode, "new_customer", "mode must not revert"); assert.equal(new Date(mD.eligible_since).toISOString(), new Date(effD).toISOString(), "cutoff must not be lost");
    assert.equal(q4(`SELECT status FROM free_policy_schedule WHERE id=${sD.id}`), "pending", "refused cancel leaves the row pending (RAISE rolled back); worker applies");
    // d2: replacement schedule_set that waited past effective_at → due one gets applied (not superseded), new one is from new_customer
    const effD2 = q4("SELECT (now() + interval '700 milliseconds')::text");
    assert.equal(j4(adm4("SELECT free_policy_schedule_apply_due()")).applied, true); // persist sD first so a new schedule can be set
    const sD2 = j4(adm4(`SELECT free_policy_schedule_set('none','${effD2}'::timestamptz,NULL,'kob')`)); // new_customer → none needs no notice
    const hD2 = c4("BEGIN; SELECT 1 FROM app_settings WHERE key IN ('new_customer_trial','free_policy') ORDER BY key FOR UPDATE; SELECT pg_sleep(1.6); COMMIT;");
    await sleep(150);
    const setD2 = await c4(adm4("SELECT free_policy_schedule_set('daily',now()+interval '1 hour',NULL,'kob')"));
    await hD2;
    assert.ok(!setD2.error, setD2.stderr);
    assert.equal(q4(`SELECT status FROM free_policy_schedule WHERE id=${sD2.id}`), "applied", "due schedule applied by reconcile, not superseded");
    const mD2 = j4("SELECT free_policy_mode_now()"); assert.equal(mD2.mode, "none"); assert.equal(mD2.stored_mode, "none");
    assert.equal(new Date(mD2.eligible_since).toISOString(), new Date(effD).toISOString(), "cutoff kept");
    assert.equal(q4("SELECT from_mode||'>'||to_mode FROM free_policy_audit WHERE action='schedule_set' ORDER BY id DESC LIMIT 1"), "none>daily", "new schedule based on reconciled mode");
    // d3: manual change with cancel_pending that waited past effective_at → due one applied first, then manual change from the new mode
    const pend3 = j4("SELECT free_policy_status(NULL)").schedule; assert.ok(pend3 && pend3.target_mode === "daily");
    q4(adm4(`SELECT free_policy_schedule_cancel(${pend3.id},'kob')`)); // future → cancellable
    const effD3 = q4("SELECT (now() + interval '700 milliseconds')::text");
    const sD3 = j4(adm4(`SELECT free_policy_schedule_set('daily','${effD3}'::timestamptz,NULL,'kob')`));
    const hD3 = c4("BEGIN; SELECT 1 FROM app_settings WHERE key IN ('new_customer_trial','free_policy') ORDER BY key FOR UPDATE; SELECT pg_sleep(1.6); COMMIT;");
    await sleep(150);
    const manD3 = await c4(adm4("SELECT set_free_policy_mode('none','kob',NULL,true)")); // daily (effective after wait) → none needs notice
    await hD3;
    assert.ok(manD3.error && /notice_required/.test(manD3.stderr), "manual change decided against the reconciled (daily) mode: " + manD3.stderr);
    assert.equal(q4(`SELECT status FROM free_policy_schedule WHERE id=${sD3.id}`), "pending", "refused RPC rolled back its reconcile; still pending + effective");
    const mD3 = j4("SELECT free_policy_mode_now()"); assert.equal(mD3.mode, "daily"); assert.equal(new Date(mD3.eligible_since).toISOString(), new Date(effD).toISOString());
  } finally { sql(`DROP DATABASE ${db4} WITH (FORCE);`, "postgres"); }
  void hold;
  pass.push("(d) lock-wait past effective_at: cancel refused, replacement schedule and manual change built on the reconciled mode; mode/cutoff never revert");

  // ── 5b: concurrency — two apply_due race for one due schedule; cancel vs in-flight apply; manual vs pending ──
  const eff2 = sql("SELECT (now() + interval '1200 milliseconds')::text");
  const s4 = jAdmin(`SELECT free_policy_schedule_set('new_customer','${eff2}'::timestamptz,now()-interval '72 hours','kob')`);
  await sleep(1400);
  const a = concurrent("SET ROLE free_policy_admin; BEGIN; SELECT free_policy_schedule_apply_due(); SELECT pg_sleep(0.5); COMMIT;");
  await sleep(150);
  const b = concurrent("SET ROLE free_policy_admin; SELECT free_policy_schedule_apply_due();");
  const c = concurrent(`SET ROLE free_policy_admin; SELECT free_policy_schedule_cancel(${s4.id},'kob');`);
  const [ra, rb, rc] = await Promise.all([a, b, c]);
  assert.ok(!ra.error, ra.stderr); assert.ok(!rb.error, rb.stderr);
  assert.equal([ra, rb].filter(x => /"applied": true/.test(x.stdout)).length, 1, "exactly one apply wins (SKIP LOCKED)");
  assert.ok(rc.error && /schedule_not_pending|schedule_already_effective/.test(rc.stderr), "cancel during/after apply must fail: " + rc.stderr);
  assert.equal(sql(`SELECT status FROM free_policy_schedule WHERE id=${s4.id}`), "applied");
  assert.equal(mode().mode, "new_customer"); exclusive();
  // manual change with pending: refused without cancel, allowed with cancel when no notice needed (new_customer → daily)
  const s5 = jAdmin("SELECT free_policy_schedule_set('none',now()+interval '1 hour',NULL,'kob')"); // from new_customer: no notice needed
  assert.throws(() => asAdmin("SELECT set_free_policy_mode('daily','kob',NULL,false)"), /schedule_pending/);
  assert.equal(jAdmin("SELECT set_free_policy_mode('daily','kob',NULL,true)").mode, "daily");
  assert.equal(sql(`SELECT status FROM free_policy_schedule WHERE id=${s5.id}`), "cancelled");
  assert.equal(sql("SELECT count(*) FROM free_policy_audit WHERE action='schedule_cancelled' AND detail->>'reason'='manual_change'"), "1");
  // reconcile: due-but-unapplied schedule is persisted BEFORE a manual change / new schedule decides from_mode (worker lag)
  const eff3 = sql("SELECT (now() + interval '1100 milliseconds')::text");
  const s6 = jAdmin(`SELECT free_policy_schedule_set('none','${eff3}'::timestamptz,now()-interval '72 hours','kob')`); // daily → none, notice ok
  await sleep(1300);
  assert.equal(mode().mode, "none"); assert.equal(mode().stored_mode, "daily", "worker has not applied yet");
  assert.throws(() => sql(insert(1)), /free_policy_none/, "none effective at INSERT before worker");
  // manual none → daily while the due none is unapplied: reconcile applies s6 first (audit from none), then daily
  assert.equal(jAdmin("SELECT set_free_policy_mode('daily','kob',NULL,false)").mode, "daily");
  assert.equal(sql(`SELECT status FROM free_policy_schedule WHERE id=${s6.id}`), "applied", "due schedule persisted by reconcile, not cancelled");
  assert.equal(sql("SELECT from_mode||'>'||to_mode FROM free_policy_audit WHERE action='mode_set' ORDER BY id DESC LIMIT 1"), "none>daily");
  assert.equal(sql("SELECT from_mode||'>'||to_mode FROM free_policy_audit WHERE action='mode_set' ORDER BY id DESC LIMIT 1 OFFSET 1"), "daily>none");
  // new schedule while a due none is unapplied: from_mode after reconcile = none → scheduling daily needs no notice; scheduling new_customer from none needs none either
  const eff4 = sql("SELECT (now() + interval '1100 milliseconds')::text");
  const s8 = jAdmin(`SELECT free_policy_schedule_set('none','${eff4}'::timestamptz,now()-interval '72 hours','kob')`);
  await sleep(1300);
  const s7 = jAdmin("SELECT free_policy_schedule_set('new_customer',now()+interval '1 hour',NULL,'kob')"); // from none (reconciled) → no notice needed
  assert.equal(mode().mode, "none"); assert.equal(mode().stored_mode, "none", "reconciled before new schedule");
  asAdmin(`SELECT free_policy_schedule_cancel(${s7.id},'kob')`);
  assert.equal(jAdmin("SELECT set_free_policy_mode('daily','kob',NULL,false)").mode, "daily");
  // audit RPC: admin only
  assert.ok(Array.isArray(jAdmin("SELECT free_policy_audit_recent(5)"))); assert.equal(jAdmin("SELECT free_policy_audit_recent(5)").length, 5);
  denied("SELECT free_policy_audit_recent(5)", "web_anon"); denied("SELECT free_policy_audit_recent(5)", "service_role");
  pass.push("5c reconcile due schedule before manual change / new schedule (worker lag) · audit_recent admin-only");
  // status RPC exposes pending/last_applied for the admin page
  const st = j("SELECT free_policy_status(NULL)");
  assert.equal(st.mode, "daily"); assert.equal(st.schedule, null); assert.equal(st.last_applied.id, s8.id); assert.equal(st.last_applied.status, "applied");
  pass.push("5b concurrent apply_due → one winner; cancel vs apply; manual vs pending (refused / cancel_pending)");
  console.log("PASS free-policy 067:\n - " + pass.join("\n - "));
} finally {
  sql(`DROP DATABASE ${db} WITH (FORCE);`, "postgres");
  console.log(`Removed synthetic database ${db}; no customer data used.`);
}
