/**
 * Codex P0-1 behavior: banned → outbound suppressed แบบ typed terminal
 * transport=0 · status=suppressed_banned · job terminal ผ่าน failJob ·
 * scan gate ถูกปล่อย · ไม่แตะ quota (เส้นนี้ไม่ถึง finalize)
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { deliverOutboundMessage } from "../src/services/scanV2/deliverOutbound.service.js";

function makeDeps({ banned }) {
  const calls = { update: [], failJob: [], releaseGate: [], push: 0 };
  const deps = {
    isBanned: async () => banned,
    updateOutboundMessage: async (id, patch) => { calls.update.push({ id, patch }); },
    failJob: async (...a) => { calls.failJob.push(a); },
    releaseScanGate: (uid) => { calls.releaseGate.push(uid); },
  };
  const client = {
    pushMessage: async () => { calls.push += 1; },
    replyMessage: async () => { calls.push += 1; },
  };
  return { calls, deps, client };
}

test("banned → suppressed_banned terminal: transport=0 + status + failJob + gate released", async () => {
  const { calls, deps, client } = makeDeps({ banned: true });
  const r = await deliverOutboundMessage(
    client,
    { id: 77, line_user_id: "U" + "e".repeat(32), kind: "scan_result", related_job_id: 555, payload_json: {} },
    { banGateDeps: deps },
  );
  assert.equal(r.sent, false);
  assert.equal(r.suppressedBanned, true);
  assert.equal(r.errorCode, "suppressed_banned");
  assert.equal(calls.push, 0, "ห้ามแตะ LINE transport");
  assert.equal(calls.update.length, 1);
  assert.equal(calls.update[0].patch.status, "suppressed_banned");
  assert.equal(calls.update[0].patch.next_retry_at, null, "ห้าม schedule retry");
  assert.equal(calls.failJob.length, 1);
  assert.equal(calls.failJob[0][0], 555);
  assert.equal(calls.failJob[0][1], "suppressed_banned");
  assert.deepEqual(calls.releaseGate, ["U" + "e".repeat(32)]);
});

test("banned + ไม่มี related_job_id → ไม่เรียก failJob แต่ suppress ตามปกติ", async () => {
  const { calls, deps, client } = makeDeps({ banned: true });
  const r = await deliverOutboundMessage(
    client,
    { id: 78, line_user_id: "U" + "f".repeat(32), kind: "generic_text", payload_json: { text: "x" } },
    { banGateDeps: deps },
  );
  assert.equal(r.suppressedBanned, true);
  assert.equal(calls.failJob.length, 0);
  assert.equal(calls.push, 0);
});

test("ไม่แบน → ผ่าน gate ไป path ปกติ (ไม่มี suppression side effect)", async () => {
  const { calls, deps, client } = makeDeps({ banned: false });
  // pre_scan_ack payload ว่าง = คืน empty_payload ก่อนแตะ transport — พิสูจน์ว่า gate ปล่อยผ่าน
  const r = await deliverOutboundMessage(
    client,
    { id: 79, line_user_id: "U" + "a".repeat(32), kind: "pre_scan_ack", payload_json: { text: "" } },
    { banGateDeps: deps },
  );
  assert.equal(r.suppressedBanned, undefined);
  assert.equal(r.errorCode, "empty_payload");
  assert.equal(calls.update.length, 0);
  assert.equal(calls.failJob.length, 0);
});

test("เช็คแบน throw → fail-open ผ่าน gate (ไม่ suppress)", async () => {
  const { calls, client } = makeDeps({ banned: false });
  const r = await deliverOutboundMessage(
    client,
    { id: 80, line_user_id: "U" + "b".repeat(32), kind: "pre_scan_ack", payload_json: { text: "" } },
    { banGateDeps: { isBanned: async () => { throw new Error("db down"); } } },
  );
  assert.equal(r.suppressedBanned, undefined);
  assert.equal(r.errorCode, "empty_payload");
  assert.equal(calls.push, 0);
});

test("deliveryWorker: suppressed_banned ข้าม finalizeOutboundAttempt (typed skip — source contract)", () => {
  const s = fs.readFileSync("src/workers/deliveryWorker.js", "utf8");
  assert.ok(
    s.includes("!result.sent && !result.suppressedBanned"),
    "worker ต้องไม่ finalize/retry เมื่อ suppressedBanned",
  );
});
