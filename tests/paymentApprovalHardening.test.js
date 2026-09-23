import test from 'node:test';
import assert from 'node:assert/strict';

process.env.OPENAI_API_KEY = 'sk-test';
process.env.ENV_FILE = '/dev/null';
process.env.CHANNEL_ACCESS_TOKEN = 'test';
process.env.CHANNEL_SECRET = 'test';
process.env.LOCAL_POSTGREST_URL = 'http://127.0.0.1:9';
process.env.LOCAL_POSTGREST_ANON_KEY = 'test';
globalThis.fetch = async () => { throw new Error('network forbidden'); };
const { supabase } = await import('../src/config/supabase.js');
const { markPaymentApprovedAndUnlock } = await import('../src/stores/payments.db.js');
const { runPaymentGrantNotifySweep } = await import('../src/services/payments/paymentGrantNotifier.service.js');

test('every approval caller submits calculation snapshot, including nullable inputs', async () => {
  const oldFrom = supabase.from, oldRpc = supabase.rpc;
  const row = { id:'test-payment', user_id:'test-owner', line_user_id:'test-line', status:'pending_verify',
    package_code:'49baht_4scans_24h', expected_amount:49, unlock_hours:24 };
  let called;
  supabase.from = () => ({ select(){return this;}, eq(){return this;}, async maybeSingle(){return {data:{...row},error:null};} });
  supabase.rpc = async (name, args) => { called={name,args}; return {data:{ok:false,reason:'stale_calculation'}}; };
  try {
    for (const hours of [24, null]) {
      row.unlock_hours = hours;
      await assert.rejects(markPaymentApprovedAndUnlock({paymentId:row.id}), /stale_calculation/);
      assert.equal(called.name,'approve_payment_and_grant');
      assert.deepEqual(called.args.p_calculation_snapshot, {
        package_code:row.package_code, expected_amount:49, unlock_hours:hours,
        user_id:row.user_id, line_user_id:row.line_user_id, status:'pending_verify',
      });
    }
    called=null;
    await assert.rejects(markPaymentApprovedAndUnlock({paymentId:row.id,expect:{packageCode:'different'}}), /stale_package/);
    assert.equal(called,null);
    await assert.rejects(markPaymentApprovedAndUnlock({paymentId:row.id,expect:{expectedAmount:null}}), /stale_amount/);
    assert.equal(called,null);
  } finally { supabase.from=oldFrom; supabase.rpc=oldRpc; }
});

test('notification stamp error, throw, false or malformed never reports success; retry recovers', async () => {
  const g={payment_id:'p',line_user_id:'test-line',scans_added:4,carry_over:0};
  for (const failure of ['error','throw','false','null']) {
    let stampFails=true, stamped=false, enqueues=0, exists=false;
    const db={async rpc(name){
      if (name==='list_payment_grants_pending_notify') return {data:stamped?[]:[g]};
      if (stampFails) {
        if(failure==='throw') throw new Error('stamp failed');
        return failure==='error'?{error:{message:'stamp failed'}}:{data:failure==='false'?false:null};
      }
      stamped=true;return {data:true};
    }};
    const deps={db,buildPaymentApprovedText:async()=> 'approved',enqueueApproveNotify:async()=>{
      enqueues++; const deduped=exists; exists=true; return {id:'outbound',deduped};
    }};
    const first=await runPaymentGrantNotifySweep(deps);
    assert.equal(first.failed,1);assert.equal(first.enqueued,0);assert.equal(first.alreadyQueued,0);
    stampFails=false;
    assert.equal((await runPaymentGrantNotifySweep(deps)).alreadyQueued,1);
    assert.equal((await runPaymentGrantNotifySweep(deps)).scanned,0);
    assert.equal(enqueues,2);
  }
});

test('uniqueness races require persisted evidence; arbitrary errors cannot stamp success', async () => {
  for (const code of ['23505','other']) {
    let stamps=0;
    const db={async rpc(name){
      if(name==='list_payment_grants_pending_notify') return {data:[{payment_id:'p'}]};
      stamps++; return {data:false};
    }};
    const result=await runPaymentGrantNotifySweep({db,buildPaymentApprovedText:async()=>'',
      enqueueApproveNotify:async()=>{throw Object.assign(new Error('duplicate key'),{code});}});
    assert.equal(result.failed,1);assert.equal(result.alreadyQueued,0);
    assert.equal(stamps,code==='23505'?1:0);
  }
});
