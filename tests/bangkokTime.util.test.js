import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getBangkokDateKey,
  getBangkokDayContainingInstantUtcRange,
  getBangkokDayUtcRangeExclusiveEnd,
  computeNextBangkokMidnightAfter,
} from "../src/utils/bangkokTime.util.js";
import { decideScanGate } from "../src/services/scanOfferAccess.resolver.js";

function inHalfOpenRange(iso, startIso, endIso) {
  const t = Date.parse(iso);
  const a = Date.parse(startIso);
  const b = Date.parse(endIso);
  return t >= a && t < b;
}

test("yesterday 08:00 Bangkok vs today 06:00 Bangkok: today window excludes yesterday scan", () => {
  const scanYesterday0815Bangkok = "2026-04-23T01:00:00.000Z";
  const nowToday0615Bangkok = "2026-04-23T23:00:00.000Z";

  assert.equal(getBangkokDateKey(new Date(scanYesterday0815Bangkok)), "2026-04-23");
  assert.equal(getBangkokDateKey(new Date(nowToday0615Bangkok)), "2026-04-24");

  const { startIso, endIso } = getBangkokDayContainingInstantUtcRange(
    new Date(nowToday0615Bangkok),
  );
  assert.equal(inHalfOpenRange(scanYesterday0815Bangkok, startIso, endIso), false);

  const g = decideScanGate({
    freeUsedToday: 0,
    freeQuotaPerDay: 1,
    paidUntil: null,
    paidRemainingScans: 0,
    now: new Date(nowToday0615Bangkok),
  });
  assert.equal(g.allowed, true);
  assert.equal(g.reason, "free");
});

test("same Bangkok calendar day: 08:00 and 18:00 Bangkok share dateKey", () => {
  const morning = new Date("2026-04-24T01:00:00.000Z");
  const evening = new Date("2026-04-24T11:00:00.000Z");
  assert.equal(getBangkokDateKey(morning), "2026-04-24");
  assert.equal(getBangkokDateKey(evening), "2026-04-24");

  const r1 = getBangkokDayContainingInstantUtcRange(morning);
  const r2 = getBangkokDayContainingInstantUtcRange(evening);
  assert.equal(r1.dateKey, r2.dateKey);
  assert.equal(r1.startIso, r2.startIso);
  assert.equal(r1.endIso, r2.endIso);
});

test("23:59 Bangkok and 00:01 Bangkok are different calendar days", () => {
  const almostMidnight = new Date("2026-04-24T16:59:00.000Z");
  const justAfterMidnight = new Date("2026-04-24T17:01:00.000Z");
  assert.equal(getBangkokDateKey(almostMidnight), "2026-04-24");
  assert.equal(getBangkokDateKey(justAfterMidnight), "2026-04-25");
  assert.notEqual(
    getBangkokDateKey(almostMidnight),
    getBangkokDateKey(justAfterMidnight),
  );
});

test("explicit UTC instants: server not relying on local TZ", () => {
  const d = new Date("2025-12-31T18:30:00.000Z");
  const key = getBangkokDateKey(d);
  assert.match(key, /^\d{4}-\d{2}-\d{2}$/);
  const { startIso, endIso } = getBangkokDayContainingInstantUtcRange(d);
  assert.ok(Date.parse(endIso) > Date.parse(startIso));
  assert.equal(inHalfOpenRange(d.toISOString(), startIso, endIso), true);
});

test("Bangkok day UTC range is 24h wide", () => {
  const { start, end } = getBangkokDayUtcRangeExclusiveEnd("2026-06-01");
  assert.equal(end.getTime() - start.getTime(), 24 * 60 * 60 * 1000);
});

test("computeNextBangkokMidnightAfter: fixed UTC reference", () => {
  const now = new Date("2025-06-15T15:00:00.000Z");
  const next = computeNextBangkokMidnightAfter(now);
  assert.equal(next.toISOString(), "2025-06-15T17:00:00.000Z");
});
