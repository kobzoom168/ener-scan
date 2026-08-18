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

test("repeat detector: sliding window 15 นาที นับซ้ำ 3 ครั้ง hit · ถามสถานะไม่นับ · recent 3 redacted", async () => {
  // fake redis zset/list พอสำหรับ detector
  const z = new Map(); const lists = new Map();
  const fakeR = {
    zadd: async (k, score, member) => { (z.get(k) || z.set(k, new Map()).get(k)).set(member, score); },
    zremrangebyscore: async (k, min, max) => { const m = z.get(k); if (m) for (const [mem, sc] of m) if (sc >= min && sc <= max) m.delete(mem); },
    zcard: async (k) => (z.get(k)?.size || 0),
    expire: async () => {},
    lpush: async (k, v) => { lists.set(k, [v, ...(lists.get(k) || [])]); },
    ltrim: async (k, a, b) => { lists.set(k, (lists.get(k) || []).slice(a, b + 1)); },
    lrange: async (k, a, b) => (lists.get(k) || []).slice(a, b + 1),
  };
  const deps = { getRedis: async () => fakeR };
  const r1 = await trackRepeatedInput("U1", "ทดสอบ", deps);
  const r2 = await trackRepeatedInput("U1", "ทดสอบ ", deps);
  const r3 = await trackRepeatedInput("U1", "ทดสอบ", deps);
  assert.equal(r1.hit, false);
  assert.equal(r2.hit, false);
  assert.equal(r3.hit, true); // normalize ช่องว่างแล้วนับรวม
  assert.equal(r3.recent.length, 3);
  assert.equal((await trackRepeatedInput("U1", "ผลออกยังครับ", deps)).hit, false);
  assert.equal(normalizeRepeatText("  ทดสอบ   A "), "ทดสอบ a");
  // idempotency claim (durable msgid dedupe) ครอบ dispatch ทั้งเทิร์น: ใน handleEvent
  // claim ต้องมาก่อนเรียก handleEventInner — detector อยู่ใต้ inner เสมอ
  const heStart = WEBHOOK.indexOf("async function handleEvent({ client, event })");
  const heBody = WEBHOOK.slice(heStart, WEBHOOK.indexOf("async function handleEventInner", heStart));
  assert.ok(heStart > 0);
  assert.ok(heBody.indexOf("claimInboundMessage") > 0);
  assert.ok(heBody.indexOf("claimInboundMessage") < heBody.indexOf("handleEventInner({ client, event })"));
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
  // มี positive cache = drop ต่อแม้ DB พัง (คืน "1" เฉพาะ ban:active — tombstone ต้องไม่ติด)
  assert.equal(
    await isBanned("U" + "b".repeat(32), {
      dbClient: err,
      cacheGet: async (k) => (String(k).startsWith("ban:active:") ? "1" : null),
      cacheSet: async () => {},
      alertDedupe: async () => false,
    }),
    true,
  );
});

/* ---------------- Codex 908d0d2 round: unban + availability behavior ---------------- */

const UID_OK = "U" + "9".repeat(32);

function dbSelectCounter({ banned }) {
  const state = { reads: 0 };
  const client = {
    from: () => ({
      select: () => ({
        eq: () => ({
          is: () => ({
            limit: () => ({
              maybeSingle: async () => {
                state.reads += 1;
                return banned ? { data: { id: 1 }, error: null } : { data: null, error: null };
              },
            }),
          }),
        }),
      }),
    }),
  };
  return { state, client };
}

function memCache() {
  const m = new Map();
  return {
    m,
    cacheGet: async (k) => (m.has(k) ? m.get(k) : null),
    cacheSet: async (k, v) => { m.set(k, v); },
    cacheDel: async (k) => { m.delete(k); },
  };
}

test("availability: negative cache 45s — burst หลาย event อ่าน DB ครั้งเดียว", async () => {
  const { state, client } = dbSelectCounter({ banned: false });
  const c = memCache();
  for (let i = 0; i < 5; i++) {
    assert.equal(await isBanned(UID_OK, { dbClient: client, ...c, alertDedupe: async () => false }), false);
  }
  assert.equal(state.reads, 1, "อ่าน DB ครั้งเดียวต่อ burst");
});

test("availability: DB ค้าง (ไม่ resolve) → bounded fail-open ไม่ลาก webhook", async () => {
  const never = { from: () => ({ select: () => ({ eq: () => ({ is: () => ({ limit: () => ({ maybeSingle: () => new Promise(() => {}) }) }) }) }) }) };
  const t0 = Date.now();
  const r = await isBanned(UID_OK, { dbClient: never, cacheGet: async () => null, cacheSet: async () => {}, alertDedupe: async () => false });
  assert.equal(r, false);
  assert.ok(Date.now() - t0 < 3000, "ต้องจบภายใน bound (~800ms)");
});

test("แบนระหว่าง negative cache ยัง active: banUser เขียน positive → เห็นผลทันที", async () => {
  const c = memCache();
  const { client } = dbSelectCounter({ banned: false });
  await isBanned(UID_OK, { dbClient: client, ...c, alertDedupe: async () => false }); // สร้าง neg cache
  const insertOk = { from: () => ({ insert: async () => ({ error: null }) }) };
  const r = await banUser({ lineUserId: UID_OK, reason: "x", bannedBy: "admin" }, { dbClient: insertOk, ...c });
  assert.equal(r.ok, true);
  // ไม่ต้องรอ neg cache หมดอายุ — positive cache ชนะทันที (ไม่แตะ DB อีก)
  const noDb = { from: () => { throw new Error("must not read db"); } };
  assert.equal(await isBanned(UID_OK, { dbClient: noDb, ...c, alertDedupe: async () => false }), true);
});

test("unban: DEL cache พลาด → ok แต่ cacheCleared=false (ห้ามโกหกว่าเรียบร้อย)", async () => {
  const c = memCache();
  const failDel = async () => { throw new Error("redis down"); };
  const client = { from: () => ({ update: () => ({ eq: () => ({ is: () => ({ select: async () => ({ data: [{ id: 1 }], error: null }) }) }) }) }) };
  const r = await unbanUser({ lineUserId: UID_OK, unbannedBy: "admin" }, { dbClient: client, cacheDel: failDel, cacheSet: c.cacheSet });
  assert.equal(r.ok, true);
  assert.equal(r.cacheCleared, false);
});

test("unban คนที่ไม่ได้แบน → not_banned แต่ล้าง cache/troll ทุก key อยู่ดี (กัน stale)", async () => {
  const cleared = [];
  const client = { from: () => ({ update: () => ({ eq: () => ({ is: () => ({ select: async () => ({ data: [], error: null }) }) }) }) }) };
  const r = await unbanUser({ lineUserId: UID_OK, unbannedBy: "admin" }, {
    dbClient: client,
    cacheDel: async (k) => { cleared.push(k); },
    cacheSet: async () => {},
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "not_banned");
  assert.ok(cleared.includes(`ban:active:${UID_OK}`));
  for (const suffix of ["banned", "troll", "troll_notice", "last_text", "sticker_streak"]) {
    assert.ok(cleared.includes(`scan_v2:${suffix}:${UID_OK}`), `ต้องล้าง scan_v2:${suffix}`);
  }
});

test("stale-read race: tombstone หลัง unban → positive cache เก่าไม่ถูกเชื่อ + ไม่ถูกเขียนกลับ", async () => {
  const c = memCache();
  c.m.set(`ban:tomb:${UID_OK}`, "1");
  c.m.set(`ban:active:${UID_OK}`, "1"); // cache เก่าค้าง (จำลอง DEL แพ้ race)
  const { state, client } = dbSelectCounter({ banned: false });
  const r = await isBanned(UID_OK, { dbClient: client, ...c, alertDedupe: async () => false });
  assert.equal(r, false, "tombstone ต้องบังคับไปถาม DB (SSOT)");
  assert.equal(state.reads, 1);
});

test("shadow-mute → unban → event ผ่าน: unban ล้าง scan_v2:banned (soft mute) ด้วย", async () => {
  const c = memCache();
  c.m.set(`scan_v2:banned:${UID_OK}`, "1"); // soft mute เดิมของ troll system
  const client = { from: () => ({ update: () => ({ eq: () => ({ is: () => ({ select: async () => ({ data: [{ id: 1 }], error: null }) }) }) }) }) };
  const r = await unbanUser({ lineUserId: UID_OK, unbannedBy: "admin" }, { dbClient: client, ...c });
  assert.equal(r.ok, true);
  assert.equal(r.cacheCleared, true);
  assert.equal(c.m.has(`scan_v2:banned:${UID_OK}`), false, "soft mute ต้องหายหลังปลดแบน");
});
