/**
 * P0-2 delivered status + quota forward path (Codex รอบสอง 20 ส.ค. 2026)
 * รอบแรกเป็น source-contract ล้วนจึง false green กับ backfill ที่ใช้หลักฐานผิดชนิด —
 * รอบนี้เป็น fixture/behavior จริง: predicate ของ backfill + postDelivery runtime
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  isActualDeliveryEvidence,
  resolveBackfillDecision,
} from "../src/services/scanV2/deliveredBackfill.util.js";
import { handleScanResultPostDelivery } from "../src/services/scanV2/deliverOutbound.service.js";
import { reEnqueueHeldReport } from "../src/services/objectInfoGate/objectInfoGate.service.js";

const JOB = { id: "job-1", line_user_id: "Uaaa", result_id: "res-9", status: "delivery_queued" };
const HELD_SENT = {
  kind: "scan_result", status: "sent", related_job_id: "job-1", line_user_id: "Uaaa",
  payload_json: { scanResultId: "res-9" },
};
const ACTUAL_SENT = {
  kind: "scan_result", status: "sent", related_job_id: null, line_user_id: "Uaaa",
  payload_json: { scanResultId: "res-9" },
};

test("backfill fixture 1: held outbound (related_job_id+sent) แต่ไม่มี actual delivery → job คง delivery_queued", () => {
  // outbound ตัวแรกถูก mark sent ตอนเกต "พักรายงานแล้วส่งคำถาม" — ไม่ใช่หลักฐานส่งผลเต็ม
  assert.equal(isActualDeliveryEvidence(HELD_SENT, JOB), false);
  const d = resolveBackfillDecision(JOB, [HELD_SENT]);
  assert.equal(d.markDelivered, false);
  assert.equal(d.reason, "no_actual_delivery_evidence");
});

test("backfill fixture 2: unlinked actual sent + scanResultId ตรง result_id → mark delivered", () => {
  assert.equal(isActualDeliveryEvidence(ACTUAL_SENT, JOB), true);
  assert.equal(resolveBackfillDecision(JOB, [HELD_SENT, ACTUAL_SENT]).markDelivered, true);
  // scanId key ก็นับ (payload บางยุคใช้ชื่อนี้)
  assert.equal(
    isActualDeliveryEvidence({ ...ACTUAL_SENT, payload_json: { scanId: "res-9" } }, JOB),
    true,
  );
});

test("backfill fixture 3: result id ไม่ตรง / error=true / คนละ user / ยังไม่ sent → ห้ามแตะ", () => {
  assert.equal(isActualDeliveryEvidence({ ...ACTUAL_SENT, payload_json: { scanResultId: "res-OTHER" } }, JOB), false);
  assert.equal(isActualDeliveryEvidence({ ...ACTUAL_SENT, payload_json: { scanResultId: "res-9", error: true } }, JOB), false);
  assert.equal(isActualDeliveryEvidence({ ...ACTUAL_SENT, line_user_id: "Ubbb" }, JOB), false);
  assert.equal(isActualDeliveryEvidence({ ...ACTUAL_SENT, status: "queued" }, JOB), false);
  assert.equal(resolveBackfillDecision({ ...JOB, result_id: null }, [ACTUAL_SENT]).markDelivered, false);
});

test("backfill fixture 4: failed/cancelled/delivered → ห้ามแตะไม่ว่ามีหลักฐานไหม", () => {
  for (const st of ["failed", "cancelled", "delivered", "suppressed_banned"]) {
    const d = resolveBackfillDecision({ ...JOB, status: st }, [ACTUAL_SENT]);
    assert.equal(d.markDelivered, false, `status ${st} ต้องไม่ถูกแตะ`);
  }
});

test("backfill fixture 5: SQL ใช้ actual-delivery predicate เดียวกัน — ห้ามใช้ related sent ตัวแรกเป็นหลักฐาน", () => {
  const sql = fs.readFileSync(path.join(process.cwd(), "sql", "backfill_delivered_status_20260820.sql"), "utf8");
  assert.ok(sql.includes("o.related_job_id IS NULL"), "หลักฐานต้องเป็น outbound ที่ re-enqueue (ไม่มี related_job_id)");
  assert.ok(!/o\.related_job_id\s*=\s*j\.id/.test(sql), "ห้ามใช้ held outbound (related_job_id=job.id) เป็นหลักฐาน");
  assert.ok(sql.includes("o.line_user_id = j.line_user_id"));
  assert.ok(sql.includes("'scanResultId' = j.result_id::text") && sql.includes("'scanId' = j.result_id::text"));
  assert.ok(/COALESCE\(o\.payload_json ->> 'error', ''\) <> 'true'/.test(sql), "payload.error=true ห้ามนับ");
  assert.ok(sql.includes("j.status = 'delivery_queued'"), "แตะเฉพาะงานค้างคิว");
  assert.ok(!/^\d/.test("backfill_delivered_status_20260820.sql"), "ชื่อไฟล์ห้ามขึ้นต้นด้วยเลข (กัน auto-migration)");
});

/* ---------------- quota ledger (Codex B2 รอบสอง — runtime, DI) ---------------- */

/** จำลอง semantics ของ migration 055 ฉบับ authority: derive เจ้าของจาก jobs ใน "DB" ·
 *  RPC atomic (decrement+complete ก้อนเดียว + zero-row = rollback) */
function fakeLedger(jobsById = {}) {
  const rows = new Map();
  const users = new Map(); // app_user_id -> paid_remaining_scans
  const state = { decrements: 0, failRpc: false, failEnsure: false };
  return {
    rows, users, state,
    registerUser: (id, remaining = 10) => users.set(id, remaining),
    ensureQuotaPending: async (jobId) => {
      if (state.failEnsure) return { ok: false, reason: "db down" };
      const j = jobsById[jobId];
      if (!j) return { ok: false, reason: "job_not_found" };
      if (j.access_source !== "paid" || !j.app_user_id) return { ok: false, reason: "not_paid" };
      const led = rows.get(jobId);
      if (led) {
        if (led.appUserId !== j.app_user_id) return { ok: false, reason: "user_mismatch" };
        return { ok: true, status: led.status };
      }
      rows.set(jobId, { appUserId: j.app_user_id, status: "pending", attempts: 0, lastError: null });
      return { ok: true, status: "pending" };
    },
    runQuotaDecrement: async (jobId) => {
      const r = rows.get(jobId);
      if (!r) return { ok: false, outcome: "no_ledger", reason: "no_ledger" };
      if (r.status === "completed") return { ok: true, outcome: "already_completed" };
      if (state.failRpc) return { ok: false, reason: "rpc db error" };
      if (!users.has(r.appUserId)) return { ok: false, reason: "app_user_update_affected_0" }; // zero-row → rollback, คง pending
      // atomic เหมือน RPC จริง: หัก + complete ใน "จังหวะเดียว"
      users.set(r.appUserId, Math.max(users.get(r.appUserId) - 1, 0));
      state.decrements += 1;
      r.status = "completed";
      r.attempts += 1;
      return { ok: true, outcome: "completed" };
    },
    markQuotaDecrementError: async (jobId, m) => {
      const r = rows.get(jobId);
      if (r && r.status === "pending") { r.attempts += 1; r.lastError = m; return { ok: true, affected: 1 }; }
      return { ok: true, affected: 0 };
    },
  };
}

function postDeliveryDeps(jobRow, ledger) {
  const state = { job: { ...jobRow }, updates: [], alerts: [], alertOk: true };
  const deps = {
    getScanJobById: async () => ({ ...state.job }),
    updateScanJob: async (_id, patch) => { state.updates.push(patch); state.job = { ...state.job, ...patch }; },
    ensureQuotaPending: ledger.ensureQuotaPending,
    runQuotaDecrement: ledger.runQuotaDecrement,
    markQuotaDecrementError: ledger.markQuotaDecrementError,
    quotaAlert: async (t) => { state.alerts.push(t); return { ok: state.alertOk }; },
  };
  return { state, deps };
}

const MSG = { related_job_id: "job-1", line_user_id: "Uaaa" };
const PAID_JOB = { id: "job-1", line_user_id: "Uaaa", status: "delivery_queued", access_source: "paid", app_user_id: "au-1", result_id: "res-9" };

/** sweep harness: client อ่าน pending จาก fake ledger */
function sweepClientOf(led) {
  return {
    from: () => ({ select: () => ({ eq: () => ({ lt: () => ({ order: () => ({ limit: async () => ({
      data: [...led.rows.entries()].filter(([, r]) => r.status === "pending").map(([job_id, r]) => ({ job_id, app_user_id: r.appUserId, attempts: r.attempts, created_at: new Date(0).toISOString() })),
      error: null,
    }) }) }) }) }) }),
  };
}

test("forward path: re-enqueue คง related_job_id เดิม (runtime DI)", async () => {
  const inserted = [];
  await reEnqueueHeldReport("Uaaa", { outboundPayload: { text: "x" }, relatedJobId: "job-1" }, {
    insertOutboundMessage: async (row) => { inserted.push(row); return { id: "ob-2" }; },
  });
  assert.equal(inserted[0].related_job_id, "job-1");
});

test("ledger ปกติ: จอง pending ก่อน delivered → หักครั้งเดียว completed (derive เจ้าของจาก DB ไม่ใช่ caller)", async () => {
  const led = fakeLedger({ "job-1": PAID_JOB });
  led.registerUser("au-1", 5);
  const { state, deps } = postDeliveryDeps(PAID_JOB, led);
  await handleScanResultPostDelivery(MSG, {}, deps);
  assert.equal(state.job.status, "delivered");
  assert.equal(led.state.decrements, 1);
  assert.equal(led.users.get("au-1"), 4);
  assert.equal(led.rows.get("job-1").status, "completed");
});

test("acceptance P0-1: ensure ล้ม + alert ล้ม → reconcile sweep สร้าง ledger คืนจาก evidence แล้วหักหนึ่งครั้ง — ไม่หาย ไม่ซ้ำ", async () => {
  const led = fakeLedger({ "job-1": PAID_JOB });
  led.registerUser("au-1", 5);
  led.state.failEnsure = true;
  const { state, deps } = postDeliveryDeps(PAID_JOB, led);
  state.alertOk = false; // Telegram ล้มด้วย — ห้ามเป็นเงื่อนไขของ recovery
  await handleScanResultPostDelivery(MSG, {}, deps);
  assert.equal(state.job.status, "delivered");
  assert.equal(led.rows.size, 0, "ยังไม่มี ledger (ensure ล้ม)");
  // maintenance รอบถัดไป: reconcile จาก actual-delivery evidence (paid+delivered+outbound sent+ยุค epoch)
  led.state.failEnsure = false;
  const { sweepPendingQuotaDecrements } = await import("../src/services/scanV2/quotaLedger.util.js");
  const deliveredJobs = [{ ...state.job }];
  const reconcileMissing = async () => {
    let created = 0;
    for (const j of deliveredJobs) {
      if (j.access_source === "paid" && j.app_user_id && j.status === "delivered" && !led.rows.has(j.id)) {
        led.rows.set(j.id, { appUserId: j.app_user_id, status: "pending", attempts: 0 });
        created += 1;
      }
    }
    return { ok: true, created };
  };
  const stats1 = await sweepPendingQuotaDecrements({
    dbClient: sweepClientOf(led), reconcileMissing,
    runDecrement: led.runQuotaDecrement, markError: led.markQuotaDecrementError,
    alert: async () => ({ ok: true }), alertDedupe: async () => true,
  });
  assert.equal(stats1.reconciledLedgers, 1);
  assert.equal(stats1.completed, 1);
  assert.equal(led.state.decrements, 1);
  // รอบถัดไปอีก → ไม่ซ้ำ
  const stats2 = await sweepPendingQuotaDecrements({
    dbClient: sweepClientOf(led), reconcileMissing,
    runDecrement: led.runQuotaDecrement, markError: led.markQuotaDecrementError,
    alert: async () => ({ ok: true }), alertDedupe: async () => true,
  });
  assert.equal(led.state.decrements, 1, "reconcile+sweep ซ้ำห้ามหักซ้ำ");
  assert.equal(stats2.reconciledLedgers, 0);
});

test("acceptance P0-2a: ledger เดิมผูกคนละ user → reject ไม่หัก · job ไม่ใช่ paid → not_paid", async () => {
  const led = fakeLedger({ "job-1": PAID_JOB });
  led.registerUser("au-1", 5);
  led.rows.set("job-1", { appUserId: "au-OTHER", status: "pending", attempts: 0 });
  const { deps } = postDeliveryDeps(PAID_JOB, led);
  await handleScanResultPostDelivery(MSG, {}, deps);
  assert.equal(led.state.decrements, 0, "user_mismatch ต้องไม่หัก");
  assert.equal(led.rows.get("job-1").appUserId, "au-OTHER", "ledger เดิมห้ามถูกทับ");
  const r = await led.ensureQuotaPending("job-1");
  assert.equal(r.ok, false);
  assert.equal(r.reason, "user_mismatch");
  const led2 = fakeLedger({ "job-2": { ...PAID_JOB, id: "job-2", access_source: "free" } });
  assert.equal((await led2.ensureQuotaPending("job-2")).reason, "not_paid");
});

test("acceptance P0-2b: app_user หาย (UPDATE โดน 0 แถว) → ห้าม completed — ledger คง pending", async () => {
  const led = fakeLedger({ "job-1": PAID_JOB });
  // ไม่ register user → zero-row
  const { deps } = postDeliveryDeps(PAID_JOB, led);
  await handleScanResultPostDelivery(MSG, {}, deps);
  const row = led.rows.get("job-1");
  assert.equal(row.status, "pending", "zero-row = rollback ห้ามสำเร็จปลอม");
  assert.equal(led.state.decrements, 0);
  assert.ok(row.attempts >= 1, "markError ต้องบันทึก");
});

test("acceptance P0-2c: concurrent claim → หักครั้งเดียว (FOR UPDATE semantics)", async () => {
  const led = fakeLedger({ "job-1": PAID_JOB });
  led.registerUser("au-1", 5);
  await led.ensureQuotaPending("job-1");
  const [a, b] = await Promise.all([led.runQuotaDecrement("job-1"), led.runQuotaDecrement("job-1")]);
  const outcomes = [a.outcome, b.outcome].sort();
  assert.deepEqual(outcomes, ["already_completed", "completed"]);
  assert.equal(led.state.decrements, 1);
});

test("acceptance 2+6 เดิม: retry/duplicate ทุกทาง → หักรวมหนึ่งครั้ง", async () => {
  const led = fakeLedger({ "job-1": PAID_JOB });
  led.registerUser("au-1", 5);
  const { deps } = postDeliveryDeps(PAID_JOB, led);
  await handleScanResultPostDelivery(MSG, {}, deps);
  await handleScanResultPostDelivery(MSG, {}, deps);
  assert.equal((await led.runQuotaDecrement("job-1")).outcome, "already_completed");
  assert.equal(led.state.decrements, 1);
});

test("acceptance 3 เดิม + P1: DB error → pending+attempts · durablePending log ตามผล markError จริง", async () => {
  const led = fakeLedger({ "job-1": PAID_JOB });
  led.registerUser("au-1", 5);
  led.state.failRpc = true;
  const { deps } = postDeliveryDeps(PAID_JOB, led);
  const errLogs = [];
  const orig = console.error;
  console.error = (l) => errLogs.push(String(l));
  try { await handleScanResultPostDelivery(MSG, {}, deps); } finally { console.error = orig; }
  const row = led.rows.get("job-1");
  assert.equal(row.status, "pending");
  assert.equal(row.attempts, 1);
  const failLog = errLogs.map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .find((o) => o && o.event === "QUOTA_DECREMENT_AFTER_DELIVERY_FAILED");
  assert.ok(failLog);
  assert.equal(failLog.durablePending, true, "markError ok+affected → durablePending true ได้");
  // markError ล้ม → ห้ามอ้าง durablePending
  const led2 = fakeLedger({ "job-1": PAID_JOB });
  led2.registerUser("au-1", 5);
  led2.state.failRpc = true;
  const { deps: deps2 } = postDeliveryDeps(PAID_JOB, led2);
  deps2.markQuotaDecrementError = async () => ({ ok: false, reason: "db down" });
  const errLogs2 = [];
  console.error = (l) => errLogs2.push(String(l));
  try { await handleScanResultPostDelivery(MSG, {}, deps2); } finally { console.error = orig; }
  const failLog2 = errLogs2.map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .find((o) => o && o.event === "QUOTA_DECREMENT_AFTER_DELIVERY_FAILED");
  assert.equal(failLog2.durablePending, false, "markError ล้ม = ห้าม log durablePending:true");
});

test("acceptance 5 เดิม: alert stuck ส่งล้ม → dedupe ถูกปล่อย retry ได้", async () => {
  const led = fakeLedger({});
  led.rows.set("job-9", { appUserId: "au-1", status: "pending", attempts: 9, lastError: "x" });
  led.state.failRpc = true;
  const { sweepPendingQuotaDecrements } = await import("../src/services/scanV2/quotaLedger.util.js");
  const alerts = [];
  let alertOk = false;
  const dedupe = { held: new Set() };
  const deps = {
    dbClient: sweepClientOf(led),
    reconcileMissing: async () => ({ ok: true, created: 0 }),
    runDecrement: led.runQuotaDecrement,
    markError: led.markQuotaDecrementError,
    alert: async (t) => { alerts.push(t); return { ok: alertOk }; },
    alertDedupe: async (k) => { if (dedupe.held.has(k)) return false; dedupe.held.add(k); return true; },
    clearDedupe: async (k) => { dedupe.held.delete(k); },
  };
  const s1 = await sweepPendingQuotaDecrements(deps);
  assert.equal(s1.alerted, 0);
  alertOk = true;
  await sweepPendingQuotaDecrements(deps);
  assert.equal(alerts.length, 2);
});

test("ledger ไม่แตะงานฟรี/duplicate-skip + terminal ไม่ถูกทับ", async () => {
  const led = fakeLedger({ "job-1": { ...PAID_JOB, access_source: "free" } });
  const free = postDeliveryDeps({ ...PAID_JOB, access_source: "free" }, led);
  await handleScanResultPostDelivery(MSG, {}, free.deps);
  assert.equal(led.rows.size, 0);
  const led2 = fakeLedger({ "job-1": PAID_JOB });
  const dup = postDeliveryDeps(PAID_JOB, led2);
  await handleScanResultPostDelivery(MSG, { skipQuotaDecrement: true }, dup.deps);
  assert.equal(led2.rows.size, 0, "duplicate redelivery ห้ามจอง ledger");
  for (const st of ["failed", "cancelled", "suppressed_banned"]) {
    const led3 = fakeLedger({ "job-1": { ...PAID_JOB, status: st } });
    const t = postDeliveryDeps({ ...PAID_JOB, status: st }, led3);
    await handleScanResultPostDelivery(MSG, {}, t.deps);
    assert.equal(t.state.job.status, st);
    assert.equal(led3.rows.size, 0);
  }
});

test("source contract 055: authority/integrity ครบ (SECURITY DEFINER · REVOKE · derive จาก DB · ROW_COUNT · epoch)", () => {
  const sql = fs.readFileSync(path.join(process.cwd(), "sql", "055_scan_quota_ledger.sql"), "utf8");
  // authority
  assert.ok(!sql.includes("p_app_user_id"), "RPC ห้ามรับ app_user_id จาก caller — derive จาก scan_jobs");
  assert.ok(sql.includes("REFERENCES scan_jobs (id)") && sql.includes("REFERENCES app_users (id)"), "ต้องมี FK");
  assert.ok(/REVOKE ALL PRIVILEGES ON scan_quota_decrements FROM web_anon/.test(sql), "ห้าม web_anon เขียนตรง");
  assert.ok((sql.match(/SECURITY DEFINER/g) || []).length >= 4, "ทุก RPC ต้องเป็น SECURITY DEFINER");
  assert.ok((sql.match(/REVOKE EXECUTE ON FUNCTION[\s\S]*?FROM PUBLIC/g) || []).length >= 1, "REVOKE EXECUTE FROM PUBLIC");
  assert.ok(sql.includes("user_mismatch"), "ledger คนละ user ต้อง reject");
  // integrity
  assert.ok(sql.includes("GET DIAGNOSTICS affected = ROW_COUNT") && sql.includes("RAISE EXCEPTION 'app_user_update_affected_%'"), "zero-row ต้อง rollback ห้าม completed");
  // durable reconstruction + กันหักย้อนหลัง
  assert.ok(sql.includes("reconcile_missing_quota_ledgers"), "ต้องมี reconstruction RPC");
  assert.ok(sql.includes("quota_ledger_epoch") && sql.includes("j.created_at >= epoch"), "epoch guard กันหักย้อนหลัง write-off");
  assert.ok(sql.includes("skipQuotaDecrement"), "duplicate redelivery ห้ามถูก reconstruct");
  assert.ok(sql.includes("ON CONFLICT (key) DO NOTHING"), "apply ซ้ำ epoch ห้ามเลื่อน");
  // smoke ในไฟล์
  assert.ok(sql.includes("ยังมีสิทธิ์เขียนตรง"), "ต้องมี DO-block ตรวจ grants");
  // worker เป็นเจ้าของ recovery
  const worker = fs.readFileSync(path.join(process.cwd(), "src", "workers", "maintenanceWorker.js"), "utf8");
  assert.ok(worker.includes("sweepPendingQuotaDecrements"));
});

test("source contract: postDelivery — claim ก่อน delivered + อยู่ใต้ delivery.sent เท่านั้น", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src", "services", "scanV2", "deliverOutbound.service.js"), "utf8");
  const sentIdx = src.indexOf("if (delivery.sent) {");
  const postIdx = src.indexOf("await handleScanResultPostDelivery(msg, payload);");
  assert.ok(sentIdx > 0 && postIdx > sentIdx);
  assert.ok(src.includes("relatedJobId: msg.related_job_id"));
  const fnBody = src.slice(src.indexOf("export async function handleScanResultPostDelivery"));
  assert.ok(fnBody.indexOf("ensureQuotaPending") < fnBody.indexOf('status: "delivered"'), "claim ต้องมาก่อน mark delivered");
  assert.ok(fnBody.includes("await ensurePending(jobId);"), "ส่งได้แค่ jobId — authority อยู่ที่ DB");
});
