#!/usr/bin/env node
/**
 * Integration (flow-role P1-2, Codex 27 ส.ค.): moveKeyAtomic / getDelKey / setValueWithTtlTyped กับ Redis จริง
 * รันในคอนเทนเนอร์ staging: docker exec ener-scan-staging node scripts/redis-atomic-integration.mjs
 * ใช้ prefix ทดสอบเฉพาะ (objinfo:it:<run>) และ cleanup ทุกคีย์ตอนจบ · ไม่แตะคีย์ลูกค้า
 * โหมด unavailable: REDIS_URL=redis://127.0.0.1:1 node scripts/redis-atomic-integration.mjs --expect-unavailable
 */
import { randomUUID } from "node:crypto";

const expectUnavailable = process.argv.includes("--expect-unavailable");
const { moveKeyAtomic, getDelKey, setValueWithTtlTyped, delKeyTyped, getScanV2Redis, getValueTyped, moveKeyIfValueAtomic } = await import("../src/redis/scanV2Redis.js");

const run = randomUUID().slice(0, 8);
const K = (n) => `objinfo:it:${run}:${n}`;
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: Boolean(ok), detail }); };

let redis = null;
try { redis = await getScanV2Redis(); } catch { redis = null; }
const keys = [K("src"), K("dst"), K("src2"), K("dst2"), K("gd"), K("set"), K("cas"), K("casdst")];
const prefix = String(process.env.SCAN_V2_REDIS_PREFIX || "ener-scan:v2:").trim() || "ener-scan:v2:";
const raw = (k) => `${prefix}dedupe:${k}`;

async function main() {
  if (expectUnavailable) {
    const s = await setValueWithTtlTyped(K("set"), "x", 60);
    const m = await moveKeyAtomic(K("src"), K("dst"), 60);
    const g = await getDelKey(K("gd"));
    check("unavailable/error: set typed", s.ok === false && (s.reason === "redis_unavailable" || s.reason === "redis_error"), s);
    check("unavailable/error: move typed", m.status === "redis_unavailable" || m.status === "redis_error", m);
    check("unavailable/error: getdel typed", g.status === "redis_unavailable" || g.status === "redis_error", g);
    const gv = await getValueTyped(K("cas"));
    const cm = await moveKeyIfValueAtomic(K("cas"), K("casdst"), "x", 60);
    check("unavailable/error: get typed", gv.status === "redis_unavailable" || gv.status === "redis_error", gv);
    check("unavailable/error: compare-move typed", cm.status === "redis_unavailable" || cm.status === "redis_error", cm);
    return;
  }
  if (!redis) { check("redis client available", false, "getScanV2Redis() returned null — REDIS_URL?"); return; }
  const ping = await redis.ping();
  check("PING", ping === "PONG", ping);

  // 1) set typed
  const s = await setValueWithTtlTyped(K("set"), JSON.stringify({ raw: "พระสมเด็จวัดระฆัง", at: Date.now() }), 120);
  check("set typed ok", s.ok === true, s);
  const setTtl = await redis.ttl(raw(K("set")));
  check("set TTL set (60..120)", setTtl > 60 && setTtl <= 120, setTtl);

  // 2) move success: source หาย destination มีค่า + TTL
  await setValueWithTtlTyped(K("src"), "V1", 120);
  const m = await moveKeyAtomic(K("src"), K("dst"), 300);
  check("move status=moved value", m.status === "moved" && m.value === "V1", m);
  const srcAfter = await redis.get(raw(K("src")));
  const dstAfter = await redis.get(raw(K("dst")));
  const dstTtl = await redis.ttl(raw(K("dst")));
  check("move: source gone", srcAfter === null, srcAfter);
  check("move: dest has value", dstAfter === "V1", dstAfter);
  check("move: dest TTL (200..300)", dstTtl > 200 && dstTtl <= 300, dstTtl);

  // 3) missing source
  const m2 = await moveKeyAtomic(K("src2"), K("dst2"), 300);
  check("move missing source → no_source", m2.status === "no_source" && m2.value === null, m2);

  // 4) สอง consumer แย่ง GETDEL คีย์เดียว → ได้ค่าเดียว
  await setValueWithTtlTyped(K("gd"), "ONCE", 120);
  const [a, b] = await Promise.all([getDelKey(K("gd")), getDelKey(K("gd"))]);
  const got = [a, b].filter((x) => x.status === "got");
  const missing = [a, b].filter((x) => x.status === "missing");
  check("two consumers: exactly one got", got.length === 1 && got[0].value === "ONCE" && missing.length === 1, { a, b });
  const gd2 = await getDelKey(K("gd"));
  check("getdel after consume → missing", gd2.status === "missing", gd2);

  // 5) สอง consumer แย่ง MOVE จาก source เดียว → moved ครั้งเดียว (bind รูปแรกเท่านั้น)
  await setValueWithTtlTyped(K("src"), "BIND", 120);
  const [ma, mb] = await Promise.all([moveKeyAtomic(K("src"), K("dst"), 120), moveKeyAtomic(K("src"), K("dst2"), 120)]);
  const moved = [ma, mb].filter((x) => x.status === "moved");
  check("two binders: exactly one moved", moved.length === 1 && [ma, mb].some((x) => x.status === "no_source"), { ma, mb });

  // 6) compare-and-move (eligibility-before-move รอบห้า): GET typed → mismatch ไม่ย้าย → match ย้าย → missing
  await setValueWithTtlTyped(K("cas"), "OLD", 120);
  const gv = await getValueTyped(K("cas"));
  check("get typed got", gv.status === "got" && gv.value === "OLD", gv);
  const mm = await moveKeyIfValueAtomic(K("cas"), K("casdst"), "NEW", 120);
  check("compare-move mismatch → value_mismatch, source intact", mm.status === "value_mismatch" && (await redis.get(raw(K("cas")))) === "OLD" && (await redis.get(raw(K("casdst")))) === null, mm);
  const mv = await moveKeyIfValueAtomic(K("cas"), K("casdst"), "OLD", 120);
  check("compare-move match → moved, dest has value, source gone", mv.status === "moved" && (await redis.get(raw(K("casdst")))) === "OLD" && (await redis.get(raw(K("cas")))) === null, mv);
  const gm = await getValueTyped(K("cas"));
  check("get typed missing after move", gm.status === "missing", gm);
  const mn = await moveKeyIfValueAtomic(K("cas"), K("casdst"), "OLD", 120);
  check("compare-move missing source → no_source", mn.status === "no_source", mn);
  // 7) del typed
  const d = await delKeyTyped(K("dst"));
  check("del typed ok", d.ok === true, d);
}

try {
  await main();
} catch (e) {
  check("unexpected exception", false, String(e?.message || e));
} finally {
  if (redis) {
    try { await redis.del(...keys.map(raw)); } catch { /* ignore */ }
    const left = [];
    for (const k of keys) { try { if (await redis.exists(raw(k))) left.push(k); } catch { /* ignore */ } }
    check("cleanup: no test keys left", left.length === 0, left);
    try { await redis.quit(); } catch { /* ignore */ }
  }
  const pass = results.filter((r) => r.ok).length;
  for (const r of results) console.log(`${r.ok ? "ok" : "FAIL"} - ${r.name}${r.ok ? "" : " :: " + JSON.stringify(r.detail)}`);
  console.log(JSON.stringify({ event: "REDIS_ATOMIC_INTEGRATION", run, mode: expectUnavailable ? "expect-unavailable" : "live", pass, total: results.length }));
  process.exit(pass === results.length ? 0 : 1);
}
