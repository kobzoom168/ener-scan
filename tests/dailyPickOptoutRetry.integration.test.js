/**
 * Integration: deliver → finalizer → **สถานะที่ถูกบันทึกจริง**
 * Codex 18 ก.ย. 2026: การคืน sent:false ไม่ได้แปลว่า retry — finalizer เดิม retry เฉพาะ 429
 * ที่เหลือถูกตั้ง failed ทันที เทสต์ชุดนี้จึงยืนยันที่ "PATCH ที่ถูกเขียนลงตาราง" ไม่ใช่ค่าที่ฟังก์ชันคืน
 *
 * ใช้ PostgREST ปลอมในเครื่อง ต้องตั้ง env ก่อน import ใด ๆ (client ผูก URL ตอนสร้าง)
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

/** @type {{optedOut:boolean|null, patchFails:number}} */
let MODE = { optedOut: false, patchFails: 0 };
let PATCHES = [];
const server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => { body += c; });
  req.on("end", () => {
    const json = (() => { try { return JSON.parse(body); } catch { return null; } })();
    if (req.method === "PATCH" && req.url.includes("outbound_messages")) {
      if (MODE.patchFails > 0) {
        MODE.patchFails -= 1;
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "simulated db write failure" }));
      }
      PATCHES.push(json);
      res.writeHead(204); return res.end();
    }
    if (req.url.includes("get_daily_pick_optout")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ known: true, optedOut: MODE.optedOut === true }));
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end("null");
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const U = `http://127.0.0.1:${server.address().port}`;
for (const [k, v] of Object.entries({
  SUPABASE_URL: U, LOCAL_POSTGREST_URL: U, SUPABASE_SERVICE_ROLE_KEY: "x",
  LOCAL_POSTGREST_ANON_KEY: "x", LOCAL_POSTGREST_SERVICE_KEY: "x",
  OPENAI_API_KEY: "sk-test", CHANNEL_ACCESS_TOKEN: "t", CHANNEL_SECRET: "s",
  GEMINI_API_KEY: "g", REDIS_URL: "",
})) process.env[k] = v;
try {
  for (const line of readFileSync(new URL("../.env.example", import.meta.url), "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=/); if (m && !process.env[m[1]]) process.env[m[1]] = "test-placeholder";
  }
} catch { /* ignore */ }

const { deliverOutboundMessage, finalizeOutboundAttempt } =
  await import("../src/services/scanV2/deliverOutbound.service.js");

const ID = "66666666-6666-4666-8666-666666666666";
function mkMsg(kind, attempt = 0) {
  return { id: ID, line_user_id: "Uretry_itest", kind, payload_json: { text: "ข้อความทดสอบ" },
           related_job_id: null, attempt_count: attempt };
}
/** เดินครบเส้น worker: deliver → (ถ้าไม่ terminal) finalizer → คืน PATCH ที่เขียนจริง */
async function runWorkerCycle(msg, deps = {}) {
  PATCHES = [];
  const pushes = [];
  const client = { pushMessage: async (_u, m) => { pushes.push(m); }, replyMessage: async () => ({}) };
  const traceCtx = { banGateDeps: { isBanned: async () => false, ...deps } };
  const result = await deliverOutboundMessage(client, msg, traceCtx);
  // เงื่อนไขเดียวกับ deliveryWorker.js
  if (!result.sent && !result.suppressedBanned && !result.suppressedOptout) {
    await finalizeOutboundAttempt(msg.id, msg, result, traceCtx, client);
  }
  return { result, pushes, patches: PATCHES };
}
const throwingRead = { isDailyPickOptedOut: async () => { throw new Error("db unreachable"); } };

test("1. อ่าน preference ล้มครั้งแรก → สถานะที่บันทึกคือ retry_wait และมี next_retry_at", async () => {
  MODE = { optedOut: false, patchFails: 0 };
  const { result, pushes, patches } = await runWorkerCycle(mkMsg("daily_pick_push", 1), throwingRead);
  assert.equal(pushes.length, 0, "transport ต้องเป็น 0 ระหว่าง error");
  assert.equal(result.errorCode, "optout_check_failed");
  assert.equal(patches.length, 1);
  assert.equal(patches[0].status, "retry_wait", "ต้องไม่ใช่ failed (บั๊กเดิม: failed ทันที)");
  assert.ok(patches[0].next_retry_at, "ต้องมี next_retry_at ให้ claim กลับมาได้");
  assert.ok(new Date(patches[0].next_retry_at).getTime() > Date.now(), "ต้องเป็นเวลาในอนาคต");
  assert.equal(patches[0].last_error_code, "optout_check_failed");
});

test("2ก. รอบถัดไป DB กลับมา + ลูกค้าปิดอยู่ → suppressed_optout และไม่ push", async () => {
  MODE = { optedOut: true, patchFails: 0 };
  const { result, pushes, patches } = await runWorkerCycle(mkMsg("daily_pick_push", 2));
  assert.equal(pushes.length, 0);
  assert.equal(result.suppressedOptout, true);
  assert.equal(patches.length, 1);
  assert.equal(patches[0].status, "suppressed_optout");
  assert.equal(patches[0].next_retry_at, null, "terminal — ห้าม retry ต่อ");
});

test("2ข. รอบถัดไป DB กลับมา + ลูกค้าเปิดรับ → ส่งได้ตามปกติ และบันทึกเป็น sent", async () => {
  MODE = { optedOut: false, patchFails: 0 };
  const { pushes, patches } = await runWorkerCycle(mkMsg("daily_pick_push", 2));
  assert.equal(pushes.length, 1, "ลูกค้าเปิดรับ ต้องได้รับข้อความ");
  const sent = patches.find((p) => p.status === "sent");
  assert.ok(sent, "ต้องบันทึกว่า sent");
  assert.ok(sent.sent_at, "ส่งจริงต้องมี sent_at (ต่างจากงดส่ง)");
});

test("3. บันทึก suppressed_optout ล้ม → retry_wait ก่อน แล้วรอบถัดไปบันทึก terminal สำเร็จ", async () => {
  MODE = { optedOut: true, patchFails: 1 };            // PATCH แรกล้ม
  const first = await runWorkerCycle(mkMsg("daily_pick_push", 1));
  assert.equal(first.pushes.length, 0, "เขียนไม่ได้ ห้าม push");
  assert.equal(first.result.errorCode, "suppress_persist_failed");
  assert.notEqual(first.result.suppressedOptout, true, "ห้ามรายงานว่างดส่งสำเร็จ");
  assert.equal(first.patches.at(-1).status, "retry_wait", "ต้องได้ retry ไม่ใช่ failed");
  assert.ok(first.patches.at(-1).next_retry_at);

  MODE = { optedOut: true, patchFails: 0 };            // รอบถัดไป DB กลับมา
  const second = await runWorkerCycle(mkMsg("daily_pick_push", 2));
  assert.equal(second.pushes.length, 0);
  assert.equal(second.result.suppressedOptout, true);
  assert.equal(second.patches.at(-1).status, "suppressed_optout", "คราวนี้บันทึก terminal สำเร็จ");
});

test("4. ครบเพดาน → terminal พร้อมเหตุผลชัดเจน ไม่ retry วน", async () => {
  MODE = { optedOut: false, patchFails: 0 };
  // daily_pick_push ไม่ได้กำหนดเพดานเฉพาะ → ใช้ค่าเริ่มต้น 5
  const { patches } = await runWorkerCycle(mkMsg("daily_pick_push", 5), throwingRead);
  assert.equal(patches.at(-1).status, "failed");
  assert.equal(patches.at(-1).last_error_code, "optout_check_failed_max_attempts");
  assert.equal(patches.at(-1).next_retry_at, null, "ห้ามตั้งเวลา retry อีก");
  // fb_consent_ask เพดาน 2
  const fb = await runWorkerCycle(mkMsg("fb_consent_ask", 2), throwingRead);
  assert.equal(fb.patches.at(-1).status, "failed");
  assert.equal(fb.patches.at(-1).last_error_code, "optout_check_failed_max_attempts");
  const fbRetry = await runWorkerCycle(mkMsg("fb_consent_ask", 1), throwingRead);
  assert.equal(fbRetry.patches.at(-1).status, "retry_wait", "ยังไม่ครบเพดานต้อง retry ได้");
});

test("5ก. ข้อความธุรกรรมไม่เปลี่ยนพฤติกรรม: error อื่นยัง failed ทันทีเหมือนเดิม", async () => {
  MODE = { optedOut: true, patchFails: 0 };
  for (const kind of ["scan_failure_notify", "renewal_reminder"]) {
    PATCHES = [];
    await finalizeOutboundAttempt(ID, mkMsg(kind, 1),
      { sent: false, errorCode: "optout_check_failed", errorMessage: "x" }, {}, null);
    assert.equal(PATCHES.at(-1).status, "failed",
      `${kind} ต้องไม่ได้ retry policy ใหม่ (ขอบเขตจำกัดแค่ข้อความเชิงรุก)`);
    assert.equal(PATCHES.at(-1).last_error_code, "optout_check_failed");
  }
  // error code อื่นของข้อความเชิงรุกเองก็ต้องไม่เปลี่ยน
  PATCHES = [];
  await finalizeOutboundAttempt(ID, mkMsg("daily_pick_push", 1),
    { sent: false, errorCode: "empty_payload", errorMessage: "x" }, {}, null);
  assert.equal(PATCHES.at(-1).status, "failed", "error อื่นยัง failed ทันทีเหมือนเดิม");
});

test("5ข. 429 ไม่เปลี่ยนพฤติกรรม และไม่ถูกปนกับเส้น optout", async () => {
  MODE = { optedOut: true, patchFails: 0 };
  PATCHES = [];
  await finalizeOutboundAttempt(ID, mkMsg("daily_pick_push", 1),
    { sent: false, is429: true }, {}, null);
  assert.equal(PATCHES.at(-1).status, "retry_wait");
  assert.equal(PATCHES.at(-1).last_error_code, "line_429", "ต้องยังเป็นเส้น 429 เดิม ไม่ใช่ของ optout");
  PATCHES = [];
  await finalizeOutboundAttempt(ID, mkMsg("daily_pick_push", 5),
    { sent: false, is429: true }, {}, null);
  assert.equal(PATCHES.at(-1).status, "dead", "ครบเพดาน 429 ยังเป็น dead เหมือนเดิม");
  // และเส้น optout ต้องไม่ตั้ง rate backoff ให้ผู้ใช้ (ไม่ปลอมเป็น 429)
  const src = readFileSync(new URL("../src/services/scanV2/deliverOutbound.service.js", import.meta.url), "utf8");
  const i = src.indexOf("OPTOUT_GUARD_RETRYABLE.has");
  assert.ok(i > 0);
  const block = src.slice(i, src.indexOf("await updateOutboundMessage(id, {\n    status: \"failed\"", i));
  assert.doesNotMatch(block, /setDeliveryRateBackoffMs|is429/, "ห้ามปลอมเป็น 429");
});

test.after(() => new Promise((r) => server.close(r)));
