import { test } from "node:test";
import assert from "node:assert/strict";
import { notifyUserScanJobFailed } from "../src/services/scanV2/scanJobFailureNotify.service.js";

test("notifyUserScanJobFailed: empty lineUserId → no enqueue", async () => {
  let calls = 0;
  await notifyUserScanJobFailed(
    { lineUserId: "", jobId: "j1", reason: "deep_scan_failed" },
    {
      insertOutboundMessage: async () => {
        calls += 1;
      },
    },
  );
  assert.equal(calls, 0);
});

test("notifyUserScanJobFailed: unsupported_lane → no enqueue", async () => {
  let calls = 0;
  await notifyUserScanJobFailed(
    {
      lineUserId: "Udeadbeefcafe",
      jobId: "j1",
      reason: "unsupported_lane",
    },
    {
      insertOutboundMessage: async () => {
        calls += 1;
      },
    },
  );
  assert.equal(calls, 0);
});

test("notifyUserScanJobFailed: object_validation_failed → no enqueue", async () => {
  let calls = 0;
  await notifyUserScanJobFailed(
    {
      lineUserId: "Udeadbeefcafe",
      jobId: "j1",
      reason: "object_validation_failed",
    },
    {
      insertOutboundMessage: async () => {
        calls += 1;
      },
    },
  );
  assert.equal(calls, 0);
});

test("notifyUserScanJobFailed: deep_scan_failed + lineUserId → enqueue once", async () => {
  let calls = 0;
  let lastRow = null;
  await notifyUserScanJobFailed(
    { lineUserId: "Udeadbeefcafe", jobId: "job-uuid-1", reason: "deep_scan_failed" },
    {
      insertOutboundMessage: async (row) => {
        calls += 1;
        lastRow = row;
        return { id: "out-1" };
      },
    },
  );
  assert.equal(calls, 1);
  assert.equal(lastRow?.kind, "scan_failure_notify");
  assert.ok(
    String(lastRow?.payload_json?.text || "").includes("รบกวนส่งใหม่อีกครั้ง"),
  );
});

test("notifyUserScanJobFailed: insert throws → does not throw", async () => {
  await assert.doesNotReject(() =>
    notifyUserScanJobFailed(
      { lineUserId: "Udeadbeefcafe", jobId: "j1", reason: "storage_read_failed" },
      {
        insertOutboundMessage: async () => {
          throw new Error("db down");
        },
      },
    ),
  );
});


test("allowlist (Codex 17 ส.ค.): ทุก tailored reason ต้องไม่ได้ generic ซ้อน — หนึ่งข้อความเดียว", async () => {
  const tailored = [
    "auth_challenge_no_thumb",
    "auth_challenge_failed",
    "auth_challenge_issued",
    "image_authenticity_suspect",
    "forensic_flagged",
    "ritual_object_not_readable",
    "object_validation_failed",
    "supported_lane_unresolved",
    "unsupported_lane",
    "birthdate_missing",
    "some_future_new_reason", // เหตุผลใหม่ default = ไม่ส่ง generic
  ];
  for (const reason of tailored) {
    let calls = 0;
    await notifyUserScanJobFailed(
      { lineUserId: "U1", jobId: "j1", reason },
      { insertOutboundMessage: async () => { calls += 1; } },
    );
    assert.equal(calls, 0, `reason ${reason} ต้องไม่ enqueue generic`);
  }
  // infra reasons ยังได้ generic ตามเดิม
  for (const reason of ["upload_missing", "storage_read_failed", "outbound_enqueue_failed", "result_insert_failed"]) {
    let calls = 0;
    await notifyUserScanJobFailed(
      { lineUserId: "U1", jobId: "j1", reason },
      { insertOutboundMessage: async () => { calls += 1; } },
    );
    assert.equal(calls, 1, `reason ${reason} ต้องได้ generic 1 ครั้ง`);
  }
});
