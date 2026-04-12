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
    String(lastRow?.payload_json?.text || "").includes("กรุณาส่งรูปใหม่"),
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
