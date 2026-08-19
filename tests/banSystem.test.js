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

test("DB op bounded: insert ค้างไม่จบ → คืน db_error ภายใน dbTimeoutMs ไม่แขวน", async () => {
  const uid = "U" + "1".repeat(31) + "f";
  const c = memCache();
  const hangDb = { from: () => ({ insert: () => new Promise(() => {}) }) };
  const t0 = Date.now();
  const r = await banUser({ lineUserId: uid, reason: "x", bannedBy: "admin" }, {
    dbClient: hangDb, ...c, lockRenewIntervalMs: 10, dbTimeoutMs: 150,
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "db_error");
  assert.ok(Date.now() - t0 < 3000);
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
