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

test("alert honesty: Telegram ล้ม → lease ถูกปล่อย (owner token) รอบหน้าลองใหม่", async () => {
  const leases = new Map();
  const released = [];
  let sent = 0;
  let seq = 0;
  const kv = new Map();
  const deps = {
    getValue: async (k) => (kv.has(k) ? kv.get(k) : null),
    setLargeValueWithTtl: async (k, v) => { kv.set(k, v); },
    acquireLease: async (k) => { if (leases.has(k)) return null; const t = `tok${++seq}`; leases.set(k, t); return t; },
    releaseLease: async (k, t) => { if (leases.get(k) === t) { leases.delete(k); released.push(k); } },
    sendTelegramText: async () => { sent += 1; return { ok: false, reason: "http_500" }; },
  };
  await sendCustomerAlert({ type: "t", userId: "U1", dedupeSec: 60, telegramText: "x" }, deps);
  assert.equal(released.length, 1);
  await sendCustomerAlert({ type: "t", userId: "U1", dedupeSec: 60, telegramText: "x" }, deps);
  assert.equal(sent, 2); // ลองใหม่จริง
});

test("alert lease owner token: token คนละตัวปล่อย lease ของกันและกันไม่ได้", async () => {
  const leases = new Map();
  let seq = 0;
  const acquireLease = async (k) => { if (leases.has(k)) return null; const t = `tok${++seq}`; leases.set(k, t); return t; };
  const releaseLease = async (k, t) => { if (leases.get(k) === t) leases.delete(k); };
  const t1 = await acquireLease("L");
  // จำลอง lease หมดอายุแล้ว owner ใหม่จับ
  leases.delete("L");
  const t2 = await acquireLease("L");
  await releaseLease("L", t1); // owner เก่า — ต้องไม่หลุด
  assert.equal(leases.get("L"), t2, "lease ของ owner ใหม่ต้องรอด (compare-delete)");
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

/** fake redis ตาม contract จริง: bumpGeneration + applyBanStateIfGen (atomic multi-op) + per-uid lock */
function memCache() {
  const m = new Map();
  const locks = new Map();
  const queue = new Map(); // durable reconcile queue จำลอง
  const pendingOps = new Map(); // pending-op guard จำลอง
  let lockSeq = 0;
  return {
    m,
    locks,
    expireLock: (k) => locks.delete(k),
    cacheGet: async (k) => (m.has(k) ? m.get(k) : null),
    bumpGen: async (genKey) => {
      const n = (parseInt(m.get(genKey) || "0", 10) || 0) + 1;
      m.set(genKey, String(n));
      return { ok: true, gen: String(n) };
    },
    applyBanState: async (genKey, expectedGen, { sets = [], dels = [] } = {}) => {
      const cur = m.get(genKey) || "0";
      if (cur !== String(expectedGen)) return { ok: true, applied: false };
      for (const it of sets) m.set(it.key, String(it.value ?? "1"));
      for (const k of dels) m.delete(k);
      return { ok: true, applied: true };
    },
    acquireLock: async (k) => { if (locks.has(k)) return null; const t = `t${++lockSeq}`; locks.set(k, t); return t; },
    releaseLock: async (k, t) => { if (locks.get(k) === t) locks.delete(k); },
    checkLockHeld: async (k, t) => locks.get(k) === t,
    renewLock: async (k, t) => locks.get(k) === t, // ต่ออายุได้เฉพาะเจ้าของ token
    queue,
    queueHas: (uid, reason) => [...queue.keys()].some((k) => k.startsWith(`${uid}|${reason}|`)),
    enqueueReconcile: async ({ uid, reason, targetState, opId }) => {
      const member = `${uid}|${reason}|${targetState}|${opId}`;
      queue.set(member, Date.now());
      return { ok: true, member };
    },
    removeReconcile: async (member) => { queue.delete(member); return { ok: true }; },
    pendingOps,
    getPendingOp: async (uid) => pendingOps.get(uid) || null,
    setPendingOp: async (uid, opId) => { pendingOps.set(uid, opId); return { ok: true }; },
    clearPendingOp: async (uid, opId) => {
      if (pendingOps.get(uid) === opId) { pendingOps.delete(uid); return { ok: true, cleared: true }; }
      return { ok: true, cleared: false };
    },
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

test("unban: cache op คืน {ok:false} แบบไม่ throw (เหมือน production) → cacheCleared=false ห้ามโกหก", async () => {
  const c = memCache();
  const client = { from: () => ({ update: () => ({ eq: () => ({ is: () => ({ select: async () => ({ data: [{ id: 1 }], error: null }) }) }) }) }) };
  const r = await unbanUser({ lineUserId: UID_OK, unbannedBy: "admin" }, {
    dbClient: client,
    ...c,
    applyBanState: async () => ({ ok: false, reason: "no_redis" }),
  });
  assert.equal(r.ok, true);
  assert.equal(r.cacheCleared, false);
});

test("unban คนที่ไม่ได้แบน → not_banned แต่ล้าง cache/troll ทุก key อยู่ดี (กัน stale)", async () => {
  const cleared = [];
  const client = { from: () => ({ update: () => ({ eq: () => ({ is: () => ({ select: async () => ({ data: [], error: null }) }) }) }) }) };
  const c0 = memCache();
  const r = await unbanUser({ lineUserId: UID_OK, unbannedBy: "admin" }, {
    dbClient: client,
    ...c0,
    applyBanState: async (genKey, gen, state) => {
      for (const k of state.dels || []) cleared.push(k);
      return c0.applyBanState(genKey, gen, state);
    },
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
  // guard ตาม contract จริง: stale write "พยายามได้" แต่ต้องไม่ apply เมื่อ gen ขยับ
  const applyBanState = async (genKey, gen, { sets = [], dels = [] } = {}) => {
    const cur = store.get(genKey) || "0";
    if (cur !== String(gen)) return { ok: true, applied: false };
    for (const it of sets) store.set(it.key, String(it.value ?? "1"));
    for (const k of dels) store.delete(k);
    return { ok: true, applied: true };
  };
  // DB query แขวนไว้ — resolve เป็น active row หลังเราตั้ง tombstone (จำลอง unban กลางคัน)
  let resolveDb;
  const dbClient = { from: () => ({ select: () => ({ eq: () => ({ is: () => ({ limit: () => ({
    maybeSingle: () => new Promise((r) => { resolveDb = r; }),
  }) }) }) }) }) };
  const p = isBanned(uid, { dbClient, cacheGet, applyBanState, alertDedupe: async () => false });
  await new Promise((r) => setTimeout(r, 20));
  store.set(`ban:gen:${uid}`, "1"); // unban bump gen ระหว่าง query วิ่ง
  store.set(`ban:tomb:${uid}`, "1");
  resolveDb({ data: { id: 1 }, error: null }); // active row เก่าเพิ่งมาถึง
  const r = await p;
  await new Promise((res) => setTimeout(res, 20)); // ให้ fire-and-forget write settle
  assert.equal(r, false, "ผล query เก่าห้ามชนะ tombstone");
  assert.equal(store.has(`ban:active:${uid}`), false, "stale positive write ต้องโดน gen guard บล็อก");
});

test("acceptance c: banUser cache sync พลาดทั้งหมด → ห้าม claim สำเร็จ (cache_unreconciled)", async () => {
  const insertOk = { from: () => ({
    insert: async () => ({ error: null }),
    select: () => ({ eq: () => ({ is: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { id: 1 }, error: null }) }) }) }) }),
  }) };
  const c = memCache();
  const r = await banUser({ lineUserId: "U" + "5".repeat(32), reason: "x", bannedBy: "admin" }, {
    dbClient: insertOk,
    ...c,
    applyBanState: async () => ({ ok: false, reason: "no_redis" }),
    lockRenewIntervalMs: 10,
  });
  // Codex รอบ 6: DB แบนแล้วแต่ enforcement ยังไม่มีผล = ห้ามรายงานว่าสำเร็จ
  assert.equal(r.ok, false);
  assert.equal(r.reason, "cache_unreconciled");
  assert.equal(r.dbBanned, true);
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
  let seq1 = 0;
  const deps = {
    acquireLease: async (k) => { if (kv.has(k + ":L")) return null; kv.set(k + ":L", `t${++seq1}`); return kv.get(k + ":L"); },
    releaseLease: async (k, t) => { if (kv.get(k + ":L") === t) kv.delete(k + ":L"); },
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
  let seq2 = 0;
  const deps = {
    acquireLease: async (k) => { if (kv.has(k + ":L")) return null; kv.set(k + ":L", `t${++seq2}`); return kv.get(k + ":L"); },
    releaseLease: async (k, t) => { if (kv.get(k + ":L") === t) kv.delete(k + ":L"); },
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

test("resurrection race: stale positive write หลัง unban เขียนไม่เข้า (gen-guarded)", async () => {
  const uid = "U" + "2".repeat(32);
  const c = memCache();
  let resolveDb;
  const dbClient = { from: () => ({ select: () => ({ eq: () => ({ is: () => ({ limit: () => ({
    maybeSingle: () => new Promise((r) => { resolveDb = r; }),
  }) }) }) }) }) };
  // isBanned เริ่ม (จับ gen ตอนเริ่ม) → DB ค้าง
  const p = isBanned(uid, { dbClient, cacheGet: c.cacheGet, applyBanState: c.applyBanState, alertDedupe: async () => false });
  await new Promise((r) => setTimeout(r, 20));
  // unban สำเร็จระหว่างนั้น: bump gen + tombstone + ลบ active (จำลอง unbanUser)
  await c.bumpGen(`ban:gen:${uid}`);
  c.m.set(`ban:tomb:${uid}`, "1");
  c.m.delete(`ban:active:${uid}`);
  // active row เก่าเพิ่ง settle — write กลับใช้ gen เก่า → applyIfGen ไม่ apply
  resolveDb({ data: { id: 1 }, error: null });
  await p;
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(c.m.has(`ban:active:${uid}`), false, "stale write ต้องโดน gen guard บล็อก");
  // tombstone หมดอายุ → เช็คใหม่กับ DB ที่ปลดแบนแล้ว ต้อง false ถาวร
  c.m.delete(`ban:tomb:${uid}`);
  const { client: cleanDb } = dbSelectCounter({ banned: false });
  assert.equal(
    await isBanned(uid, { dbClient: cleanDb, cacheGet: c.cacheGet, applyBanState: c.applyBanState, alertDedupe: async () => false }),
    false,
    "หลัง tomb expiry ห้ามแบนซ้ำจาก cache ผี",
  );
});

test("race จริง A (Codex รอบ 5): isBanned ค้างกลาง query → banUser สำเร็จ → ต้องคืน true ไม่ใช่ผล DB เก่า", async () => {
  const uid = "U" + "e".repeat(32);
  const c = memCache();
  // DB ของ isBanned: ครั้งแรกค้าง (จะ resolve เป็น null เก่า) · ครั้งถัดไปเห็นแบนแล้ว
  let resolveFirst;
  let readN = 0;
  const readerDb = { from: () => ({ select: () => ({ eq: () => ({ is: () => ({ limit: () => ({
    maybeSingle: () => {
      readN += 1;
      if (readN === 1) return new Promise((r) => { resolveFirst = r; });
      return Promise.resolve({ data: { id: 1 }, error: null });
    },
  }) }) }) }) }) };
  const p = isBanned(uid, { dbClient: readerDb, ...c, alertDedupe: async () => false });
  await new Promise((r) => setTimeout(r, 20));
  // banUser จริงวิ่งจนจบระหว่าง query แรกยังค้าง (lock ว่าง — isBanned ไม่ถือ lock)
  const insertOk = { from: () => ({ insert: async () => ({ error: null }) }) };
  const ban = await banUser({ lineUserId: uid, reason: "x", bannedBy: "admin" }, { dbClient: insertOk, ...c });
  assert.equal(ban.ok, true);
  assert.equal(ban.cacheSynced, true);
  // ผล DB เก่า (ยังไม่เห็นแบน) เพิ่งมาถึง
  resolveFirst({ data: null, error: null });
  const r = await p;
  assert.equal(r, true, "gen ขยับระหว่าง query — ห้ามคืนผลเก่า ต้องเห็นแบนใหม่");
});

test("race จริง B (Codex รอบ 5): unban เก่า DB ช้า + lock หลุด → ban ใหม่ต้องไม่โดน tombstone ทับ", async () => {
  const uid = "U" + "f".repeat(31) + "0";
  const c = memCache();
  // unban: DB update ค้าง (ช้า)
  let resolveUpdate;
  const slowUnbanDb = { from: () => ({ update: () => ({ eq: () => ({ is: () => ({
    select: () => new Promise((r) => { resolveUpdate = r; }),
  }) }) }) }) };
  const unbanP = unbanUser({ lineUserId: uid, unbannedBy: "admin" }, { dbClient: slowUnbanDb, ...c });
  await new Promise((r) => setTimeout(r, 20));
  // lock ของ unban หมดอายุ (จำลอง TTL) แล้ว ban ใหม่วิ่งจนจบ
  c.expireLock(`ban:mutex:${uid}`);
  const insertOk = { from: () => ({ insert: async () => ({ error: null }) }) };
  const ban = await banUser({ lineUserId: uid, reason: "re-ban", bannedBy: "admin" }, { dbClient: insertOk, ...c });
  assert.equal(ban.ok, true);
  assert.equal(ban.cacheSynced, true);
  // DB ของ unban เก่าเพิ่งตอบ — ต้องเช็ค lock ก่อนแตะ cache แล้วถอย
  resolveUpdate({ data: [{ id: 1 }], error: null });
  const unban = await unbanP;
  assert.equal(unban.ok, true);
  assert.equal(unban.cacheCleared, false, "เสีย lock = ห้ามอ้างว่าล้างแล้ว");
  // effective state ต้องเป็น "แบน" ตาม DB (active ban ใหม่)
  assert.equal(c.m.get(`ban:active:${uid}`), "1", "positive ของ ban ใหม่ต้องรอด");
  assert.equal(c.m.has(`ban:tomb:${uid}`), false, "tombstone ของ unban เก่าห้ามถูกทิ้งไว้");
  const bannedDb = { from: () => ({ select: () => ({ eq: () => ({ is: () => ({ limit: () => ({
    maybeSingle: async () => ({ data: { id: 2 }, error: null }),
  }) }) }) }) }) };
  assert.equal(
    await isBanned(uid, { dbClient: bannedDb, ...c, alertDedupe: async () => false }),
    true,
    "effective isBanned ต้องตรง DB (แบนอยู่)",
  );
});

test("mutation lock: ban/unban คนเดียวกันพร้อมกัน → ตัวหลังรอ/ได้ busy ไม่สลับกลางคัน", async () => {
  const uid = "U" + "f".repeat(31) + "1";
  const c = memCache();
  // จองล็อกไว้เอง (จำลอง mutation อื่นถืออยู่ตลอด window)
  const held = await c.acquireLock(`ban:mutex:${uid}`, 8000);
  assert.ok(held);
  const insertOk = { from: () => ({ insert: async () => ({ error: null }) }) };
  const t0 = Date.now();
  const r = await banUser({ lineUserId: uid, reason: "x", bannedBy: "admin" }, { dbClient: insertOk, ...c });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "busy");
  assert.ok(Date.now() - t0 >= 1900, "ต้องรอจนหมดงบก่อนคืน busy");
});

test("already_banned → resync cache เต็มชุด: ล้าง neg/tomb + ตั้ง positive + cacheSynced ตามจริง", async () => {
  const uid = "U" + "9".repeat(31) + "b";
  const c = memCache();
  // สภาพพัง: มี neg + tomb ค้าง (เคย unban) แต่ DB มี active ban → insert ชน unique
  c.m.set(`ban:neg:${uid}`, "1");
  c.m.set(`ban:tomb:${uid}`, "1");
  const dupErr = { from: () => ({ insert: async () => ({ error: { code: "23505", message: "duplicate key idx_banned_users_active" } }) }) };
  const r = await banUser({ lineUserId: uid, reason: "x", bannedBy: "admin" }, { dbClient: dupErr, ...c });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "already_banned");
  assert.equal(r.cacheSynced, true);
  assert.equal(c.m.has(`ban:neg:${uid}`), false, "negative cache ต้องถูกล้าง");
  assert.equal(c.m.has(`ban:tomb:${uid}`), false, "tombstone ต้องถูกล้าง");
  assert.equal(c.m.get(`ban:active:${uid}`), "1", "positive ต้องถูกตั้ง — isBanned เห็นแบนทันที");
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
    dbClient: client, cacheGet: async () => null,
    applyBanState: async () => ({ ok: true, applied: true }),
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

/* ---------------- Codex รอบ 4: identity table + status SSOT ---------------- */

test("identity classifier: เคสจริงที่เคยหลุด/จัดผิด (Codex รอบ 4)", () => {
  const AI = ["เป็น AI หรือคนตอบครับ", "AI หรือคน", "คนหรือ AI", "ใช้ ChatGPT ไหม", "ใช้จีพีทีไหม", "นี่แชทบอทปะ", "บอทหรือคน", "สรุป เป็น ai ใช้ไหม", "เป็นบอทใช่ไหม"];
  for (const t of AI) assert.equal(classifyIdentityQuestion(t), "ai_bot", t);
  // "ใครตอบ" = who — ห้ามแจ้งเตือนผิดเป็น ai_bot
  assert.equal(classifyIdentityQuestion("ใครตอบ"), "who");
  assert.equal(classifyIdentityQuestion("ใครดูแลแชทนี้"), "who");
  const NONE = ["สวัสดีครับ", "ขอบคุณครับ", "ผลออกยังครับ", "ราคาเท่าไหร่", "จัดชุด", "อาจารย์ครับ"];
  for (const t of NONE) assert.equal(classifyIdentityQuestion(t), null, t);
});

test("status SSOT: router/troll/repeat ใช้ isStatusQueryText ตัวเดียวกัน + เคสบ่นรอนาน", async () => {
  const { isStatusQueryText } = await import("../src/services/scanV2/statusQuery.util.js");
  for (const t of ["ผลออกยัง", "รอนานแล้วครับ", "รอตรวจนานแล้ว", "รอมา 10 นาทีแล้ว", "ถึงไหนแล้ว"]) {
    assert.equal(isStatusQueryText(t), true, t);
  }
  for (const t of ["สวัสดีครับ", "จัดชุด", "รอเพื่อนก่อนนะ"]) {
    assert.equal(isStatusQueryText(t), false, t);
  }
  // wiring: ทั้ง webhook (troll guard + router) และ repeat detector ต้อง import SSOT
  assert.ok(WEBHOOK.split("statusQuery.util.js").length >= 3, "webhook ต้องใช้ SSOT ทั้ง troll guard และ router");
  const alerts = fs.readFileSync(path.join(process.cwd(), "src", "services", "monitor", "customerAlerts.service.js"), "utf8");
  assert.ok(alerts.includes("statusQuery.util.js"), "repeat detector ต้องใช้ SSOT เดียวกัน");
  assert.ok(!alerts.includes("STATUS_QUERY_RE ="), "ห้ามมี regex สำเนาใน detector");
});

/* ---------------- Codex รอบ 5: typed status classification ---------------- */

test("typed status: เงิน/สิทธิ์ห้ามหลุดไป scan route (probe ทั้ง 4 ของ Codex)", async () => {
  const { classifyStatusQuery, shouldResultStatusRouterHandle } = await import("../src/services/scanV2/statusQuery.util.js");
  assert.equal(classifyStatusQuery("สถานะสลิป"), "payment_status");
  assert.equal(classifyStatusQuery("สถานะการจ่ายเงิน"), "payment_status");
  assert.equal(classifyStatusQuery("รอตรวจสลิปนานแล้ว"), "payment_status");
  assert.equal(classifyStatusQuery("สถานะสมาชิก"), "entitlement_status");
  assert.equal(classifyStatusQuery("สิทธิ์เหลือกี่ครั้ง"), "entitlement_status");
  assert.equal(classifyStatusQuery("ผลออกยังครับ"), "scan_status");
  assert.equal(classifyStatusQuery("ผลสแกนถึงไหนแล้ว"), "scan_status");
  assert.equal(classifyStatusQuery("รอนานแล้วครับ"), "generic_wait");
  assert.equal(classifyStatusQuery("สวัสดีครับ"), "other");
  // router รับเฉพาะ scan_status · generic_wait ต้องไม่มีเรื่องเงินค้าง
  assert.equal(shouldResultStatusRouterHandle({ kind: "payment_status" }), false);
  assert.equal(shouldResultStatusRouterHandle({ kind: "entitlement_status" }), false);
  assert.equal(shouldResultStatusRouterHandle({ kind: "scan_status", hasPendingPayment: true }), true);
  assert.equal(shouldResultStatusRouterHandle({ kind: "generic_wait", hasPendingPayment: true }), false);
  assert.equal(shouldResultStatusRouterHandle({ kind: "generic_wait", hasPendingPayment: false }), true);
});

test("router wiring: webhook มอบการตัดสินให้ resolveResultStatusRouting (behavior เต็มอยู่ใน resultStatusRouting.util.test.js)", () => {
  const fn = WEBHOOK.slice(
    WEBHOOK.indexOf("async function maybeHandleResultStatusQuery"),
    WEBHOOK.indexOf("async function", WEBHOOK.indexOf("async function maybeHandleResultStatusQuery") + 10),
  );
  assert.ok(fn.includes("resolveResultStatusRouting"), "ต้องใช้ routing util (typed + fail-closed)");
  assert.ok(fn.includes("hasActivePaymentForLineUserId"), "payment evidence ต้องมาจาก payments store SSOT");
  assert.ok(!fn.includes('"pending"'), "ห้ามเขียนลิสต์สถานะ payment ซ้ำใน webhook");
  assert.ok(!fn.includes("if (!isStatusQueryText(t)) return false"), "ห้ามใช้ broad boolean ตัดสิน route");
});

test("alert lease renewal (Codex รอบ 7): lease มี TTL จริง — renew กันคู่แข่งชิงได้ · ไม่ renew = ชิงได้", async () => {
  // fake lease ที่มี TTL จริง (เดิมไม่มี expiry เลยพิสูจน์ไม่ได้ว่า renew ช่วยจริง)
  function leaseStore() {
    const map = new Map(); // key → { token, expiresAt }
    let seq = 0;
    return {
      acquire: async (k, ttlMs) => {
        const cur = map.get(k);
        if (cur && cur.expiresAt > Date.now()) return null;
        const token = `lt${++seq}`;
        map.set(k, { token, expiresAt: Date.now() + (ttlMs || 60000) });
        return token;
      },
      renew: async (k, t, ttlMs) => {
        const cur = map.get(k);
        if (!cur || cur.token !== t) return false;
        cur.expiresAt = Date.now() + (ttlMs || 60000);
        return true;
      },
      release: async (k, t) => { const cur = map.get(k); if (cur && cur.token === t) map.delete(k); },
    };
  }

  // (1) มี renewal → หลังเลย TTL เดิม คู่แข่งยังชิงไม่ได้
  {
    const kv = new Map();
    const ls = leaseStore();
    let resolveSend;
    const LEASE_TTL = 60;
    await sendCustomerAlert(
      { type: "rw", userId: "U7", dedupeSec: 3600, telegramText: "t" },
      {
        getValue: async (k) => (kv.has(k) ? kv.get(k) : null),
        setLargeValueWithTtl: async (k, v) => { kv.set(k, v); },
        acquireLease: async (k) => ls.acquire(k, LEASE_TTL),
        releaseLease: ls.release,
        renewLease: async (k, t) => ls.renew(k, t, LEASE_TTL),
        sendTelegramText: () => new Promise((r) => { resolveSend = r; }),
        channelTimeoutMs: 30,
        renewIntervalMs: 15,
      },
    );
    await new Promise((r) => setTimeout(r, LEASE_TTL + 40)); // เลย TTL เดิมไปแล้ว
    assert.equal(await ls.acquire("alert:rw:tg:U7:lease", LEASE_TTL), null, "renew ต้องกันคู่แข่งชิง lease ได้จริง");
    resolveSend({ ok: true });
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(kv.get("alert:rw:tg:U7"), "1", "late success ต้องตั้ง sent marker");
    const afterSettle = Date.now();
    await new Promise((r) => setTimeout(r, LEASE_TTL + 40));
    assert.ok(await ls.acquire("alert:rw:tg:U7:lease", LEASE_TTL), "หลัง settle ต้องหยุด renew (lease ปล่อยตามอายุ)");
    assert.ok(Date.now() > afterSettle);
  }

  // (2) ไม่มี renewal (renew ล้มเหลว) → เลย TTL แล้วคู่แข่งชิงได้ = เทสต์นี้ไวต่อ regression จริง
  {
    const kv2 = new Map();
    const ls2 = leaseStore();
    const LEASE_TTL = 60;
    await sendCustomerAlert(
      { type: "rz", userId: "U8", dedupeSec: 3600, telegramText: "t" },
      {
        getValue: async (k) => (kv2.has(k) ? kv2.get(k) : null),
        setLargeValueWithTtl: async (k, v) => { kv2.set(k, v); },
        acquireLease: async (k) => ls2.acquire(k, LEASE_TTL),
        releaseLease: ls2.release,
        renewLease: async () => false, // renew ใช้ไม่ได้
        sendTelegramText: () => new Promise(() => {}),
        channelTimeoutMs: 30,
        renewIntervalMs: 15,
      },
    );
    await new Promise((r) => setTimeout(r, LEASE_TTL + 40));
    assert.ok(await ls2.acquire("alert:rz:tg:U8:lease", LEASE_TTL), "ไม่มี renew = lease หมดอายุจริง (ยืนยันว่าเทสต์จับความต่างได้)");
  }
});

test("alert lease renewal (Codex รอบ 6): renew จริงระหว่างส่ง + คู่แข่งชิง lease ไม่ได้ + หยุดหลัง settle", async () => {
  const kv = new Map();
  const leases = new Map();
  let renews = 0;
  let seq = 0;
  let resolveSend;
  const acquireLease = async (k) => {
    if (leases.has(k)) return null;
    const t = `lt${++seq}`;
    leases.set(k, t);
    return t;
  };
  const deps = {
    getValue: async (k) => (kv.has(k) ? kv.get(k) : null),
    setLargeValueWithTtl: async (k, v) => { kv.set(k, v); },
    acquireLease,
    releaseLease: async (k, t) => { if (leases.get(k) === t) leases.delete(k); },
    renewLease: async (k, t) => { if (leases.get(k) !== t) return false; renews += 1; return true; },
    sendTelegramText: () => new Promise((r) => { resolveSend = r; }),
    channelTimeoutMs: 60,
    renewIntervalMs: 10, // inject ให้เทสต์ได้จริง (ไม่ต้องรอ 20 วิ)
  };
  await sendCustomerAlert({ type: "rn", userId: "U7", dedupeSec: 3600, telegramText: "t" }, deps);
  // transport ยังค้าง → renew ต้องเดินต่อ
  await new Promise((r) => setTimeout(r, 60));
  assert.ok(renews >= 2, `ต้อง renew ระหว่าง transport ค้าง (ได้ ${renews})`);
  // คู่แข่ง (process อื่น) ต้องชิง lease ไม่ได้ตราบใดที่ยังถือ
  assert.equal(await acquireLease("alert:rn:tg:U7:lease"), null, "lease ยังถูกถืออยู่ ห้ามชิงไปส่งซ้ำ");
  // late success → sent marker + interval หยุด
  const before = renews;
  resolveSend({ ok: true });
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(kv.get("alert:rn:tg:U7"), "1", "late success ต้องตั้ง sent marker");
  const afterSettle = renews;
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(renews, afterSettle, "interval ต้องหยุดหลัง settle");
  assert.ok(afterSettle >= before);
});

test("blocker repro: ban:neg ค้าง + DB insert ช้าจน lock หมด (ไม่มีคู่แข่ง) → isBanned ต้อง true ทันที", async () => {
  const uid = "U" + "1".repeat(31) + "c";
  const c = memCache();
  c.m.set(`ban:neg:${uid}`, "1"); // negative cache เดิมค้างอยู่ (เคยเช็คว่าไม่แบน)
  let dbInserted = false;
  const slowInsertDb = {
    from: () => ({
      insert: async () => {
        // จำลอง DB ช้า + lock หมดอายุระหว่างนั้น (ไม่มี mutation คู่แข่ง)
        await new Promise((r) => setTimeout(r, 60));
        c.expireLock(`ban:mutex:${uid}`);
        dbInserted = true;
        return { error: null };
      },
      select: () => ({ eq: () => ({ is: () => ({ limit: () => ({
        maybeSingle: async () => (dbInserted ? { data: { id: 1 }, error: null } : { data: null, error: null }),
      }) }) }) }),
    }),
  };
  const r = await banUser({ lineUserId: uid, reason: "x", bannedBy: "admin" }, {
    dbClient: slowInsertDb, ...c, lockRenewIntervalMs: 10, dbTimeoutMs: 5000,
  });
  assert.equal(r.ok, true, "DB แบนสำเร็จ");
  assert.equal(r.cacheSynced, true, "ต้อง reconcile จน enforcement มีผลจริง");
  assert.equal(c.m.has(`ban:neg:${uid}`), false, "negative cache เดิมต้องหายไปแล้ว");
  // effective enforcement: ไม่ต้องรอ 45 วิ
  const bannedDb = { from: () => ({ select: () => ({ eq: () => ({ is: () => ({ limit: () => ({
    maybeSingle: async () => ({ data: { id: 1 }, error: null }),
  }) }) }) }) }) };
  assert.equal(
    await isBanned(uid, { dbClient: bannedDb, ...c, alertDedupe: async () => false }),
    true,
    "isBanned ต้อง true ทันทีหลัง banUser",
  );
});

test("reconcile ล้มเหลว → ห้าม claim ว่าแบนสำเร็จ (คืน cache_unreconciled)", async () => {
  const uid = "U" + "1".repeat(31) + "d";
  const c = memCache();
  const insertOk = { from: () => ({
    insert: async () => ({ error: null }),
    select: () => ({ eq: () => ({ is: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { id: 1 }, error: null }) }) }) }) }),
  }) };
  const r = await banUser({ lineUserId: uid, reason: "x", bannedBy: "admin" }, {
    dbClient: insertOk,
    ...c,
    applyBanState: async () => ({ ok: false, reason: "no_redis" }), // cache เขียนไม่ได้เลย
    lockRenewIntervalMs: 10,
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "cache_unreconciled");
  assert.equal(r.dbBanned, true, "ต้องบอกว่า DB บันทึกแล้วเพื่อให้แอดมินรู้สถานะจริง");
  assert.equal(r.cacheSynced, false);
});

test("lock renewal: DB ช้ากว่า TTL แต่ renew ได้ → ยังถือ lock, sync ตรงทาง ไม่ต้อง reconcile", async () => {
  const uid = "U" + "1".repeat(31) + "e";
  const c = memCache();
  let renews = 0;
  const slowDb = { from: () => ({
    insert: async () => { await new Promise((r) => setTimeout(r, 60)); return { error: null }; },
    select: () => ({ eq: () => ({ is: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { id: 1 }, error: null }) }) }) }) }),
  }) };
  const r = await banUser({ lineUserId: uid, reason: "x", bannedBy: "admin" }, {
    dbClient: slowDb,
    ...c,
    renewLock: async (k, t) => { renews += 1; return c.locks.get(k) === t; },
    lockRenewIntervalMs: 10,
  });
  assert.equal(r.ok, true);
  assert.equal(r.cacheSynced, true);
  assert.ok(renews >= 2, `ต้อง renew ระหว่าง DB call จริง (ได้ ${renews})`);
  assert.equal(c.m.get(`ban:active:${uid}`), "1");
});

test("DB op bounded: insert ค้างไม่จบ → คืน db_outcome_unknown ภายใน dbTimeoutMs ไม่แขวน (Codex รอบ 7)", async () => {
  const uid = "U" + "1".repeat(31) + "f";
  const c = memCache();
  const hangDb = {
    from: () => ({
      insert: () => new Promise(() => {}),
      select: () => ({ eq: () => ({ is: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }),
    }),
  };
  const t0 = Date.now();
  const r = await banUser({ lineUserId: uid, reason: "x", bannedBy: "admin" }, {
    dbClient: hangDb, ...c, lockRenewIntervalMs: 10, dbTimeoutMs: 150,
    finalizerWaitMs: 60, finalizerCapMs: 120,
  });
  assert.equal(r.ok, false);
  // timeout = ไม่รู้ผล (ไม่ใช่ล้มเหลว) + enforcement ถูกกันไว้ + มีเจ้าของงานตามต่อ
  assert.equal(r.reason, "db_outcome_unknown");
  assert.equal(r.enforcementHeld, true);
  assert.ok(r.pendingFinalizer);
  assert.ok(Date.now() - t0 < 3000);
  await r.pendingFinalizer;
});

test("unban เสีย lock + มี re-ban ใหม่ใน DB → reconcile คืนสถานะแบน ไม่ claim ว่าปลดแล้ว", async () => {
  const uid = "U" + "2".repeat(31) + "a";
  const c = memCache();
  const dbWithNewBan = {
    from: () => ({
      update: () => ({ eq: () => ({ is: () => ({ select: async () => {
        await new Promise((r) => setTimeout(r, 40));
        c.expireLock(`ban:mutex:${uid}`); // lock หมดระหว่าง DB update
        return { data: [{ id: 1 }], error: null };
      } }) }) }),
      // DB authoritative: มี active ban ใหม่ (คนถูกแบนซ้ำระหว่างนั้น)
      select: () => ({ eq: () => ({ is: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { id: 9 }, error: null }) }) }) }) }),
    }),
  };
  const r = await unbanUser({ lineUserId: uid, unbannedBy: "admin" }, {
    dbClient: dbWithNewBan, ...c, lockRenewIntervalMs: 10,
  });
  assert.equal(r.ok, true);
  assert.equal(r.cacheCleared, false, "มี ban ใหม่กว่า — ห้ามอ้างว่าล้างสถานะแล้ว");
  assert.equal(c.m.get(`ban:active:${uid}`), "1", "cache ต้องตรง DB (ยังแบน)");
  assert.equal(c.m.has(`ban:tomb:${uid}`), false);
});

/* ---------------- Codex รอบ 7: DB timeout = unknown outcome ---------------- */

test("A) insert timeout แล้ว commit ทีหลัง → enforcement กันไว้ก่อน + finalizer ทำ cache ตรง DB", async () => {
  const uid = "U" + "3".repeat(31) + "a";
  const c = memCache();
  c.m.set(`ban:neg:${uid}`, "1"); // negative cache เดิมค้าง (เคยเช็คว่าไม่แบน)
  let committed = false;
  let releaseInsert;
  const lateDb = {
    from: () => ({
      insert: () => new Promise((r) => { releaseInsert = () => { committed = true; r({ error: null }); }; }),
      select: () => ({ eq: () => ({ is: () => ({ limit: () => ({
        maybeSingle: async () => (committed ? { data: { id: 1 }, error: null } : { data: null, error: null }),
      }) }) }) }),
    }),
  };
  const r = await banUser({ lineUserId: uid, reason: "x", bannedBy: "admin" }, {
    dbClient: lateDb, ...c, dbTimeoutMs: 40, lockRenewIntervalMs: 10, finalizerWaitMs: 2000,
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "db_outcome_unknown", "timeout = ไม่รู้ผล ไม่ใช่ db_error");
  assert.equal(r.enforcementHeld, true);
  // ระหว่างยังไม่รู้ผล: ต้อง fail-closed (positive ถูกกันไว้ + neg หายแล้ว)
  assert.equal(c.m.get(`ban:active:${uid}`), "1");
  assert.equal(c.m.has(`ban:neg:${uid}`), false, "negative cache เดิมต้องถูกล้างก่อนแตะ DB");
  const noDbRead = { from: () => { throw new Error("must not read db"); } };
  assert.equal(await isBanned(uid, { dbClient: noDbRead, ...c, alertDedupe: async () => false }), true);
  // DB commit ทีหลัง → finalizer reconcile ให้ตรง
  releaseInsert();
  const rec = await r.pendingFinalizer;
  assert.equal(rec.ok, true);
  assert.equal(rec.banned, true);
  assert.equal(c.m.get(`ban:active:${uid}`), "1");
  assert.equal(c.m.has(`ban:neg:${uid}`), false);
});

test("A2) insert timeout แล้ว DB ปฏิเสธจริงทีหลัง → finalizer ถอน enforcement ออก (ไม่แบนค้าง)", async () => {
  const uid = "U" + "3".repeat(31) + "b";
  const c = memCache();
  let releaseInsert;
  const failLateDb = {
    from: () => ({
      insert: () => new Promise((r) => { releaseInsert = () => r({ error: { code: "42501", message: "denied" } }); }),
      select: () => ({ eq: () => ({ is: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }),
    }),
  };
  const r = await banUser({ lineUserId: uid, reason: "x", bannedBy: "admin" }, {
    dbClient: failLateDb, ...c, dbTimeoutMs: 40, lockRenewIntervalMs: 10, finalizerWaitMs: 2000,
  });
  assert.equal(r.reason, "db_outcome_unknown");
  assert.equal(c.m.get(`ban:active:${uid}`), "1", "ระหว่างไม่รู้ผล = กันไว้ก่อน");
  releaseInsert();
  const rec = await r.pendingFinalizer;
  assert.equal(rec.ok, true);
  assert.equal(rec.banned, false, "DB ไม่มี active ban → ต้องถอน");
  assert.equal(c.m.has(`ban:active:${uid}`), false, "positive cache ต้องถูกล้าง ไม่แบนค้าง");
  assert.equal(c.m.get(`ban:tomb:${uid}`), "1");
});

test("B) unban timeout แล้ว commit ทีหลัง → cache ไม่ค้างแบน 30 วัน", async () => {
  const uid = "U" + "3".repeat(31) + "c";
  const c = memCache();
  c.m.set(`ban:active:${uid}`, "1"); // แบนอยู่
  let unbanned = false;
  let releaseUpdate;
  const lateUnbanDb = {
    from: () => ({
      update: () => ({ eq: () => ({ is: () => ({
        select: () => new Promise((r) => { releaseUpdate = () => { unbanned = true; r({ data: [{ id: 1 }], error: null }); }; }),
      }) }) }),
      select: () => ({ eq: () => ({ is: () => ({ limit: () => ({
        maybeSingle: async () => (unbanned ? { data: null, error: null } : { data: { id: 1 }, error: null }),
      }) }) }) }),
    }),
  };
  const r = await unbanUser({ lineUserId: uid, unbannedBy: "admin" }, {
    dbClient: lateUnbanDb, ...c, dbTimeoutMs: 40, lockRenewIntervalMs: 10, finalizerWaitMs: 2000,
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "db_outcome_unknown");
  assert.equal(r.cacheCleared, false);
  assert.equal(c.m.get(`ban:active:${uid}`), "1", "ยังไม่รู้ผล = คงแบนไว้ก่อน (ปลอดภัย)");
  releaseUpdate();
  const rec = await r.pendingFinalizer;
  assert.equal(rec.ok, true);
  assert.equal(rec.banned, false);
  assert.equal(c.m.has(`ban:active:${uid}`), false, "หลัง DB ยืนยันปลดแล้ว positive ต้องหาย ไม่ค้าง 30 วัน");
});

test("C) DB ไม่ settle เลย → คง fail-closed ไม่ reconcile ก่อนรู้ผล + entry ค้างให้ sweeper (Codex รอบ 9)", async () => {
  const uid = "U" + "3".repeat(31) + "d";
  const c = memCache();
  const neverDb = {
    from: () => ({
      insert: () => new Promise(() => {}),
      select: () => ({ eq: () => ({ is: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }),
    }),
  };
  const t0 = Date.now();
  const r = await banUser({ lineUserId: uid, reason: "x", bannedBy: "admin" }, {
    dbClient: neverDb, ...c, dbTimeoutMs: 40, lockRenewIntervalMs: 10,
    finalizerWaitMs: 60, finalizerCapMs: 120,
  });
  assert.equal(r.reason, "db_outcome_unknown");
  assert.ok(r.pendingFinalizer, "ต้องมีเจ้าของงานเสมอ");
  const rec = await r.pendingFinalizer;
  assert.ok(Date.now() - t0 < 3000, "ต้องไม่แขวน");
  // ยังไม่รู้ผล → ห้าม reconcile พลิก state — fail-closed คงอยู่ + งานค้างในคิว
  assert.equal(rec.pending, true);
  assert.equal(c.m.get(`ban:active:${uid}`), "1", "fail-closed ต้องคงอยู่จนกว่าจะรู้ผล");
  assert.equal(c.queueHas(uid, "ban"), true, "entry ต้องค้างให้ sweeper ยืนยันผลตาม DB");
});

test("D) reconcile DB read ค้าง → bounded ไม่แขวน และรายงานว่าไม่สำเร็จ", async () => {
  const uid = "U" + "3".repeat(31) + "e";
  const c = memCache();
  const hangReadDb = {
    from: () => ({
      insert: async () => ({ error: null }),
      select: () => ({ eq: () => ({ is: () => ({ limit: () => ({ maybeSingle: () => new Promise(() => {}) }) }) }) }),
    }),
  };
  const t0 = Date.now();
  const r = await banUser({ lineUserId: uid, reason: "x", bannedBy: "admin" }, {
    dbClient: hangReadDb,
    ...c,
    applyBanState: async () => ({ ok: false, reason: "no_redis" }), // บังคับให้ต้อง reconcile
    dbTimeoutMs: 60,
    lockRenewIntervalMs: 10,
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "cache_unreconciled");
  assert.ok(Date.now() - t0 < 4000, `reconcile ต้อง bounded (ใช้ ${Date.now() - t0}ms)`);
});

/* ---------------- Codex รอบ 8: durable reconciliation (late settle / restart) ---------------- */

test("E) ban commit หลัง finalizer checkpoint → เจ้าของไม่ปล่อย reconcile จนกว่าจะ settle + คิวถูกเคลียร์", async () => {
  const uid = "U" + "4".repeat(31) + "a";
  const c = memCache();
  let committed = false;
  let release;
  const lateDb = {
    from: () => ({
      insert: () => new Promise((r) => { release = () => { committed = true; r({ error: null }); }; }),
      select: () => ({ eq: () => ({ is: () => ({ limit: () => ({
        maybeSingle: async () => (committed ? { data: { id: 1 }, error: null } : { data: null, error: null }),
      }) }) }) }),
    }),
  };
  const r = await banUser({ lineUserId: uid, reason: "x", bannedBy: "admin" }, {
    dbClient: lateDb, ...c, dbTimeoutMs: 30, lockRenewIntervalMs: 10,
    finalizerWaitMs: 40, finalizerCapMs: 3000, // checkpoint แรกมาก่อน commit
  });
  assert.equal(r.reason, "db_outcome_unknown");
  assert.equal(r.durableOwner, true);
  assert.equal(c.queueHas(uid, "ban"), true, "ต้องมี entry ในคิว durable ทันที");
  // Codex รอบ 9 acceptance A: ระหว่างรอ late commit ห้าม reconcile พลิกเป็นไม่แบน
  await new Promise((res) => setTimeout(res, 80));
  const noDbMid = { from: () => { throw new Error("must not read db"); } };
  assert.equal(
    await isBanned(uid, { dbClient: noDbMid, ...c, alertDedupe: async () => false }),
    true,
    "ก่อน DB settle ต้องยังแบน (fail-closed คงอยู่ ไม่ถูก reconcile ทับ)",
  );
  release();
  const rec = await r.pendingFinalizer;
  assert.equal(rec.ok, true);
  assert.equal(rec.banned, true, "reconcile รอบหลัง settle ต้องเห็นแบน");
  assert.equal(c.m.get(`ban:active:${uid}`), "1", "cache ต้องลงเอยตรง DB");
  assert.equal(c.queueHas(uid, "ban"), false, "งานจบแล้ว (ผลตรง intent) ต้องออกจากคิว");
});

test("F) unban commit หลัง checkpoint → positive cache ต้องไม่ค้างแบน + คิวถูกเคลียร์", async () => {
  const uid = "U" + "4".repeat(31) + "b";
  const c = memCache();
  c.m.set(`ban:active:${uid}`, "1");
  let unbanned = false;
  let release;
  const lateDb = {
    from: () => ({
      update: () => ({ eq: () => ({ is: () => ({
        select: () => new Promise((r) => { release = () => { unbanned = true; r({ data: [{ id: 1 }], error: null }); }; }),
      }) }) }),
      select: () => ({ eq: () => ({ is: () => ({ limit: () => ({
        maybeSingle: async () => (unbanned ? { data: null, error: null } : { data: { id: 1 }, error: null }),
      }) }) }) }),
    }),
  };
  const r = await unbanUser({ lineUserId: uid, unbannedBy: "admin" }, {
    dbClient: lateDb, ...c, dbTimeoutMs: 30, lockRenewIntervalMs: 10,
    finalizerWaitMs: 40, finalizerCapMs: 3000,
  });
  assert.equal(r.reason, "db_outcome_unknown");
  assert.equal(c.queueHas(uid, "unban"), true);
  // ระหว่างรอ: ยังแบนอยู่ (ปลอดภัย) — ห้ามพลิกก่อน settle
  await new Promise((res) => setTimeout(res, 80));
  assert.equal(c.m.get(`ban:active:${uid}`), "1", "unban ยังไม่ settle = คงแบนไว้");
  release();
  const rec = await r.pendingFinalizer;
  assert.equal(rec.ok, true);
  assert.equal(rec.banned, false);
  assert.equal(c.m.has(`ban:active:${uid}`), false, "ห้ามค้างแบน 30 วันหลัง DB ยืนยันปลด");
  assert.equal(c.queueHas(uid, "unban"), false);
});

test("G) จำลอง process restart: ทิ้ง pendingFinalizer → sweeper ตามงานจากคิว durable ต่อได้", async () => {
  const uid = "U" + "4".repeat(31) + "c";
  const c = memCache();
  let committed = false;
  const stuckDb = {
    from: () => ({
      insert: () => new Promise(() => {}), // process เดิมตายไปพร้อม request
      select: () => ({ eq: () => ({ is: () => ({ limit: () => ({
        maybeSingle: async () => (committed ? { data: { id: 1 }, error: null } : { data: null, error: null }),
      }) }) }) }),
    }),
  };
  const r = await banUser({ lineUserId: uid, reason: "x", bannedBy: "admin" }, {
    dbClient: stuckDb, ...c, dbTimeoutMs: 30, lockRenewIntervalMs: 10,
    finalizerWaitMs: 20, finalizerCapMs: 40,
  });
  assert.equal(r.reason, "db_outcome_unknown");
  // "restart": ทิ้ง promise ทั้งหมด แต่ entry ต้องยังอยู่
  await r.pendingFinalizer.catch(() => {});
  assert.equal(c.queueHas(uid, "ban"), true, "งานที่ยังไม่ settle ต้องค้างในคิว ไม่หายไปกับ process");

  // หลัง restart: DB commit ไปแล้วจริง (connection เดิมตาย) — sweeper กวาดต่อ
  committed = true;
  const { sweepPendingBanReconciles } = await import("../src/services/ban/banReconcileQueue.js");
  const fakeRedis = {
    zrange: async () => [...c.queue.entries()].flatMap(([k, at]) => [k, String(at)]),
    zrem: async (_k, member) => { c.queue.delete(member); },
    zadd: async () => {}, expire: async () => {},
  };
  const { reconcileBanCacheFromDb, observeBanDbState } = await import("../src/services/ban/bannedUsers.repo.js");
  const stats = await sweepPendingBanReconciles({
    getRedis: async () => fakeRedis,
    minSettleMs: 0,
    observe: (u) => observeBanDbState(u, { dbClient: stuckDb }),
    reconcile: (u) => reconcileBanCacheFromDb(u, { dbClient: stuckDb, ...c }),
    clearPendingOp: c.clearPendingOp,
  });
  assert.equal(stats.reconciled, 1);
  assert.equal(c.m.get(`ban:active:${uid}`), "1", "sweeper ต้องทำให้ cache ตรง DB");
  assert.equal(c.queueHas(uid, "ban"), false, "งานเสร็จแล้ว (ผลตรง intent) ต้องออกจากคิว");
});

test("H) sweeper: entry ที่เพิ่ง enqueue (ยังไม่ถึง minSettle) ต้องข้ามไปก่อน ไม่ไปชนเจ้าของเดิม", async () => {
  const { sweepPendingBanReconciles } = await import("../src/services/ban/banReconcileQueue.js");
  const now = Date.now();
  const fakeRedis = {
    zrange: async () => [`U${"5".repeat(32)}|ban|banned|op1`, String(now - 1000)],
    zrem: async () => {}, zadd: async () => {}, expire: async () => {},
  };
  let called = 0;
  const stats = await sweepPendingBanReconciles({
    getRedis: async () => fakeRedis,
    minSettleMs: 60_000,
    now: () => now,
    observe: async () => { called += 1; return { ok: true, banned: true }; },
    reconcile: async () => { called += 1; return { ok: true }; },
  });
  assert.equal(called, 0);
  assert.equal(stats.skipped, 1);
  assert.equal(stats.reconciled, 0);
});

test("maintenance worker: มี sweeper ของคิว reconcile (source contract — งานต้องถูกกวาดหลัง restart)", () => {
  const w = fs.readFileSync(path.join(process.cwd(), "src", "workers", "maintenanceWorker.js"), "utf8");
  assert.ok(w.includes("sweepPendingBanReconciles"), "maintenance worker ต้องกวาดคิว");
  assert.ok(w.includes("reconcileBanCacheFromDb"));
});

/* ---------------- Codex รอบ 9: state-confirmed removal + honesty + ABA ---------------- */

test("B-r9) sweep: ผล DB ไม่ตรง intent → ห้ามลบ entry (ban↔false, unban↔true) + mismatch stat", async () => {
  const { sweepPendingBanReconciles } = await import("../src/services/ban/banReconcileQueue.js");
  const store = new Map([
    ["Ux|ban|banned|op1", Date.now() - 120000],
    ["Uy|unban|unbanned|op2", Date.now() - 120000],
  ]);
  const fakeRedis = {
    zrange: async () => [...store.entries()].flatMap(([k, at]) => [k, String(at)]),
    zrem: async (_k, member) => { store.delete(member); },
    zadd: async () => {}, expire: async () => {},
  };
  const alerts = [];
  let applyCalls = 0;
  const stats = await sweepPendingBanReconciles({
    getRedis: async () => fakeRedis,
    minSettleMs: 0,
    alert: (e, banned) => alerts.push({ uid: e.uid, expected: e.targetState, banned }),
    // DB สวนทาง intent ทั้งคู่: สั่งแบนแต่ DB ว่าไม่แบน / สั่งปลดแต่ DB ว่ายังแบน
    observe: async (uid) => ({ ok: true, banned: uid === "Uy" }),
    reconcile: async () => { applyCalls += 1; return { ok: true, banned: false }; },
  });
  assert.equal(stats.mismatched, 2);
  assert.equal(stats.reconciled, 0);
  assert.equal(applyCalls, 0, "mismatch ห้ามแตะ cache เลย (observe-first — Codex รอบ 10)");
  assert.equal(store.size, 2, "entry ต้องค้างไว้ retry ห้ามลบ (removed=0)");
  assert.equal(alerts.length, 2, "mismatch ต้องแจ้งเตือน");
});

test("C-r9) sweep แรก mismatch → sweep สองหลัง DB ตรง intent → ค่อยลบ + cache ตรง", async () => {
  const { sweepPendingBanReconciles } = await import("../src/services/ban/banReconcileQueue.js");
  const store = new Map([["Uz|ban|banned|op9", Date.now() - 120000]]);
  const fakeRedis = {
    zrange: async () => [...store.entries()].flatMap(([k, at]) => [k, String(at)]),
    zrem: async (_k, member) => { store.delete(member); },
    zadd: async () => {}, expire: async () => {},
  };
  let dbBanned = false; // late commit ยังไม่มา
  let applyCalls = 0;
  const deps = {
    getRedis: async () => fakeRedis,
    minSettleMs: 0,
    alert: () => {},
    observe: async () => ({ ok: true, banned: dbBanned }),
    reconcile: async () => { applyCalls += 1; return { ok: true, banned: dbBanned }; },
  };
  const s1 = await sweepPendingBanReconciles(deps);
  assert.equal(s1.mismatched, 1);
  assert.equal(applyCalls, 0, "รอบ mismatch ห้าม apply");
  assert.equal(store.size, 1, "รอบแรกยังไม่ตรง — ต้องค้าง");
  dbBanned = true; // late commit มาถึงแล้ว
  const s2 = await sweepPendingBanReconciles(deps);
  assert.equal(s2.reconciled, 1);
  assert.equal(applyCalls, 1, "apply เฉพาะหลัง DB ตรง");
  assert.equal(store.size, 0, "DB ตรง intent แล้วค่อยลบ");
});

test("D-r9) honesty: applyState/enqueue ล้ม → enforcementHeld/durableOwner ต้อง false ตามจริง", async () => {
  // (1) pre-write cache ล้ม → enforcementHeld:false
  const uid1 = "U" + "6".repeat(31) + "a";
  const c1 = memCache();
  const hangDb = {
    from: () => ({
      insert: () => new Promise(() => {}),
      select: () => ({ eq: () => ({ is: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }),
    }),
  };
  const r1 = await banUser({ lineUserId: uid1, reason: "x", bannedBy: "admin" }, {
    dbClient: hangDb, ...c1,
    applyBanState: async () => ({ ok: false, reason: "no_redis" }),
    dbTimeoutMs: 40, lockRenewIntervalMs: 10, finalizerWaitMs: 30, finalizerCapMs: 60,
  });
  assert.equal(r1.enforcementHeld, false, "เขียน fail-closed ไม่เข้า ห้ามอ้างว่ากันไว้แล้ว");
  await r1.pendingFinalizer;

  // (2) enqueue ล้ม → reason ใหม่ + durableOwner:false
  const uid2 = "U" + "6".repeat(31) + "b";
  const c2 = memCache();
  const r2 = await banUser({ lineUserId: uid2, reason: "x", bannedBy: "admin" }, {
    dbClient: hangDb, ...c2,
    enqueueReconcile: async () => ({ ok: false }),
    alertDedupe: async () => false,
    dbTimeoutMs: 40, lockRenewIntervalMs: 10, finalizerWaitMs: 30, finalizerCapMs: 60,
  });
  assert.equal(r2.reason, "reconcile_queue_unavailable");
  assert.equal(r2.durableOwner, false, "enqueue ล้ม = ไม่มี durable owner ห้ามอ้าง");
  assert.equal(r2.enforcementHeld, true, "cache กันไว้ได้จริง (applyState ปกติ)");
  await r2.pendingFinalizer;
});

test("E-r9) reconcile ล้มหลัง op settle → entry ห้ามถูกลบ (sweeper ตามต่อ)", async () => {
  const uid = "U" + "6".repeat(31) + "c";
  const c = memCache();
  let applyCalls = 0;
  let release;
  const lateDb = {
    from: () => ({
      insert: () => new Promise((r) => { release = () => r({ error: null }); }),
      select: () => ({ eq: () => ({ is: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { id: 1 }, error: null }) }) }) }) }),
    }),
  };
  const r = await banUser({ lineUserId: uid, reason: "x", bannedBy: "admin" }, {
    dbClient: lateDb, ...c,
    // pre-write (ครั้งแรก) สำเร็จ · หลังจากนั้น (reconcile ใน finalizer) ล้มหมด
    applyBanState: async (genKey, gen, state) => {
      applyCalls += 1;
      if (applyCalls === 1) return c.applyBanState(genKey, gen, state);
      return { ok: false, reason: "no_redis" };
    },
    dbTimeoutMs: 40, lockRenewIntervalMs: 10, finalizerWaitMs: 30, finalizerCapMs: 3000,
  });
  assert.equal(r.reason, "db_outcome_unknown");
  release();
  const rec = await r.pendingFinalizer;
  assert.equal(rec.ok, false, "reconcile ล้ม");
  assert.equal(c.queueHas(uid, "ban"), true, "entry ต้องค้างให้ sweeper ห้ามลบ");
});

test("F-r9) ABA: op เก่า settle ทีหลัง ห้ามลบ entry ของ op ใหม่ (uid+ชนิดเดียวกัน)", async () => {
  const uid = "U" + "6".repeat(31) + "d";
  const c = memCache();
  let release1;
  const db1 = {
    from: () => ({
      insert: () => new Promise((r) => { release1 = () => r({ error: null }); }),
      select: () => ({ eq: () => ({ is: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { id: 1 }, error: null }) }) }) }) }),
    }),
  };
  const r1 = await banUser({ lineUserId: uid, reason: "x", bannedBy: "admin" }, {
    dbClient: db1, ...c, dbTimeoutMs: 40, lockRenewIntervalMs: 10, finalizerWaitMs: 30, finalizerCapMs: 3000,
  });
  assert.equal(r1.reason, "db_outcome_unknown");
  // op ใหม่ชนิดเดียวกัน (จำลอง: enqueue ตรง ๆ ด้วย opId ใหม่ — เช่นหลัง unban/re-ban รอบใหม่)
  const enq2 = await c.enqueueReconcile({ uid, reason: "ban", targetState: "banned", opId: "newer1" });
  assert.equal(enq2.ok, true);
  const membersBefore = [...c.queue.keys()].filter((k) => k.startsWith(`${uid}|ban|`));
  assert.equal(membersBefore.length, 2, "มีทั้ง op เก่าและใหม่ในคิว");
  // op เก่า settle → finalizer เก่าลบเฉพาะ member ของตัวเอง
  release1();
  await r1.pendingFinalizer;
  const membersAfter = [...c.queue.keys()].filter((k) => k.startsWith(`${uid}|ban|`));
  assert.deepEqual(membersAfter, [`${uid}|ban|banned|newer1`], "member ของ op ใหม่ต้องรอด (exact-member removal)");
});

/* ---------------- Codex รอบ 10: observe-first / pending-op guard / honesty ---------------- */

test("A-r10) sweep pending ban + DB ยัง false → fail-closed cache ไม่ถูกแตะ (active คงอยู่ ไม่มี tomb) + entry อยู่", async () => {
  const uid = "U" + "7".repeat(31) + "a";
  const c = memCache();
  // สภาพจริงหลัง ban unknown: fail-closed ตั้ง positive ไว้แล้ว
  c.m.set(`ban:active:${uid}`, "1");
  const store = new Map([[`${uid}|ban|banned|opA`, Date.now() - 120000]]);
  const fakeRedis = {
    zrange: async () => [...store.entries()].flatMap(([k, at]) => [k, String(at)]),
    zrem: async (_k, member) => { store.delete(member); },
    zadd: async () => {}, expire: async () => {},
  };
  const notBannedDb = { from: () => ({ select: () => ({ eq: () => ({ is: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }) }) };
  const { sweepPendingBanReconciles } = await import("../src/services/ban/banReconcileQueue.js");
  const { observeBanDbState, reconcileBanCacheFromDb } = await import("../src/services/ban/bannedUsers.repo.js");
  const stats = await sweepPendingBanReconciles({
    getRedis: async () => fakeRedis,
    minSettleMs: 0,
    alert: () => {},
    observe: (u) => observeBanDbState(u, { dbClient: notBannedDb }),
    reconcile: (u) => reconcileBanCacheFromDb(u, { dbClient: notBannedDb, ...c }),
  });
  assert.equal(stats.mismatched, 1);
  assert.equal(c.m.get(`ban:active:${uid}`), "1", "ผู้ใช้ต้องยังโดนแบนระหว่างรอ late commit");
  assert.equal(c.m.has(`ban:tomb:${uid}`), false, "ห้ามมี tombstone โผล่ (repro ของ Codex)");
  assert.equal(store.size, 1, "entry ค้างไว้ retry");
});

test("B-r10) sweep pending unban + DB ยัง true → active คงอยู่ + entry อยู่ (ไม่พลิกก่อนเวลา)", async () => {
  const uid = "U" + "7".repeat(31) + "b";
  const c = memCache();
  c.m.set(`ban:active:${uid}`, "1"); // pre-hold ของ unban unknown
  const store = new Map([[`${uid}|unban|unbanned|opB`, Date.now() - 120000]]);
  const fakeRedis = {
    zrange: async () => [...store.entries()].flatMap(([k, at]) => [k, String(at)]),
    zrem: async (_k, member) => { store.delete(member); },
    zadd: async () => {}, expire: async () => {},
  };
  const stillBannedDb = { from: () => ({ select: () => ({ eq: () => ({ is: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { id: 1 }, error: null }) }) }) }) }) }) };
  const { sweepPendingBanReconciles } = await import("../src/services/ban/banReconcileQueue.js");
  const { observeBanDbState, reconcileBanCacheFromDb } = await import("../src/services/ban/bannedUsers.repo.js");
  const stats = await sweepPendingBanReconciles({
    getRedis: async () => fakeRedis,
    minSettleMs: 0,
    alert: () => {},
    observe: (u) => observeBanDbState(u, { dbClient: stillBannedDb }),
    reconcile: (u) => reconcileBanCacheFromDb(u, { dbClient: stillBannedDb, ...c }),
  });
  assert.equal(stats.mismatched, 1);
  assert.equal(c.m.get(`ban:active:${uid}`), "1");
  assert.equal(store.size, 1);
});

test("C-r10) DB match แล้ว → apply cache + ลบ exact member + เคลียร์ pending guard", async () => {
  const uid = "U" + "7".repeat(31) + "c";
  const c = memCache();
  c.pendingOps.set(uid, "opC");
  const store = new Map([[`${uid}|ban|banned|opC`, Date.now() - 120000]]);
  const fakeRedis = {
    zrange: async () => [...store.entries()].flatMap(([k, at]) => [k, String(at)]),
    zrem: async (_k, member) => { store.delete(member); },
    zadd: async () => {}, expire: async () => {},
  };
  const bannedDb = { from: () => ({ select: () => ({ eq: () => ({ is: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { id: 1 }, error: null }) }) }) }) }) }) };
  const { sweepPendingBanReconciles } = await import("../src/services/ban/banReconcileQueue.js");
  const { observeBanDbState, reconcileBanCacheFromDb } = await import("../src/services/ban/bannedUsers.repo.js");
  const stats = await sweepPendingBanReconciles({
    getRedis: async () => fakeRedis,
    minSettleMs: 0,
    observe: (u) => observeBanDbState(u, { dbClient: bannedDb }),
    reconcile: (u) => reconcileBanCacheFromDb(u, { dbClient: bannedDb, ...c }),
    clearPendingOp: c.clearPendingOp,
  });
  assert.equal(stats.reconciled, 1);
  assert.equal(c.m.get(`ban:active:${uid}`), "1");
  assert.equal(store.size, 0);
  assert.equal(c.pendingOps.has(uid), false, "state-confirmed แล้วต้องปลด guard");
});

test("D-r10) มี unknown op ค้าง → ban/unban รอบใหม่คืน pending_reconcile โดยไม่แตะ DB", async () => {
  const uid = "U" + "7".repeat(31) + "d";
  const c = memCache();
  c.pendingOps.set(uid, "oldOp"); // งานเก่ายังไม่ยืนยันผล
  let dbTouched = 0;
  const countingDb = {
    from: () => { dbTouched += 1; return { insert: async () => ({ error: null }), update: () => ({ eq: () => ({ is: () => ({ select: async () => ({ data: [], error: null }) }) }) }) }; },
  };
  const rb = await banUser({ lineUserId: uid, reason: "x", bannedBy: "admin" }, { dbClient: countingDb, ...c });
  assert.equal(rb.ok, false);
  assert.equal(rb.reason, "pending_reconcile");
  const ru = await unbanUser({ lineUserId: uid, unbannedBy: "admin" }, { dbClient: countingDb, ...c });
  assert.equal(ru.ok, false);
  assert.equal(ru.reason, "pending_reconcile");
  assert.equal(dbTouched, 0, "ห้ามแตะ DB ระหว่างมีงานไม่รู้ผลค้าง (กัน commit กลับลำดับ)");
});

test("E-r10) หลังงานเก่า state-confirmed (guard ถูกปลด) → คำสั่งใหม่ทำงานได้ปกติ", async () => {
  const uid = "U" + "7".repeat(31) + "e";
  const c = memCache();
  // งานเก่า: ban unknown → guard ถูกตั้ง → settle → finalizer ยืนยันผลแล้วปลด guard
  let release;
  const lateDb = {
    from: () => ({
      insert: () => new Promise((r) => { release = () => r({ error: null }); }),
      select: () => ({ eq: () => ({ is: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { id: 1 }, error: null }) }) }) }) }),
    }),
  };
  const r1 = await banUser({ lineUserId: uid, reason: "x", bannedBy: "admin" }, {
    dbClient: lateDb, ...c, dbTimeoutMs: 30, lockRenewIntervalMs: 10, finalizerCapMs: 3000,
  });
  assert.equal(r1.reason, "db_outcome_unknown");
  assert.equal(c.pendingOps.has(uid), true, "guard ต้องถูกตั้ง");
  // ระหว่างค้าง: คำสั่งใหม่โดนกัน
  const blocked = await unbanUser({ lineUserId: uid, unbannedBy: "admin" }, { dbClient: lateDb, ...c });
  assert.equal(blocked.reason, "pending_reconcile");
  // งานเก่า settle + ยืนยันผล → guard ปลด
  release();
  await r1.pendingFinalizer;
  assert.equal(c.pendingOps.has(uid), false, "ยืนยันผลแล้ว guard ต้องหาย");
  // คำสั่งใหม่ผ่านได้ (unban ปกติ)
  const okDb = {
    from: () => ({
      update: () => ({ eq: () => ({ is: () => ({ select: async () => ({ data: [{ id: 1 }], error: null }) }) }) }),
      select: () => ({ eq: () => ({ is: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }),
    }),
  };
  const r2 = await unbanUser({ lineUserId: uid, unbannedBy: "admin" }, { dbClient: okDb, ...c });
  assert.equal(r2.ok, true);
});

test("F-r10) admin copy: enforcementHeld=false ห้ามมีคำว่า 'กันบัญชีนี้ไว้ก่อนแล้ว' (source contract)", () => {
  // copy อ้าง fail-closed ต้องอยู่หลังเช็ค enforcementHeld === true เท่านั้น
  const claimIdx = WEBHOOK.indexOf("ระบบกันบัญชีนี้ไว้ก่อนแล้ว");
  assert.ok(claimIdx > 0);
  const guardIdx = WEBHOOK.lastIndexOf("res.enforcementHeld === true", claimIdx);
  assert.ok(guardIdx > 0 && claimIdx - guardIdx < 300, "คำอ้างต้องอยู่ใต้เงื่อนไข enforcementHeld");
  // สาขา false ต้องบอกตรง ๆ ว่ากันไว้ไม่สำเร็จ
  assert.ok(WEBHOOK.includes("กันไว้ล่วงหน้าไม่สำเร็จ"), "ต้องมี copy ยอมรับว่ากันไม่สำเร็จ");
  // ฝั่ง unban เช่นกัน
  const unbanClaim = WEBHOOK.indexOf("บัญชีนี้ยังถูกกันไว้ก่อน");
  const unbanGuard = WEBHOOK.lastIndexOf("res.enforcementHeld === true", unbanClaim);
  assert.ok(unbanClaim > 0 && unbanGuard > 0 && unbanClaim - unbanGuard < 300);
});

test("G-r10) unban unknown: enforcementHeld ตามผลเขียน cache จริง + ระหว่างรอยังแบนจริง", async () => {
  // (1) เขียน pre-hold สำเร็จ → enforcementHeld true + isBanned true ระหว่างรอ
  const uid1 = "U" + "7".repeat(31) + "f";
  const c1 = memCache();
  c1.m.set(`ban:active:${uid1}`, "1");
  const hangUnbanDb = {
    from: () => ({
      update: () => ({ eq: () => ({ is: () => ({ select: () => new Promise(() => {}) }) }) }),
      select: () => ({ eq: () => ({ is: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { id: 1 }, error: null }) }) }) }) }),
    }),
  };
  const r1 = await unbanUser({ lineUserId: uid1, unbannedBy: "admin" }, {
    dbClient: hangUnbanDb, ...c1, dbTimeoutMs: 30, lockRenewIntervalMs: 10, finalizerCapMs: 60,
  });
  assert.equal(r1.reason, "db_outcome_unknown");
  assert.equal(r1.enforcementHeld, true, "pre-hold เขียนเข้าจริง");
  const noDb = { from: () => { throw new Error("no db"); } };
  assert.equal(await isBanned(uid1, { dbClient: noDb, ...c1, alertDedupe: async () => false }), true);
  await r1.pendingFinalizer;

  // (2) เขียน pre-hold ไม่เข้า → enforcementHeld false (ห้ามอ้าง)
  const uid2 = "U" + "8".repeat(31) + "a";
  const c2 = memCache();
  const r2 = await unbanUser({ lineUserId: uid2, unbannedBy: "admin" }, {
    dbClient: hangUnbanDb, ...c2,
    applyBanState: async () => ({ ok: false, reason: "no_redis" }),
    dbTimeoutMs: 30, lockRenewIntervalMs: 10, finalizerCapMs: 60,
  });
  assert.equal(r2.reason, "db_outcome_unknown");
  assert.equal(r2.enforcementHeld, false);
  await r2.pendingFinalizer;
});

test("H-r10) remove คืน ok:false → finalizer ห้ามนับว่า entryRemoved + guard ไม่ถูกปลด", async () => {
  const uid = "U" + "8".repeat(31) + "b";
  const c = memCache();
  let release;
  const lateDb = {
    from: () => ({
      insert: () => new Promise((r) => { release = () => r({ error: null }); }),
      select: () => ({ eq: () => ({ is: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { id: 1 }, error: null }) }) }) }) }),
    }),
  };
  const r = await banUser({ lineUserId: uid, reason: "x", bannedBy: "admin" }, {
    dbClient: lateDb, ...c,
    removeReconcile: async () => ({ ok: false }), // zrem พัง
    dbTimeoutMs: 30, lockRenewIntervalMs: 10, finalizerCapMs: 3000,
  });
  assert.equal(r.reason, "db_outcome_unknown");
  release();
  const rec = await r.pendingFinalizer;
  assert.equal(rec.entryRemoved, false, "ลบไม่เข้าห้ามอ้างว่าจบงาน");
  assert.equal(c.pendingOps.has(uid), true, "guard ต้องยังอยู่จนกว่างานจบจริง");
});
