/**
 * ระบบแบน + monitor (กบ 18 ส.ค. + Codex acceptance) — DI/pure/source-order tests
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { isBanned, banUser, unbanUser, BAN_UID_RE } from "../src/services/ban/bannedUsers.repo.js";
import {
  redactForAlert,
  normalizeRepeatText,
  trackRepeatedInput,
  sendCustomerAlert,
} from "../src/services/monitor/customerAlerts.service.js";
import { classifyIdentityQuestion } from "../src/services/welcome/identityQuestion.service.js";

const WEBHOOK = fs.readFileSync(path.join(process.cwd(), "src", "routes", "lineWebhook.js"), "utf8");

function fakeDb({ activeBan, insertError = null, updateRows = [{ id: 1 }] }) {
  const chain = (terminal) => {
    const o = {
      select: () => o, eq: () => o, is: () => o, limit: () => o, order: () => o,
      maybeSingle: async () => terminal,
      insert: async () => ({ error: insertError }),
      update: () => ({ eq: () => ({ is: () => ({ select: async () => ({ data: updateRows, error: null }) }) }) }),
    };
    return o;
  };
  return { from: () => chain(activeBan ? { data: { id: 9 }, error: null } : { data: null, error: null }) };
}

test("uid regex เข้ม: เต็ม 32 hex เท่านั้น — prefix/ปลอมไม่ผ่าน", () => {
  assert.equal(BAN_UID_RE.test("U" + "a".repeat(32)), true);
  assert.equal(BAN_UID_RE.test("U" + "a".repeat(31)), false);
  assert.equal(BAN_UID_RE.test("Usmoke"), false);
  assert.equal(BAN_UID_RE.test("X" + "a".repeat(32)), false);
});

test("ban/unban invalid uid → ปฏิเสธ ไม่แตะ DB", async () => {
  assert.equal((await banUser({ lineUserId: "Ushort", bannedBy: "Uadmin" }, { dbClient: fakeDb({}), cacheSet: async () => {} })).ok, false);
  assert.equal((await unbanUser({ lineUserId: "Ushort", unbannedBy: "Uadmin" }, { dbClient: fakeDb({}), cacheDel: async () => {} })).ok, false);
});

test("source-order: ban gate อยู่ก่อน loading/imageCount/dispatch + follow ผ่าน gate", () => {
  const routerIdx = WEBHOOK.indexOf("export function lineWebhookRouter");
  const tail = WEBHOOK.slice(routerIdx);
  const gateIdx = tail.indexOf("BANNED_EVENT_DROPPED");
  assert.ok(gateIdx > 0, "หา ban gate ไม่เจอ");
  assert.ok(gateIdx < tail.indexOf("startLineLoadingAnimation(lineConfig"), "gate ต้องก่อน loading animation");
  assert.ok(gateIdx < tail.indexOf("groupImageEventCountByUser(events)"), "gate ต้องก่อน multi-image grouping");
  assert.ok(gateIdx < tail.indexOf("await handleEvent({ client, event })"), "gate ต้องก่อน dispatch (รวม follow)");
  // admin ยกเว้น + unfollow ผ่าน
  assert.match(tail.slice(0, gateIdx + 1200), /adminUidForBan/);
  assert.match(tail.slice(gateIdx - 1500, gateIdx + 500), /unfollow/);
});

test("worker gates: scan ก่อน AI + delivery ก่อน push + suppressed_banned มี owner", () => {
  const scan = fs.readFileSync(path.join(process.cwd(), "src", "services", "scanV2", "processScanJob.service.js"), "utf8");
  const scanFn = scan.slice(scan.indexOf("export async function processScanJob"));
  assert.ok(scanFn.indexOf("SCAN_JOB_SUPPRESSED_BANNED") < scanFn.indexOf("SCAN_AI_STARTED"), "scan gate ต้องก่อนเริ่ม AI");
  const del = fs.readFileSync(path.join(process.cwd(), "src", "services", "scanV2", "deliverOutbound.service.js"), "utf8");
  const delFn = del.slice(del.indexOf("export async function deliverOutboundMessage"));
  assert.ok(delFn.indexOf("OUTBOUND_SUPPRESSED_BANNED") < delFn.indexOf("OUTBOUND_SEND_START"), "delivery gate ต้องก่อน send");
  // owner map ครอบ suppressed_banned (source-scan test ของ notify จะตรวจซ้ำอีกชั้น)
  const notify = fs.readFileSync(path.join(process.cwd(), "src", "services", "scanV2", "scanJobFailureNotify.service.js"), "utf8");
  assert.match(notify, /suppressed_banned/);
});

test("admin command: user-only + nonce + fail-closed (source contract)", () => {
  const fn = WEBHOOK.slice(WEBHOOK.indexOf("async function maybeHandleBanCommand"), WEBHOOK.indexOf("async function maybeHandleAdminAssist"));
  assert.match(fn, /source\?\.type.*user/);
  assert.match(fn, /U\[0-9a-f\]\{32\}/);
  assert.match(fn, /ยืนยันแบน/);
  assert.match(fn, /ยังไม่แบนครับ/); // redis fail = fail-closed
  assert.match(fn, /GET.*DEL|redis\.call\('DEL'/s); // atomic consume
  assert.match(fn, /แบนบัญชีแอดมินเองไม่ได้/);
});

test("identity classify: แจ้งเฉพาะ ai_bot — who/admin_check ไม่แจ้ง", () => {
  assert.equal(classifyIdentityQuestion("เป็นบอทใช่ไหม"), "ai_bot");
  assert.equal(classifyIdentityQuestion("สรุปเป็น ai ใช้ไหม"), "ai_bot");
  assert.equal(classifyIdentityQuestion("คุยกับใครอยู่"), "who");
  assert.equal(classifyIdentityQuestion("เป็นแอดมินใช่ไหม"), "admin_check");
  assert.equal(classifyIdentityQuestion("พระองค์นี้ดีไหม"), null);
});

test("repeat detector: นับซ้ำ 3 ครั้ง hit · ถามสถานะไม่นับ · redelivery กันที่ msgid ก่อนแล้ว", async () => {
  const counters = new Map();
  const inc = async (k) => { counters.set(k, (counters.get(k) || 0) + 1); return counters.get(k); };
  const r1 = await trackRepeatedInput("U1", "ทดสอบ", { incrementCounterWithTtl: inc });
  const r2 = await trackRepeatedInput("U1", "ทดสอบ ", { incrementCounterWithTtl: inc });
  const r3 = await trackRepeatedInput("U1", "ทดสอบ", { incrementCounterWithTtl: inc });
  assert.equal(r1.hit, false);
  assert.equal(r2.hit, false);
  assert.equal(r3.hit, true); // normalize ช่องว่างแล้วนับรวม
  assert.equal((await trackRepeatedInput("U1", "ผลออกยังครับ", { incrementCounterWithTtl: inc })).hit, false);
  assert.equal(normalizeRepeatText("  ทดสอบ   A "), "ทดสอบ a");
  // msgid dedupe อยู่ก่อน detector (source-order)
  const wrapper = WEBHOOK.slice(WEBHOOK.indexOf("async function handleTextMessage(opts)"));
  assert.ok(wrapper.indexOf("msgid_claim") < wrapper.indexOf("trackRepeatedInput"));
});

test("alert honesty: Telegram ล้ม → dedupe ล้าง รอบหน้าลองใหม่", async () => {
  const dedupe = new Set();
  const cleared = [];
  let sent = 0;
  const deps = {
    tryDedupeOnce: async (k) => { if (dedupe.has(k)) return false; dedupe.add(k); return true; },
    clearDedupeKey: async (k) => { dedupe.delete(k); cleared.push(k); },
    sendTelegramText: async () => { sent += 1; return { ok: false, reason: "http_500" }; },
  };
  await sendCustomerAlert({ type: "t", userId: "U1", dedupeSec: 60, telegramText: "x" }, deps);
  assert.equal(cleared.length, 1);
  await sendCustomerAlert({ type: "t", userId: "U1", dedupeSec: 60, telegramText: "x" }, deps);
  assert.equal(sent, 2); // ลองใหม่จริง
});

test("redact: เบอร์/ลิงก์/token/วันที่ หาย + จำกัด 200 ตัวอักษร", () => {
  const out = redactForAlert("โทร 0812345678 ดู https://x.y/z PAY-123 เกิด 21/07/2530 " + "ก".repeat(300));
  assert.doesNotMatch(out, /0812345678|https:|PAY-123|21\/07\/2530/);
  assert.ok(out.length <= 200);
});

test("cache contract: DB error + ไม่มี positive cache = fail-open", async () => {
  const err = { from: () => ({ select: () => ({ eq: () => ({ is: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: { message: "down" } }) }) }) }) }) }) };
  assert.equal(
    await isBanned("U" + "b".repeat(32), { dbClient: err, cacheGet: async () => null, cacheSet: async () => {}, alertDedupe: async () => false }),
    false,
  );
  // มี positive cache = drop ต่อแม้ DB พัง
  assert.equal(
    await isBanned("U" + "b".repeat(32), { dbClient: err, cacheGet: async () => "1", cacheSet: async () => {}, alertDedupe: async () => false }),
    true,
  );
});
