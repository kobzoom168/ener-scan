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

/* ---------------- quota ledger (Codex B2 — runtime, DI) ---------------- */

/** จำลอง semantics ของ migration 055: unique ต่อ job + RPC atomic (decrement+complete ก้อนเดียว) */
function fakeLedger() {
  const rows = new Map();
  const state = { decrements: 0, failRpc: false, failEnsure: false };
  return {
    rows,
    state,
    ensureQuotaPending: async (jobId, appUserId) => {
      if (state.failEnsure) return { ok: false, reason: "db down" };
      if (!rows.has(jobId)) rows.set(jobId, { appUserId, status: "pending", attempts: 0, lastError: null });
      return { ok: true, status: rows.get(jobId).status };
    },
    runQuotaDecrement: async (jobId) => {
      const r = rows.get(jobId);
      if (!r) return { ok: false, outcome: "no_ledger" };
      if (r.status === "completed") return { ok: true, outcome: "already_completed" };
      if (state.failRpc) return { ok: false, reason: "rpc db error" };
      // atomic เหมือน RPC จริง: หัก + complete ใน "จังหวะเดียว" crash กลางไม่ได้
      state.decrements += 1;
      r.status = "completed";
      r.attempts += 1;
      return { ok: true, outcome: "completed" };
    },
    markQuotaDecrementError: async (jobId, m) => {
      const r = rows.get(jobId);
      if (r && r.status === "pending") { r.attempts += 1; r.lastError = m; }
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

test("forward path: re-enqueue คง related_job_id เดิม (runtime DI)", async () => {
  const inserted = [];
  await reEnqueueHeldReport("Uaaa", { outboundPayload: { text: "x" }, relatedJobId: "job-1" }, {
    insertOutboundMessage: async (row) => { inserted.push(row); return { id: "ob-2" }; },
  });
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].related_job_id, "job-1");
});

test("ledger: ปกติ — pending ถูกจอง 'ก่อน' delivered แล้วหักครั้งเดียว completed", async () => {
  const led = fakeLedger();
  const { state, deps } = postDeliveryDeps(PAID_JOB, led);
  await handleScanResultPostDelivery(MSG, {}, deps);
  assert.equal(state.job.status, "delivered");
  assert.equal(led.state.decrements, 1);
  assert.equal(led.rows.get("job-1").status, "completed");
});

test("acceptance 1: crash หลัง delivered ก่อน decrement → pending คงใน ledger แล้ว sweeper หักภายหลัง", async () => {
  const led = fakeLedger();
  led.state.failRpc = true; // จำลอง process ตาย/RPC ไม่ทันได้ทำ
  const { state, deps } = postDeliveryDeps(PAID_JOB, led);
  await handleScanResultPostDelivery(MSG, {}, deps);
  assert.equal(state.job.status, "delivered");
  assert.equal(led.state.decrements, 0);
  assert.equal(led.rows.get("job-1").status, "pending", "pending ต้องอยู่รอด — ไม่หายเงียบ");
  // sweeper ตามต่อ (redis/db กลับมา)
  led.state.failRpc = false;
  const { sweepPendingQuotaDecrements } = await import("../src/services/scanV2/quotaLedger.util.js");
  const fakeClient = {
    from: () => ({ select: () => ({ eq: () => ({ lt: () => ({ order: () => ({ limit: async () => ({
      data: [...led.rows.entries()].filter(([, r]) => r.status === "pending").map(([job_id, r]) => ({ job_id, app_user_id: r.appUserId, attempts: r.attempts, created_at: new Date(0).toISOString() })),
      error: null,
    }) }) }) }) }) }),
  };
  const stats = await sweepPendingQuotaDecrements({ dbClient: fakeClient, runDecrement: led.runQuotaDecrement, markError: led.markQuotaDecrementError, alert: async () => ({ ok: true }), alertDedupe: async () => true });
  assert.equal(stats.completed, 1);
  assert.equal(led.state.decrements, 1, "sweeper หักให้ครบ — ครั้งเดียว");
});

test("acceptance 2+6: retry/duplicate ทุกทาง → decrement รวมหนึ่งครั้ง (RPC idempotent + delivered guard)", async () => {
  const led = fakeLedger();
  const { deps } = postDeliveryDeps(PAID_JOB, led);
  await handleScanResultPostDelivery(MSG, {}, deps);
  await handleScanResultPostDelivery(MSG, {}, deps); // duplicate finalizer — delivered guard
  const again = await led.runQuotaDecrement("job-1"); // จำลอง retry หลัง decrement สำเร็จ (crash ก่อน caller รู้ผล)
  assert.equal(again.outcome, "already_completed");
  assert.equal(led.state.decrements, 1, "หักรวมหนึ่งครั้งเท่านั้น");
});

test("acceptance 3: decrement DB error → pending + attempts/last_error คงอยู่ retry ได้", async () => {
  const led = fakeLedger();
  led.state.failRpc = true;
  const { deps } = postDeliveryDeps(PAID_JOB, led);
  await handleScanResultPostDelivery(MSG, {}, deps);
  const row = led.rows.get("job-1");
  assert.equal(row.status, "pending");
  assert.equal(row.attempts, 1, "markError ต้องบันทึกรอบที่ล้ม");
  assert.ok(row.lastError);
  led.state.failRpc = false;
  const r = await led.runQuotaDecrement("job-1");
  assert.equal(r.outcome, "completed");
});

test("acceptance 4: ledger เขียนไม่เข้า → ห้าม claim durable owner — alert awaited + log ตามจริง + ไม่พยายามหัก", async () => {
  const led = fakeLedger();
  led.state.failEnsure = true;
  const { state, deps } = postDeliveryDeps(PAID_JOB, led);
  const logs = [];
  const orig = console.log;
  console.log = (l) => logs.push(String(l));
  try {
    await handleScanResultPostDelivery(MSG, {}, deps);
  } finally { console.log = orig; }
  assert.equal(state.job.status, "delivered", "ลูกค้าได้ผลแล้ว status ต้องตามจริง");
  assert.equal(led.state.decrements, 0);
  assert.equal(state.alerts.length, 1, "alert ต้องถูก await ก่อนจบ (ไม่ใช่ fire-and-forget)");
  assert.ok(state.alerts[0].includes("ไม่มี durable owner"), "copy ต้องบอกตามจริง ไม่อ้างว่าบันทึกแล้ว");
  const honest = logs.map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .find((o) => o && o.event === "QUOTA_LEDGER_CLAIM_FAILED_ALERT");
  assert.ok(honest && honest.alertDelivered === true, "ผลส่ง alert ต้องถูก log ตามจริง");
});

test("acceptance 5: alert stuck ส่งล้ม → dedupe ถูกปล่อย รอบถัดไป retry alert ได้", async () => {
  const led = fakeLedger();
  led.rows.set("job-9", { appUserId: "au-1", status: "pending", attempts: 9, lastError: "x" });
  led.state.failRpc = true;
  const { sweepPendingQuotaDecrements } = await import("../src/services/scanV2/quotaLedger.util.js");
  const fakeClient = {
    from: () => ({ select: () => ({ eq: () => ({ lt: () => ({ order: () => ({ limit: async () => ({
      data: [{ job_id: "job-9", app_user_id: "au-1", attempts: 9, created_at: new Date(0).toISOString() }], error: null,
    }) }) }) }) }) }),
  };
  const alerts = [];
  let alertOk = false;
  const dedupe = { held: new Set() };
  const deps = {
    dbClient: fakeClient,
    runDecrement: led.runQuotaDecrement,
    markError: led.markQuotaDecrementError,
    alert: async (t) => { alerts.push(t); return { ok: alertOk }; },
    alertDedupe: async (k) => { if (dedupe.held.has(k)) return false; dedupe.held.add(k); return true; },
    clearDedupe: async (k) => { dedupe.held.delete(k); },
  };
  const s1 = await sweepPendingQuotaDecrements(deps);
  assert.equal(alerts.length, 1);
  assert.equal(s1.alerted, 0, "ส่งล้มห้ามนับว่าแจ้งแล้ว");
  alertOk = true;
  await sweepPendingQuotaDecrements(deps);
  assert.equal(alerts.length, 2, "dedupe ถูกปล่อย → retry alert ได้จริง");
});

test("ledger ไม่แตะงานฟรี/duplicate-skip + terminal ไม่ถูกทับ", async () => {
  const led = fakeLedger();
  const free = postDeliveryDeps({ ...PAID_JOB, access_source: "free" }, led);
  await handleScanResultPostDelivery(MSG, {}, free.deps);
  assert.equal(led.rows.size, 0, "งานฟรีห้ามมี ledger");
  const led2 = fakeLedger();
  const dup = postDeliveryDeps(PAID_JOB, led2);
  await handleScanResultPostDelivery(MSG, { skipQuotaDecrement: true }, dup.deps);
  assert.equal(led2.rows.size, 0, "redelivered duplicate ห้ามจอง ledger/หัก quota");
  for (const st of ["failed", "cancelled", "suppressed_banned"]) {
    const led3 = fakeLedger();
    const t = postDeliveryDeps({ ...PAID_JOB, status: st }, led3);
    await handleScanResultPostDelivery(MSG, {}, t.deps);
    assert.equal(t.state.job.status, st);
    assert.equal(led3.rows.size, 0);
  }
});

test("source contract: RPC atomic (decrement+complete ฟังก์ชันเดียว) + claim ก่อน delivered + sweeper อยู่ใน worker", () => {
  const sql = fs.readFileSync(path.join(process.cwd(), "sql", "055_scan_quota_ledger.sql"), "utf8");
  const fn = sql.slice(sql.indexOf("claim_paid_scan_decrement"), sql.indexOf("mark_quota_decrement_error"));
  assert.ok(fn.includes("FOR UPDATE"), "กันแข่งด้วย row lock");
  assert.ok(fn.includes("already_completed"), "idempotent ต่อ job");
  assert.ok(fn.indexOf("paid_remaining_scans") < fn.indexOf("SET status = 'completed'"), "decrement+complete ใน tx เดียว");
  assert.ok(sql.includes("job_id uuid PRIMARY KEY"), "unique ต่อ job");
  const src = fs.readFileSync(path.join(process.cwd(), "src", "services", "scanV2", "deliverOutbound.service.js"), "utf8");
  const claimIdx = src.indexOf("ensureQuotaPending");
  const deliveredIdx = src.indexOf('status: "delivered",\n    updated_at', src.indexOf("handleScanResultPostDelivery"));
  assert.ok(claimIdx > 0, "ต้องจอง ledger");
  const worker = fs.readFileSync(path.join(process.cwd(), "src", "workers", "maintenanceWorker.js"), "utf8");
  assert.ok(worker.includes("sweepPendingQuotaDecrements"), "maintenance sweeper ต้องเป็นเจ้าของ retry");
});

test("source contract: postDelivery อยู่ใต้ delivery.sent เท่านั้น + hold call ส่ง relatedJobId", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src", "services", "scanV2", "deliverOutbound.service.js"), "utf8");
  const sentIdx = src.indexOf("if (delivery.sent) {");
  const postIdx = src.indexOf("await handleScanResultPostDelivery(msg, payload);");
  assert.ok(sentIdx > 0 && postIdx > sentIdx);
  assert.ok(src.includes("relatedJobId: msg.related_job_id"));
  // ลำดับใน postDelivery: จอง ledger ก่อน mark delivered
  const fnBody = src.slice(src.indexOf("export async function handleScanResultPostDelivery"));
  assert.ok(fnBody.indexOf("ensureQuotaPending") < fnBody.indexOf('status: "delivered"'), "claim ต้องมาก่อน mark delivered");
});
