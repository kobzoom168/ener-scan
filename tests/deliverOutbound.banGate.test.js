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

/* ---------------- Codex 18d5d3a: nested object-info ban race (P0-2) ---------------- */

test("nested race: top gate ไม่แบน แต่โดนแบนระหว่าง hold → suppress เต็มชุด ไม่ markSent", async () => {
  const { calls, deps, client } = makeDeps({ banned: false }); // top gate ปล่อยผ่าน
  const r = await deliverOutboundMessage(
    client,
    { id: 90, line_user_id: "U" + "c".repeat(32), kind: "scan_result", related_job_id: 777, payload_json: { reportPayload: { x: 1 } } },
    {
      banGateDeps: deps,
      // nested customerPush เจอแบน → hold คืน typed outcome
      objectInfoHold: async () => ({ outcome: "suppressed_banned" }),
    },
  );
  assert.equal(r.sent, false);
  assert.equal(r.suppressedBanned, true);
  assert.equal(r.errorCode, "suppressed_banned");
  assert.equal(calls.push, 0, "transport ต้องเป็น 0");
  assert.equal(calls.update.length, 1, "outbound ต้องถูก mark suppressed_banned ไม่ใช่ sent");
  assert.equal(calls.update[0].patch.status, "suppressed_banned");
  assert.equal(calls.update[0].patch.next_retry_at, null);
  assert.equal(calls.failJob.length, 1, "job ที่เกี่ยวต้อง terminal");
  assert.equal(calls.failJob[0][0], 777);
  assert.deepEqual(calls.releaseGate, ["U" + "c".repeat(32)], "scan gate ต้องถูกปล่อย");
});

test("nested hold: outcome held → typed status held_object_info + sent:false (ไม่ retry ไม่ finalize) · not_held → ไหลไปส่งรายงาน (ไม่ suppress)", async () => {
  // held: จบด้วย sent:true โดยไม่มี suppression side effect
  const held = makeDeps({ banned: false });
  const marked = [];
  held.deps.markSent = async (id) => { marked.push(id); };
  const r1 = await deliverOutboundMessage(
    held.client,
    { id: 91, line_user_id: "U" + "d".repeat(32), kind: "scan_result", payload_json: { reportPayload: { x: 1 } } },
    { banGateDeps: held.deps, objectInfoHold: async () => ({ outcome: "held" }) },
  );
  assert.equal(r1.sent, false, "held ห้ามอ้างว่าส่งแล้ว (transport=0)");
  assert.equal(r1.held, true);
  assert.deepEqual(marked, [], "held ห้าม markSent");
  assert.equal(held.calls.update.length, 1, "held ต้อง update เป็น typed status 1 ครั้ง");
  assert.equal(held.calls.update[0].patch.status, "held_object_info");
  assert.equal(held.calls.failJob.length, 0);
});

test("typed outcome contract: maybeHoldReportForObjectInfo ห้ามคืน boolean/object เปล่า (source contract)", () => {
  const s = fs.readFileSync("src/services/objectInfoGate/objectInfoGate.service.js", "utf8");
  const fn = s.slice(s.indexOf("export async function maybeHoldReportForObjectInfo"), s.indexOf("\nexport ", s.indexOf("export async function maybeHoldReportForObjectInfo") + 10));
  assert.ok(!/return (true|false);/.test(fn), "ทุก return ต้องเป็น typed outcome");
  assert.ok(fn.includes('{ outcome: "suppressed_banned" }'));
  assert.ok(fn.includes('{ outcome: "held" }'));
  // banned branch ต้องล้าง state ที่สร้างก่อน push (form/pending/backup)
  const bannedIdx = fn.indexOf('OBJECT_INFO_GATE_SUPPRESSED_BANNED');
  assert.ok(bannedIdx > 0);
  const bannedBlock = fn.slice(fn.indexOf("suppressedBanned"), bannedIdx);
  for (const key of ["objinfo:form:", "pendingKey(", "backupKey("]) {
    assert.ok(bannedBlock.includes(key), `banned branch ต้องล้าง ${key}`);
  }
});

/* ---------------- Codex 18d5d3a: scan-worker early suppression (P0-3) ---------------- */

test("terminalizeSuppressedBannedJob: failJob + ปล่อย scan gate เสมอ (แม้ failJob ล้ม)", async () => {
  const { terminalizeSuppressedBannedJob } = await import("../src/services/scanV2/processScanJob.service.js");
  const uid = "U" + "1".repeat(32);
  {
    const failed = []; const clearedKeys = [];
    await terminalizeSuppressedBannedJob({ jobId: "job-1", lineUserId: uid, workerId: "w1" }, {
      failJob: async (...a) => { failed.push(a); },
      clearDedupeKey: async (k) => { clearedKeys.push(k); },
      scanInFlightKeyForUser: (u) => `scan_v2:inflight:${u}`,
    });
    assert.equal(failed.length, 1);
    assert.equal(failed[0][1], "suppressed_banned");
    assert.deepEqual(clearedKeys, [`scan_v2:inflight:${uid}`], "gate ต้องถูกปล่อย");
  }
  {
    // failJob ล้ม → gate ยังต้องถูกปล่อย (เคส pre-scan ack ส่งแล้ว ไม่มี outbound มาช่วย)
    const clearedKeys = [];
    await terminalizeSuppressedBannedJob({ jobId: "job-2", lineUserId: uid, workerId: "w1" }, {
      failJob: async () => { throw new Error("db down"); },
      clearDedupeKey: async (k) => { clearedKeys.push(k); },
      scanInFlightKeyForUser: (u) => `scan_v2:inflight:${u}`,
    });
    assert.equal(clearedKeys.length, 1, "failJob ล้มก็ต้องปล่อย gate");
  }
});

/* ---------------- Codex รอบ 4: transport boundary — flip-ban กลางคัน ---------------- */

import { wrapClientWithBanGuard } from "../src/services/scanV2/deliverOutbound.service.js";

function flipBanDeps(banAtCallN) {
  // isBanned ลำดับ: call ที่ >= banAtCallN คืน true (จำลองโดนแบนกลางงาน)
  let n = 0;
  const calls = { update: [], failJob: [], releaseGate: [], push: 0 };
  const deps = {
    isBanned: async () => { n += 1; return n >= banAtCallN; },
    updateOutboundMessage: async (id, patch) => { calls.update.push({ id, patch }); },
    failJob: async (...a) => { calls.failJob.push(a); },
    releaseScanGate: (uid) => { calls.releaseGate.push(uid); },
  };
  return { calls, deps };
}

test("payment_qr: แบนหลังส่งรูป QR → ข้อความไม่ออก + typed terminal (Codex repro)", async () => {
  const { calls, deps } = flipBanDeps(3); // top gate(1)=ok, image(2)=ok, text(3)=banned
  const client = { pushMessage: async () => { calls.push += 1; } };
  const r = await deliverOutboundMessage(
    client,
    { id: 101, line_user_id: "U" + "1".repeat(32), kind: "payment_qr", payload_json: { imageUrl: "https://x/qr.png", text: "โอนแล้วแจ้งสลิป" } },
    { banGateDeps: deps },
  );
  assert.equal(calls.push, 1, "รูปออกก่อนแบน แต่ข้อความหลังแบนต้องไม่ออก");
  assert.equal(r.sent, false);
  assert.equal(r.suppressedBanned, true);
  assert.equal(calls.update.length, 1);
  assert.equal(calls.update[0].patch.status, "suppressed_banned");
});

test("pre_scan_ack: แบนหลัง top gate ก่อนส่ง → transport=0 + suppressed", async () => {
  const { calls, deps } = flipBanDeps(2); // top gate(1)=ok, send(2)=banned
  const client = { pushMessage: async () => { calls.push += 1; } };
  const r = await deliverOutboundMessage(
    client,
    { id: 102, line_user_id: "U" + "2".repeat(32), kind: "pre_scan_ack", payload_json: { text: "รับรูปแล้ว" } },
    { banGateDeps: deps },
  );
  assert.equal(calls.push, 0, "transport หลังแบนต้องเป็น 0");
  assert.equal(r.suppressedBanned, true);
  assert.equal(calls.update[0].patch.status, "suppressed_banned");
});

test("generic text (reminder/notice ทุก kind ที่เหลือ): แบนก่อนส่ง → suppressed", async () => {
  const { calls, deps } = flipBanDeps(2);
  const client = { pushMessage: async () => { calls.push += 1; } };
  const r = await deliverOutboundMessage(
    client,
    { id: 103, line_user_id: "U" + "3".repeat(32), kind: "renewal_reminder", payload_json: { text: "ต่ออายุ" } },
    { banGateDeps: deps },
  );
  assert.equal(calls.push, 0);
  assert.equal(r.suppressedBanned, true);
});

test("boundary unit: wrapClientWithBanGuard — pushMessage โดนบล็อกเมื่อแบน, method อื่นผ่าน, เช็คพัง fail-open", async () => {
  let pushes = 0; let replies = 0;
  const raw = { pushMessage: async () => { pushes += 1; }, replyMessage: async () => { replies += 1; } };
  const banned = wrapClientWithBanGuard(raw, "U" + "4".repeat(32), { isBanned: async () => true });
  await assert.rejects(() => banned.pushMessage("U", { type: "text", text: "x" }), (e) => e.suppressedBanned === true);
  assert.equal(pushes, 0);
  await banned.replyMessage("rt", {}); // reply token path ไม่โดน gate นี้ (in-turn ผ่าน pre-dispatch แล้ว)
  assert.equal(replies, 1);
  const ok = wrapClientWithBanGuard(raw, "U" + "4".repeat(32), { isBanned: async () => false });
  await ok.pushMessage("U", {});
  assert.equal(pushes, 1);
  const broken = wrapClientWithBanGuard(raw, "U" + "4".repeat(32), { isBanned: async () => { throw new Error("x"); } });
  await broken.pushMessage("U", {});
  assert.equal(pushes, 2, "เช็คพัง = fail-open ส่งได้");
});

test("terminal-failure fallback + boundary wiring (source contract)", () => {
  const s = fs.readFileSync("src/services/scanV2/deliverOutbound.service.js", "utf8");
  // fallback "รายงานหาย ส่งใหม่" ต้องเช็คแบนก่อน push
  const tf = s.indexOf("async function handleScanResultTerminalFailure");
  const guard = s.indexOf("TERMINAL_FAILURE_FALLBACK_SUPPRESSED_BANNED", tf);
  const push = s.indexOf("await pushText(client, msg.line_user_id, REPORT_LOST_RESEND_TEXT)", tf);
  assert.ok(tf > 0 && guard > tf && push > guard, "terminal fallback ต้อง gate ก่อน push");
  // boundary ครอบ dispatch: wrap client หลัง top gate ก่อน rate-hint sleep
  const wrapIdx = s.indexOf("client = wrapClientWithBanGuard(client, lineUserId");
  const sleepIdx = s.indexOf("await sleepIfRateHint(sleep, lineUserId)");
  assert.ok(wrapIdx > 0 && wrapIdx < sleepIdx, "boundary ต้องครอบก่อน rate-hint sleep (หน่วงได้ถึง 120s)");
  // outer catch แปลง suppressedBanned เป็น typed terminal
  assert.ok(s.includes('stage: "transport_boundary"'));
});
