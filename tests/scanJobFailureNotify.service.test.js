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
    "some_future_new_reason", // เหตุผลใหม่ default = ไม่ส่ง + log NO_OWNER
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


test("owner ครบทุก failJob code (Codex รอบ 3): scan source แล้วทุก code ต้องมีเจ้าของ", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const {
    GENERIC_NOTIFY_REASONS,
    TAILORED_BY_FLOW_REASONS,
    RECOVERY_TEXTS,
  } = await import("../src/services/scanV2/scanJobFailureNotify.service.js");
  const src = fs.readFileSync(
    path.join(process.cwd(), "src", "services", "scanV2", "processScanJob.service.js"),
    "utf8",
  );
  const codes = new Set();
  const re = /failJob\(\s*[\w.]+,\s*\n?\s*"([a-z0-9_]+)"/g;
  let m;
  while ((m = re.exec(src))) codes.add(m[1]);
  assert.ok(codes.size >= 15, `เจอ failJob codes น้อยผิดปกติ (${codes.size}) — regex อาจพัง`);
  for (const code of codes) {
    const owned =
      GENERIC_NOTIFY_REASONS.has(code) ||
      TAILORED_BY_FLOW_REASONS.has(code) ||
      Boolean(RECOVERY_TEXTS[code]);
    assert.ok(owned, `failJob code "${code}" ไม่มีเจ้าของ notification — จัดเข้ากลุ่มใน scanJobFailureNotify.service.js`);
  }
});

test("recovery: birthdate_missing ได้ข้อความเฉพาะทาง 1 ข้อความ (ไม่ใช่ generic ส่งรูปใหม่)", async () => {
  let lastRow = null;
  let calls = 0;
  await notifyUserScanJobFailed(
    { lineUserId: "U1", jobId: "j1", reason: "birthdate_missing" },
    { insertOutboundMessage: async (row) => { calls += 1; lastRow = row; } },
  );
  assert.equal(calls, 1);
  const txt = String(lastRow?.payload_json?.text || "");
  assert.match(txt, /วันเกิด/);
  assert.doesNotMatch(txt, /รบกวนส่งใหม่อีกครั้ง/);
  // Codex รอบ 4: CTA ต้องตรง route ที่รับข้อมูลจริง — "เปลี่ยนวันเกิด" (birthdateChangeFlow)
  // หรือเมนู เปิดแอป Ener · ห้ามบอก "พิมพ์วันเกิด" เปล่า ๆ (ระบบไม่รับนอก waiting_birthdate)
  assert.match(txt, /เปลี่ยนวันเกิด/);
  assert.match(txt, /เปิดแอป Ener/);
  assert.doesNotMatch(txt, /พิมพ์วันเกิดมา/);
});

test("scan_results_v2_insert_failed อยู่ใน generic allowlist (Codex รอบ 3: เดิมตกหล่น)", async () => {
  let calls = 0;
  await notifyUserScanJobFailed(
    { lineUserId: "U1", jobId: "j1", reason: "scan_results_v2_insert_failed" },
    { insertOutboundMessage: async () => { calls += 1; } },
  );
  assert.equal(calls, 1);
});
