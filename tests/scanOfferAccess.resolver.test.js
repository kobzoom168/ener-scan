import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decideScanGate,
  resolveScanOfferAccessContext,
  formatNextResetLabelThai,
  computeNextLocalMidnightAfter,
} from "../src/services/scanOfferAccess.resolver.js";
import { normalizeScanOffer } from "../src/services/scanOffer.loader.js";

const baseOffer = () =>
  normalizeScanOffer({
    active: true,
    label: "t",
    freeQuotaPerDay: 2,
    paidPriceThb: 49,
    paidScanCount: 5,
    paidWindowHours: 24,
    startAt: null,
    endAt: null,
    configVersion: "1",
  });

test("decideScanGate: free remaining > 0 (free_available path)", () => {
  const g = decideScanGate({
    freeUsedToday: 0,
    freeQuotaPerDay: 2,
    paidUntil: null,
    paidRemainingScans: 0,
    now: new Date(),
  });
  assert.equal(g.allowed, true);
  assert.equal(g.reason, "free");
  assert.equal(g.freeScansRemaining, 2);
});

test("decideScanGate: free_quota_low equivalent — 1 left of 2", () => {
  const g = decideScanGate({
    freeUsedToday: 1,
    freeQuotaPerDay: 2,
    paidUntil: null,
    paidRemainingScans: 0,
    now: new Date(),
  });
  assert.equal(g.allowed, true);
  assert.equal(g.freeScansRemaining, 1);
});

test("decideScanGate: free exhausted → payment_required", () => {
  const g = decideScanGate({
    freeUsedToday: 2,
    freeQuotaPerDay: 2,
    paidUntil: null,
    paidRemainingScans: 0,
    now: new Date(),
  });
  assert.equal(g.allowed, false);
  assert.equal(g.reason, "payment_required");
});

test("decideScanGate: higher freeQuotaPerDay from config changes gate", () => {
  const g = decideScanGate({
    freeUsedToday: 2,
    freeQuotaPerDay: 3,
    paidUntil: null,
    paidRemainingScans: 0,
    now: new Date(),
  });
  assert.equal(g.allowed, true);
  assert.equal(g.reason, "free");
});

test("decideScanGate: paid active wins over free exhaustion", () => {
  const now = new Date();
  const paidUntil = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  const g = decideScanGate({
    freeUsedToday: 99,
    freeQuotaPerDay: 2,
    paidUntil,
    paidRemainingScans: 3,
    now,
  });
  assert.equal(g.allowed, true);
  assert.equal(g.reason, "paid");
  assert.equal(g.remaining, 3);
});

test("resolveScanOfferAccessContext: free_available", () => {
  const ctx = resolveScanOfferAccessContext({
    offer: baseOffer(),
    freeUsedToday: 0,
    paidUntil: null,
    paidRemainingScans: 0,
    now: new Date(),
  });
  assert.equal(ctx.scenario, "free_available");
  assert.equal(ctx.freeRemainingToday, 2);
});

test("resolveScanOfferAccessContext: free_quota_low", () => {
  const ctx = resolveScanOfferAccessContext({
    offer: baseOffer(),
    freeUsedToday: 1,
    paidUntil: null,
    paidRemainingScans: 0,
    now: new Date(),
  });
  assert.equal(ctx.scenario, "free_quota_low");
});

test("resolveScanOfferAccessContext: free_quota_exhausted", () => {
  const ctx = resolveScanOfferAccessContext({
    offer: baseOffer(),
    freeUsedToday: 2,
    paidUntil: null,
    paidRemainingScans: 0,
    now: new Date(),
  });
  assert.equal(ctx.scenario, "free_quota_exhausted");
});

test("resolveScanOfferAccessContext: paid_active", () => {
  const now = new Date();
  const paidUntil = new Date(now.getTime() + 3600_000).toISOString();
  const ctx = resolveScanOfferAccessContext({
    offer: baseOffer(),
    freeUsedToday: 2,
    paidUntil,
    paidRemainingScans: 2,
    now,
  });
  assert.equal(ctx.scenario, "paid_active");
});

test("resolveScanOfferAccessContext: paid_quota_exhausted (remaining 0, window open)", () => {
  const now = new Date();
  const paidUntil = new Date(now.getTime() + 3600_000).toISOString();
  const ctx = resolveScanOfferAccessContext({
    offer: baseOffer(),
    freeUsedToday: 2,
    paidUntil,
    paidRemainingScans: 0,
    now,
  });
  assert.equal(ctx.scenario, "paid_quota_exhausted");
});

test("nextResetLabel is non-empty for a valid midnight", () => {
  const d = computeNextLocalMidnightAfter(new Date("2025-06-15T15:00:00.000Z"));
  const label = formatNextResetLabelThai(d);
  assert.ok(label.length > 5);
  assert.ok(label.includes("พรุ่งนี้"));
});
