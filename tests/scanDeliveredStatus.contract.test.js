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

/* ---------------- quota forward path (runtime, DI) ---------------- */

function postDeliveryDeps(jobRow) {
  const state = {
    job: { ...jobRow },
    updates: [],
    decrements: 0,
    markers: [],
    alerts: [],
    failDecrement: false,
  };
  const deps = {
    getScanJobById: async () => ({ ...state.job }),
    updateScanJob: async (_id, patch) => {
      state.updates.push(patch);
      state.job = { ...state.job, ...patch };
    },
    decrementUserPaidRemainingScans: async () => {
      if (state.failDecrement) throw new Error("db down");
      state.decrements += 1;
    },
    saveQuotaDecrementPending: async (v) => { state.markers.push(v); },
    quotaAlert: async (t) => { state.alerts.push(t); return { ok: true }; },
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
  assert.equal(inserted[0].related_job_id, "job-1", "outbound ที่ re-enqueue ต้องผูก job เดิม");
  assert.equal(inserted[0].kind, "scan_result");
});

test("forward path: send success → job delivered + paid quota decrement ครั้งเดียว", async () => {
  const { state, deps } = postDeliveryDeps(PAID_JOB);
  await handleScanResultPostDelivery(MSG, {}, deps);
  assert.equal(state.job.status, "delivered");
  assert.equal(state.decrements, 1);
});

test("forward path: duplicate delivery/finalizer retry → ไม่ decrement ซ้ำ (delivered guard)", async () => {
  const { state, deps } = postDeliveryDeps(PAID_JOB);
  await handleScanResultPostDelivery(MSG, {}, deps);
  await handleScanResultPostDelivery(MSG, {}, deps); // ซ้ำ — job เป็น delivered แล้ว
  assert.equal(state.decrements, 1, "หักครั้งเดียวเท่านั้น");
  assert.equal(state.updates.length, 1, "update delivered ครั้งเดียว");
});

test("forward path: decrement ล้ม → durable marker + alert (delivered guard จะกัน retry — ห้ามหายเงียบ)", async () => {
  const { state, deps } = postDeliveryDeps(PAID_JOB);
  state.failDecrement = true;
  await handleScanResultPostDelivery(MSG, {}, deps);
  await new Promise((r) => setTimeout(r, 10)); // alert เป็น fire-and-forget
  assert.equal(state.job.status, "delivered");
  assert.equal(state.markers.length, 1, "ต้องมี durable marker quota_decrement_pending");
  assert.equal(state.markers[0].jobId, "job-1");
  assert.equal(state.alerts.length, 1, "ต้องมี critical alert");
});

test("forward path: terminal failure (failed/cancelled/suppressed_banned) ไม่ถูกทับ + ไม่หัก quota", async () => {
  for (const st of ["failed", "cancelled", "suppressed_banned"]) {
    const { state, deps } = postDeliveryDeps({ ...PAID_JOB, status: st });
    await handleScanResultPostDelivery(MSG, {}, deps);
    assert.equal(state.job.status, st);
    assert.equal(state.decrements, 0);
  }
});

test("source contract: postDelivery อยู่ใต้ delivery.sent เท่านั้น + hold call ส่ง relatedJobId", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src", "services", "scanV2", "deliverOutbound.service.js"), "utf8");
  const sentIdx = src.indexOf("if (delivery.sent) {");
  const postIdx = src.indexOf("await handleScanResultPostDelivery(msg, payload);");
  assert.ok(sentIdx > 0 && postIdx > sentIdx, "postDelivery ต้องอยู่ใต้ delivery.sent");
  assert.ok(src.includes("relatedJobId: msg.related_job_id"), "hold call ต้องส่ง relatedJobId");
});
