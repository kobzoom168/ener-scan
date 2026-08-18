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
  assert.ok(
    scanFn.indexOf("terminalizeSuppressedBannedJob(") < scanFn.indexOf("SCAN_AI_STARTED"),
    "scan gate (terminalize) ต้องก่อนเริ่ม AI",
  );
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
    strictSet: async (k, v) => { m.set(k, v); return { ok: true }; },
    strictDel: async (k) => { m.delete(k); return { ok: true }; },
  };
}

test("availability: concurrent burst 20 เทิร์นพร้อมกัน → DB read เดียว (single-flight) + ตามด้วย neg cache", async () => {
  const uid = "U" + "8".repeat(32); // uid เฉพาะเทสต์นี้ กัน in-flight ปนกับเทสต์อื่น
  const { state, client } = dbSelectCounter({ banned: false });
  const c = memCache();
  const results = await Promise.all(
    Array.from({ length: 20 }, () => isBanned(uid, { dbClient: client, ...c, alertDedupe: async () => false })),
  );
  assert.ok(results.every((r) => r === false));
  assert.equal(state.reads, 1, "burst พร้อมกันต้องแชร์ DB read เดียว");
  // รอบต่อมาโดน negative cache — ไม่แตะ DB เพิ่ม
  assert.equal(await isBanned(uid, { dbClient: client, ...c, alertDedupe: async () => false }), false);
  assert.equal(state.reads, 1);
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
  assert.equal(r.cacheSynced, true);
  // ไม่ต้องรอ neg cache หมดอายุ — positive cache ชนะทันที (ไม่แตะ DB อีก)
  const noDb = { from: () => { throw new Error("must not read db"); } };
  assert.equal(await isBanned(UID_OK, { dbClient: noDb, ...c, alertDedupe: async () => false }), true);
});

test("unban: strictDel คืน failure แบบไม่ throw (เหมือน production) → cacheCleared=false ห้ามโกหก", async () => {
  const c = memCache();
  // production-like: helper ไม่ throw แต่รายงาน {ok:false} — try/catch จับไม่ได้ (Codex)
  const failDel = async () => ({ ok: false, reason: "no_redis" });
  const client = { from: () => ({ update: () => ({ eq: () => ({ is: () => ({ select: async () => ({ data: [{ id: 1 }], error: null }) }) }) }) }) };
  const r = await unbanUser({ lineUserId: UID_OK, unbannedBy: "admin" }, { dbClient: client, strictDel: failDel, strictSet: c.strictSet });
  assert.equal(r.ok, true);
  assert.equal(r.cacheCleared, false);
});

test("unban คนที่ไม่ได้แบน → not_banned แต่ล้าง cache/troll ทุก key อยู่ดี (กัน stale)", async () => {
  const cleared = [];
  const client = { from: () => ({ update: () => ({ eq: () => ({ is: () => ({ select: async () => ({ data: [], error: null }) }) }) }) }) };
  const r = await unbanUser({ lineUserId: UID_OK, unbannedBy: "admin" }, {
    dbClient: client,
    strictDel: async (k) => { cleared.push(k); return { ok: true }; },
    strictSet: async () => ({ ok: true }),
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "not_banned");
  assert.ok(cleared.includes(`ban:active:${UID_OK}`));
  for (const suffix of ["banned", "troll", "troll_notice", "last_text", "sticker_streak"]) {
    assert.ok(cleared.includes(`scan_v2:${suffix}:${UID_OK}`), `ต้องล้าง scan_v2:${suffix}`);
  }
});

test("stale-read race: tombstone หลัง unban → positive cache เก่าไม่ถูกเชื่อ + ไม่ถูกเขียนกลับ", async () => {
  const uid = "U" + "3".repeat(32); // uid เฉพาะ กัน single-flight ปนกับเทสต์อื่น
  const c = memCache();
  c.m.set(`ban:tomb:${uid}`, "1");
  c.m.set(`ban:active:${uid}`, "1"); // cache เก่าค้าง (จำลอง DEL แพ้ race)
  const { state, client } = dbSelectCounter({ banned: false });
  const r = await isBanned(uid, { dbClient: client, ...c, alertDedupe: async () => false });
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

/* ---------------- Codex 18d5d3a round: cache correctness acceptance ---------------- */

test("acceptance a: cache ทุกชั้น + DB ค้างหมด (never resolve) → isBanned จบใน overall bound <1s", async () => {
  const never = () => new Promise(() => {});
  const neverDb = { from: () => ({ select: () => ({ eq: () => ({ is: () => ({ limit: () => ({ maybeSingle: never }) }) }) }) }) };
  const t0 = Date.now();
  const r = await isBanned("U" + "7".repeat(32), {
    dbClient: neverDb,
    cacheGet: never,           // cache ค้างด้วย — deadline ต้องเป็นก้อนเดียว ไม่ใช่ 800ms ต่อสเต็ป
    cacheSet: async () => {},
    alertDedupe: async () => false,
  });
  const elapsed = Date.now() - t0;
  assert.equal(r, false);
  assert.ok(elapsed < 1000, `ต้องจบ <1s ได้จริง ${elapsed}ms`);
});

test("acceptance b: stale DB read จบหลัง unban → ห้ามเชื่อผลเก่า + ห้ามเขียน positive กลับ", async () => {
  const uid = "U" + "6".repeat(32);
  const store = new Map();
  const cacheGet = async (k) => (store.has(k) ? store.get(k) : null);
  const posWrites = [];
  const cacheSet = async (k, v) => { posWrites.push(k); store.set(k, v); };
  // DB query แขวนไว้ — resolve เป็น active row หลังเราตั้ง tombstone (จำลอง unban กลางคัน)
  let resolveDb;
  const dbClient = { from: () => ({ select: () => ({ eq: () => ({ is: () => ({ limit: () => ({
    maybeSingle: () => new Promise((r) => { resolveDb = r; }),
  }) }) }) }) }) };
  const p = isBanned(uid, { dbClient, cacheGet, cacheSet, alertDedupe: async () => false });
  await new Promise((r) => setTimeout(r, 20));
  store.set(`ban:tomb:${uid}`, "1"); // unban เกิดระหว่าง query วิ่ง
  resolveDb({ data: { id: 1 }, error: null }); // active row เก่าเพิ่งมาถึง
  const r = await p;
  assert.equal(r, false, "ผล query เก่าห้ามชนะ tombstone");
  assert.ok(!posWrites.includes(`ban:active:${uid}`), "ห้ามเขียน positive cache กลับ");
});

test("acceptance c: banUser cache sync พลาด (strict {ok:false}) → cacheSynced=false ห้าม claim ผลทันที", async () => {
  const insertOk = { from: () => ({ insert: async () => ({ error: null }) }) };
  const r = await banUser({ lineUserId: "U" + "5".repeat(32), reason: "x", bannedBy: "admin" }, {
    dbClient: insertOk,
    strictDel: async () => ({ ok: false, reason: "no_redis" }),
    strictSet: async () => ({ ok: false, reason: "no_redis" }),
  });
  assert.equal(r.ok, true);
  assert.equal(r.cacheSynced, false);
});

test("admin reply honesty: webhook ไม่ claim success เมื่อ cacheCleared/cacheSynced = false (source contract)", () => {
  assert.ok(WEBHOOK.includes("res.cacheCleared === false"), "unban reply ต้องเช็ค cacheCleared");
  assert.ok(WEBHOOK.includes("res.cacheSynced === false"), "ban reply ต้องเช็ค cacheSynced");
  assert.ok(WEBHOOK.includes("ล้าง cache ไม่ครบ"), "ข้อความ unban ต้องบอกตรง ๆ ว่า cache ไม่ครบ");
});

test("alert ไม่ขวาง return: isBanned เส้น fail-open จบเร็วแม้ Telegram ค้าง (fire-and-forget)", async () => {
  const errDb = { from: () => ({ select: () => ({ eq: () => ({ is: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: { message: "down" } }) }) }) }) }) }) };
  const t0 = Date.now();
  // alertDedupe ค้าง — ถ้า await อยู่ในเส้นหลักเทสต์นี้จะเกิน bound
  const r = await isBanned("U" + "4".repeat(32), {
    dbClient: errDb,
    cacheGet: async () => null,
    cacheSet: async () => {},
    alertDedupe: () => new Promise(() => {}),
  });
  assert.equal(r, false);
  assert.ok(Date.now() - t0 < 900, "alert ต้องไม่ block การ return");
});

/* ---------------- Codex 18d5d3a P1: alert lease + channel isolation ---------------- */

test("alert lease: สำเร็จ → sent marker เต็ม TTL · lease แค่ช่วงส่ง (process ตายเสียแค่ 60 วิ)", async () => {
  const kv = new Map();
  const deps = {
    tryDedupeOnce: async (k) => { if (kv.has(k)) return false; kv.set(k, "1"); return true; },
    clearDedupeKey: async (k) => { kv.delete(k); },
    getValue: async (k) => (kv.has(k) ? kv.get(k) : null),
    setLargeValueWithTtl: async (k, v) => { kv.set(k, v); },
    sendTelegramText: async () => ({ ok: true }),
  };
  await sendCustomerAlert({ type: "x", userId: "U9", dedupeSec: 3600, telegramText: "t" }, deps);
  assert.equal(kv.get("alert:x:tg:U9"), "1", "sent marker ต้องถูกตั้งหลังส่งสำเร็จ");
  let sent2 = 0;
  deps.sendTelegramText = async () => { sent2 += 1; return { ok: true }; };
  await sendCustomerAlert({ type: "x", userId: "U9", dedupeSec: 3600, telegramText: "t" }, deps);
  assert.equal(sent2, 0, "sent marker ต้องกันส่งซ้ำ");
});

test("channel isolation: Telegram ค้าง → timeout เอง + LINE alert ยังเดิน (ไม่โดนขวาง)", async () => {
  const kv = new Map();
  let linePushed = 0;
  const deps = {
    tryDedupeOnce: async (k) => { if (kv.has(k)) return false; kv.set(k, "1"); return true; },
    clearDedupeKey: async (k) => { kv.delete(k); },
    getValue: async (k) => (kv.has(k) ? kv.get(k) : null),
    setLargeValueWithTtl: async (k, v) => { kv.set(k, v); },
    sendTelegramText: () => new Promise(() => {}), // ค้างตลอด
    channelTimeoutMs: 150,
  };
  const prevAdmin = process.env.ADMIN_LINE_USER_ID;
  process.env.ADMIN_LINE_USER_ID = "U" + "f".repeat(32);
  try {
    const t0 = Date.now();
    await sendCustomerAlert(
      { type: "y", userId: "U8", dedupeSec: 3600, telegramText: "t", lineText: "l", lineClient: { pushMessage: async () => { linePushed += 1; } } },
      deps,
    );
    assert.equal(linePushed, 1, "LINE ต้องส่งแม้ Telegram ค้าง");
    assert.ok(Date.now() - t0 < 2000, "Telegram ค้างต้องโดน timeout ไม่ลากทั้งฟังก์ชัน");
    assert.equal(kv.has("alert:y:tg:U8"), false, "TG fail ห้ามตั้ง sent marker (lease หลุด รอบหน้าลองใหม่)");
    assert.equal(kv.get("alert:y:line:U8"), "1");
  } finally {
    if (prevAdmin === undefined) delete process.env.ADMIN_LINE_USER_ID; else process.env.ADMIN_LINE_USER_ID = prevAdmin;
  }
});

/* ---------------- Codex รอบ 3: resurrection + single-flight recovery ---------------- */

test("resurrection race: stale positive write หลัง unban เขียนไม่เข้า (atomic guarded SET)", async () => {
  const uid = "U" + "2".repeat(32);
  const store = new Map();
  const cacheGet = async (k) => (store.has(k) ? store.get(k) : null);
  const cacheSet = async (k, v) => { store.set(k, v); };
  // guarded set แบบ production (Lua): เขียนเฉพาะเมื่อ tombstone ไม่มี ณ เวลาเขียนจริง
  const setPositiveGuarded = async (key, value, ttl, guardKey) => {
    if (store.has(guardKey)) return { ok: true, written: false };
    store.set(key, value);
    return { ok: true, written: true };
  };
  let resolveDb;
  const dbClient = { from: () => ({ select: () => ({ eq: () => ({ is: () => ({ limit: () => ({
    maybeSingle: () => new Promise((r) => { resolveDb = r; }),
  }) }) }) }) }) };
  // isBanned เริ่ม → DB ค้าง
  const p = isBanned(uid, { dbClient, cacheGet, cacheSet, setPositiveGuarded, alertDedupe: async () => false });
  await new Promise((r) => setTimeout(r, 20));
  // unban สำเร็จระหว่างนั้น: ตั้ง tombstone + ลบ active
  store.set(`ban:tomb:${uid}`, "1");
  store.delete(`ban:active:${uid}`);
  // active row เก่าเพิ่ง settle
  resolveDb({ data: { id: 1 }, error: null });
  await p;
  await new Promise((r) => setTimeout(r, 30)); // ให้ delayed write settle
  assert.equal(store.has(`ban:active:${uid}`), false, "stale write ต้องโดน guard บล็อก");
  // tombstone หมดอายุ → เช็คใหม่กับ DB ที่ปลดแบนแล้ว ต้อง false ถาวร
  store.delete(`ban:tomb:${uid}`);
  const { client: cleanDb } = dbSelectCounter({ banned: false });
  assert.equal(
    await isBanned(uid, { dbClient: cleanDb, cacheGet, cacheSet, setPositiveGuarded, alertDedupe: async () => false }),
    false,
    "หลัง tomb expiry ห้ามแบนซ้ำจาก cache ผี",
  );
});

test("single-flight recovery: query แรกค้างจน timeout → call ถัดไปอ่าน DB ที่ฟื้นแล้วได้ทันที", async () => {
  const uid = "U" + "0".repeat(31) + "a";
  const neverDb = { from: () => ({ select: () => ({ eq: () => ({ is: () => ({ limit: () => ({ maybeSingle: () => new Promise(() => {}) }) }) }) }) }) };
  const r1 = await isBanned(uid, {
    dbClient: neverDb, cacheGet: async () => null, cacheSet: async () => {},
    alertDedupe: async () => false, overallTimeoutMs: 120,
  });
  assert.equal(r1, false, "timeout = fail-open");
  // DB ฟื้น: call ถัดไปต้องไม่ reuse promise ค้าง — อ่านค่าจริง (banned=true) ได้เลย
  const { state, client } = dbSelectCounter({ banned: true });
  const r2 = await isBanned(uid, {
    dbClient: client, cacheGet: async () => null, cacheSet: async () => {},
    setPositiveGuarded: async () => ({ ok: true, written: true }),
    alertDedupe: async () => false,
  });
  assert.equal(r2, true, "ต้องเห็นผลจริงจาก DB ที่ฟื้นแล้ว ไม่ fail-open ซ้ำ");
  assert.equal(state.reads, 1);
});

test("troll exemption + deterministic 0-AI (source contract รอบ 3)", () => {
  // status query ถูกยกเว้นทั้งบล็อกก่อนแตะ troll counter
  const guardIdx = WEBHOOK.indexOf("if (!isResultStatusQueryText) try {");
  const trollInc = WEBHOOK.indexOf("incrementCounterWithTtl(`scan_v2:troll:");
  assert.ok(guardIdx > 0 && guardIdx < trollInc, "status query ต้องยกเว้นก่อน troll increment");
  // 4 จุด deterministic ห้ามมี orchestrator ก่อน send
  for (const marker of [
    'replyType: "scan_energy_helper_pending_verify"',
    'replyType: "usage_help_pending_verify"',
  ]) {
    const i = WEBHOOK.indexOf(marker);
    assert.ok(i > 0, marker);
    const back = WEBHOOK.slice(i - 600, i);
    assert.ok(!back.includes("invokePhase1GeminiOrchestrator()"), `${marker} ต้อง AI=0`);
  }
  // usage_help (idle main) + สแกนพลังงาน (idle main): เช็คทุก occurrence
  for (const marker of ['replyType: "usage_help"', 'replyType: "scan_energy_helper"']) {
    let from = 0;
    while (true) {
      const i = WEBHOOK.indexOf(marker, from);
      if (i < 0) break;
      const back = WEBHOOK.slice(Math.max(0, i - 600), i);
      assert.ok(!back.includes("invokePhase1GeminiOrchestrator()"), `${marker}@${i} ต้อง AI=0`);
      from = i + marker.length;
    }
  }
});

test("LIFF mutations (source contract รอบ 3): profile POST มี guard · daily-pick ข้าม streak write เมื่อแบน", () => {
  const liff = fs.readFileSync(path.join(process.cwd(), "src", "routes", "liff.routes.js"), "utf8");
  const profilePost = liff.indexOf('liffRouter.post("/api/liff/profile"');
  const profileGuard = liff.indexOf('rejectIfBannedLiff(userId, res, "profile_post")', profilePost);
  const profileWrite = liff.indexOf('from("liff_profiles")', profilePost);
  assert.ok(profileGuard > 0 && profileGuard < profileWrite, "profile POST ต้อง guard ก่อน mutate");
  const streakWrite = liff.indexOf("liff:pickstreak:${userId}`, `${dayKey}|${streak}`");
  const streakGuard = liff.lastIndexOf("bannedForStreak", streakWrite);
  assert.ok(streakWrite > 0 && streakGuard > 0 && streakWrite - streakGuard < 400, "streak write ต้องเช็คแบนก่อน");
});
