/**
 * Codex รอบ 3 (ban-during-retry): beforeAttempt hook เช็คก่อนทุก transport attempt
 * — attempt แรก 429 → โดนแบนระหว่าง backoff → attempt สองห้ามแตะ transport
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { sendScanResultPushWith429Retry } from "../src/utils/linePush429Retry.util.js";

function err429() {
  const e = new Error("rate limited");
  e.statusCode = 429;
  return e;
}

test("attempt1 429 → แบนระหว่าง backoff → attempt2 ไม่แตะ transport + typed suppressedBanned", async () => {
  let transportCalls = 0;
  let banned = false;
  const client = {
    pushMessage: async () => {
      transportCalls += 1;
      banned = true; // จำลอง: โดนแบนหลัง attempt แรกล้มด้วย 429
      throw err429();
    },
  };
  const r = await sendScanResultPushWith429Retry({
    client,
    userId: "U" + "a".repeat(32),
    text: "รายงานผล",
    beforeAttempt: async () => (banned ? { proceed: false, suppressedBanned: true } : { proceed: true }),
    backoffsMs: [30, 30],
  });
  assert.equal(transportCalls, 1, "transport หลังแบนต้องเป็น 0 (มีแค่ attempt แรกก่อนแบน)");
  assert.equal(r.sent, false);
  assert.equal(r.suppressedBanned, true);
  assert.equal(r.finalMessage, "suppressed_before_attempt");
});

test("แบนตั้งแต่ก่อน attempt แรก → transport = 0", async () => {
  let transportCalls = 0;
  const client = { pushMessage: async () => { transportCalls += 1; } };
  const r = await sendScanResultPushWith429Retry({
    client,
    userId: "U" + "b".repeat(32),
    text: "x",
    beforeAttempt: async () => ({ proceed: false, suppressedBanned: true }),
    backoffsMs: [10, 10],
  });
  assert.equal(transportCalls, 0);
  assert.equal(r.suppressedBanned, true);
});

test("flex โดน suppress → ไม่ fallback ไป text (ห้ามหลุดช่องหลัง)", async () => {
  let transportCalls = 0;
  let checks = 0;
  const client = { pushMessage: async () => { transportCalls += 1; } };
  const r = await sendScanResultPushWith429Retry({
    client,
    userId: "U" + "c".repeat(32),
    flexMessage: { type: "flex", altText: "x", contents: {} },
    text: "fallback text",
    beforeAttempt: async () => { checks += 1; return { proceed: false, suppressedBanned: true }; },
    backoffsMs: [10, 10],
  });
  assert.equal(transportCalls, 0);
  assert.equal(r.suppressedBanned, true);
  assert.equal(checks, 1, "หยุดที่ flex attempt แรก ไม่วน text ต่อ");
});

test("hook พัง → fail-open ส่งตามปกติ · ไม่แบน → ส่งสำเร็จ", async () => {
  let transportCalls = 0;
  const client = { pushMessage: async () => { transportCalls += 1; } };
  const r1 = await sendScanResultPushWith429Retry({
    client, userId: "U" + "d".repeat(32), text: "x",
    beforeAttempt: async () => { throw new Error("check down"); },
    backoffsMs: [10, 10],
  });
  assert.equal(r1.sent, true);
  const r2 = await sendScanResultPushWith429Retry({
    client, userId: "U" + "d".repeat(32), text: "x",
    beforeAttempt: async () => ({ proceed: true }),
    backoffsMs: [10, 10],
  });
  assert.equal(r2.sent, true);
  assert.equal(transportCalls, 2);
});

test("deliverOutbound: ผูก beforeAttempt + จัดการ suppressedBanned ระหว่าง retry (source contract)", () => {
  const s = fs.readFileSync("src/services/scanV2/deliverOutbound.service.js", "utf8");
  assert.ok(s.includes("banRecheckBeforeAttempt"), "ต้องมี recheck hook");
  const hookHits = [...s.matchAll(/beforeAttempt: banRecheckBeforeAttempt/g)].length;
  assert.equal(hookHits, 2, "ทั้ง delivery หลักและ no-voice retry ต้องผ่าน hook");
  assert.ok(s.includes('stage: "during_retry"'), "ต้อง terminalize เมื่อโดนแบนกลาง retry");
  assert.ok(s.includes("!delivery.suppressedBanned && audioMessage"), "no-voice retry ต้องไม่วิ่งเมื่อ suppressed");
});
