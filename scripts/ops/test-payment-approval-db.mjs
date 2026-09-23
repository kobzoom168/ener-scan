// LOCAL ONLY. Start a disposable postgres:16-alpine container named below,
// with --network none and no published ports. Never reads application .env.
import { execFileSync, execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const container='ener-approval-codex-test';
const meta=JSON.parse(execFileSync('docker',['inspect',container],{encoding:'utf8'}))[0];
assert.equal(meta.HostConfig.NetworkMode,'none');
assert.equal(Object.keys(meta.HostConfig.PortBindings||{}).length,0);
const dbName=`approval_test_${process.pid}`;
const args=(db=dbName)=>['exec','-i',container,'psql','-U','postgres','-d',db,'-X','-qAt','-v','ON_ERROR_STOP=1'];
const sql=(s,db)=>execFileSync('docker',args(db),{input:s,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const q=v=>v==null?'NULL':`'${String(v).replaceAll("'","''")}'`;
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const uid=id(1);
const snapshot=n=>JSON.parse(sql(`SELECT jsonb_build_object('package_code',package_code,'expected_amount',expected_amount,
 'unlock_hours',unlock_hours,'user_id',user_id,'line_user_id',line_user_id,'status',status) FROM payments WHERE id=${q(id(n))}`));
const call=(n,snap=snapshot(n))=>`SELECT approve_payment_and_grant(${q(id(n))},'test','synthetic',NULL,NULL,
 '49baht_4scans_24h',4,now()+interval '1 day',false,${q(JSON.stringify(snap))}::jsonb)`;
const approve=n=>JSON.parse(sql(call(n)));
const insert=n=>sql(`INSERT INTO payments(id,user_id,line_user_id,status,package_code,expected_amount,unlock_hours)
 VALUES(${q(id(n))},${q(uid)},'synthetic-user','pending_verify','49baht_4scans_24h',49,24)`);
const state=n=>JSON.parse(sql(`SELECT jsonb_build_object('payment',p.status,'remaining',u.paid_remaining_scans,
 'grants',(SELECT count(*) FROM payment_entitlement_grants WHERE payment_id=p.id),
 'audits',(SELECT count(*) FROM payment_approval_audit WHERE payment_id=p.id))
 FROM payments p JOIN app_users u ON u.id=p.user_id WHERE p.id=${q(id(n))}`));
const concurrent=s=>new Promise((resolve,reject)=>{const p=execFile('docker',args(),(e,out)=>e?reject(e):resolve(out));p.stdin.end(s);});
sql(`CREATE DATABASE ${dbName}`,'postgres');
try {
  sql(`DO $$ BEGIN
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='web_anon') THEN CREATE ROLE web_anon; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF; END $$;
    CREATE TABLE app_users(id uuid PRIMARY KEY,paid_remaining_scans integer,paid_plan_code text,paid_until timestamptz,updated_at timestamptz);
    CREATE TABLE payments(id uuid PRIMARY KEY,user_id uuid,line_user_id text,status text,package_code text,
      expected_amount numeric,unlock_hours integer,verified_at timestamptz,approved_by text,updated_at timestamptz);
    CREATE TABLE outbound_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),related_payment_id uuid,kind text,status text,payload_json jsonb);
    INSERT INTO app_users VALUES(${q(uid)},2,'old',now()+interval '1 day',now());`);
  for(const file of ['061_telegram_slip_approval.sql','062_atomic_payment_approval.sql','063_payment_approval_snapshot.sql','063_payment_approval_snapshot.sql'])
    sql(readFileSync(new URL(`../../sql/${file}`,import.meta.url),'utf8'));
  assert.equal(sql(`SELECT to_regprocedure('approve_payment_and_grant(uuid,text,text,text,numeric,text,integer,timestamptz,boolean)') IS NULL`),'t');
  console.log('PASS migration idempotent, unsafe old overload removed');

  insert(10);
  const before=state(10);
  sql(`CREATE FUNCTION reject_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic_audit_failure'; END $$;
    CREATE TRIGGER reject_test_audit BEFORE INSERT ON payment_approval_audit FOR EACH ROW EXECUTE FUNCTION reject_test_audit();`);
  assert.throws(()=>approve(10),/synthetic_audit_failure/);
  assert.deepEqual(state(10),before);
  sql('DROP TRIGGER reject_test_audit ON payment_approval_audit; DROP FUNCTION reject_test_audit();');
  assert.equal(approve(10).ok,true);
  assert.deepEqual(state(10),{payment:'paid',remaining:4,grants:1,audits:1});
  sql(`UPDATE app_users SET paid_remaining_scans=1 WHERE id=${q(uid)}`);
  assert.equal(approve(10).alreadyGranted,true); assert.equal(state(10).remaining,1);
  console.log('PASS real audit failure rolls back ALL writes; retry after usage does not refill');

  let n=20;
  for(const [column,value] of [['package_code',"'other'"],['expected_amount','99'],['unlock_hours','48'],['unlock_hours','NULL'],['line_user_id',"'different-user'"]]) {
    insert(n); const snap=snapshot(n);sql(`UPDATE payments SET ${column}=${value} WHERE id=${q(id(n))}`);
    assert.equal(JSON.parse(sql(call(n,snap))).reason,'stale_calculation');
    assert.equal(state(n).grants,0);n++;
  }
  insert(30); const snap=snapshot(30);sql(`UPDATE payments SET expected_amount=NULL WHERE id=${q(id(30))}`);
  assert.equal(JSON.parse(sql(call(30,snap))).reason,'stale_calculation');
  assert.equal(JSON.parse(sql(call(30,null))).reason,'stale_calculation');
  console.log('PASS null-safe mandatory snapshot rejects changed amount/package/hours/owner');

  insert(40); const statement=call(40);
  await Promise.all(Array.from({length:5},()=>concurrent(statement)));
  assert.equal(state(40).grants,1);assert.equal(state(40).audits,1);
  console.log('PASS five concurrent DB connections grant exactly once');
  insert(50);sql(`UPDATE payments SET status='paid' WHERE id=${q(id(50))}`);
  assert.equal(approve(50).reason,'legacy_unverified');assert.equal(state(50).grants,0);

  // Production JS wrapper, real SQL RPC; adapter substitutes only transport.
  process.env.ENV_FILE='/dev/null';process.env.OPENAI_API_KEY='sk-test';
  process.env.CHANNEL_ACCESS_TOKEN='test';process.env.CHANNEL_SECRET='test';
  process.env.LOCAL_POSTGREST_URL='http://127.0.0.1:9';process.env.LOCAL_POSTGREST_ANON_KEY='test';
  globalThis.fetch=async()=>{throw new Error('network forbidden');};
  const {supabase}=await import('../../src/config/supabase.js');
  const {markPaymentApprovedAndUnlock}=await import('../../src/stores/payments.db.js');
  const oldFrom=supabase.from,oldRpc=supabase.rpc;
  insert(60);
  supabase.from=()=>({select(){return this;},eq(){return this;},async maybeSingle(){return {
    data:JSON.parse(sql(`SELECT to_jsonb(p) FROM payments p WHERE id=${q(id(60))}`)),error:null};}});
  supabase.rpc=async(name,a)=>{
    assert.equal(name,'approve_payment_and_grant');
    sql(`UPDATE payments SET unlock_hours=48 WHERE id=${q(id(60))}`);
    return {data:JSON.parse(sql(call(60,a.p_calculation_snapshot))),error:null};
  };
  try { await assert.rejects(markPaymentApprovedAndUnlock({paymentId:id(60)}),/stale_calculation/); }
  finally {supabase.from=oldFrom;supabase.rpc=oldRpc;}
  assert.equal(state(60).grants,0);
  console.log('PASS actual JS caller without expect detects DB change before commit');

  // Production sweeper, actual DB state and real constraints, no network.
  const {runPaymentGrantNotifySweep}=await import('../../src/services/payments/paymentGrantNotifier.service.js');
  sql(`UPDATE payment_entitlement_grants SET granted_at=now()-interval '3 minutes';
    CREATE FUNCTION reject_test_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic_outbox_failure'; END $$;
    CREATE TRIGGER reject_test_outbox BEFORE INSERT ON outbound_messages FOR EACH ROW EXECUTE FUNCTION reject_test_outbox();`);
  const db={async rpc(name,a){
    if(name==='list_payment_grants_pending_notify')return {data:JSON.parse(sql(`SELECT COALESCE(jsonb_agg(t),'[]') FROM list_payment_grants_pending_notify(20) t`))};
    assert.equal(name,'mark_payment_grant_notified');
    return {data:sql(`SELECT mark_payment_grant_notified(${q(a.p_payment_id)})`)==='t'};
  }};
  const deps={db,buildPaymentApprovedText:async()=> 'synthetic approved',enqueueApproveNotify:async({paymentId,text})=>{
    const existing=sql(`SELECT id FROM outbound_messages WHERE related_payment_id=${q(paymentId)} AND kind='approve_notify'`);
    if(existing)return {id:existing,deduped:true};
    const out=sql(`INSERT INTO outbound_messages(related_payment_id,kind,status,payload_json)
      VALUES(${q(paymentId)},'approve_notify','queued',${q(JSON.stringify({text}))}::jsonb) RETURNING id`);
    return {id:out,deduped:false};
  }};
  const quotaBefore=sql('SELECT paid_remaining_scans FROM app_users');
  assert.equal((await runPaymentGrantNotifySweep(deps)).failed,2);
  assert.equal(sql('SELECT count(*) FROM payment_entitlement_grants WHERE notified_at IS NOT NULL'),'0');
  assert.equal(sql(`SELECT mark_payment_grant_notified(${q(id(10))})`),'f');
  sql('DROP TRIGGER reject_test_outbox ON outbound_messages; DROP FUNCTION reject_test_outbox();');
  assert.equal((await runPaymentGrantNotifySweep(deps)).enqueued,2);
  assert.equal((await runPaymentGrantNotifySweep(deps)).scanned,0);
  assert.equal(sql('SELECT count(*) FROM outbound_messages'),'2');
  assert.equal(sql('SELECT paid_remaining_scans FROM app_users'),quotaBefore);
  assert.equal(sql(`SELECT count(*) FROM outbound_messages WHERE related_payment_id=${q(id(50))}`),'0');
  // Crash after enqueue but before stamp: preserve existing outbox, never regrant.
  sql(`UPDATE payment_entitlement_grants SET notified_at=NULL WHERE payment_id=${q(id(10))}`);
  assert.equal((await runPaymentGrantNotifySweep(deps)).alreadyQueued,1);
  assert.equal(sql('SELECT count(*) FROM outbound_messages'),'2');
  console.log('PASS outbox insert failure recovers once; crash after enqueue dedupes; legacy untouched');
  assert.equal(sql(`SELECT has_function_privilege('public','approve_payment_and_grant(uuid,text,text,text,numeric,text,integer,timestamptz,boolean,jsonb)','EXECUTE')`),'f');
  console.log('PASS PUBLIC cannot execute approval RPC');
} finally {
  sql(`DROP DATABASE ${dbName} WITH (FORCE)`,'postgres');
  console.log('Synthetic database removed; no customer database contacted');
}
