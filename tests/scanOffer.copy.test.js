import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fillPlaceholders,
  buildPlaceholderVars,
  buildScanOfferReply,
  buildApprovedIntroReply,
} from "../src/services/scanOffer.copy.js";
import { normalizeScanOffer } from "../src/services/scanOffer.loader.js";
import { resolveScanOfferAccessContext } from "../src/services/scanOfferAccess.resolver.js";

const offer = () =>
  normalizeScanOffer({
    active: true,
    label: "default",
    freeQuotaPerDay: 2,
    paidPriceThb: 49,
    paidScanCount: 5,
    paidWindowHours: 24,
    startAt: null,
    endAt: null,
    configVersion: "1",
  });

test("fillPlaceholders replaces all keys", () => {
  const s = fillPlaceholders("{price} {count} {hours} {nextResetLabel} {freeRemaining} {offerLabel}", {
    price: 49,
    count: 5,
    hours: 24,
    nextResetLabel: "x",
    freeRemaining: 1,
    offerLabel: "default",
  });
  assert.match(s, /49/);
  assert.match(s, /5/);
  assert.match(s, /24/);
  assert.match(s, /x/);
  assert.match(s, /1/);
  assert.match(s, /default/);
});

test("buildScanOfferReply: free_quota_exhausted (pricing pool) + alternates for paywall", () => {
  const o = offer();
  const ctx = resolveScanOfferAccessContext({
    offer: o,
    freeUsedToday: 2,
    paidUntil: null,
    paidRemainingScans: 0,
    now: new Date(),
  });
  const built = buildScanOfferReply({
    offer: o,
    accessContext: ctx,
    gate: { allowed: false, reason: "payment_required" },
    userId: "U_test_scan_offer",
  });
  assert.equal(built.replyType, "free_quota_exhausted");
  assert.ok(built.primaryText.includes("49"));
  assert.ok(built.alternateTexts.length >= 1);
  assert.ok(built.semanticKey.startsWith("scan_offer:free_quota_exhausted:"));
});

test("buildScanOfferReply: paid_quota_exhausted", () => {
  const now = new Date();
  const paidUntil = new Date(now.getTime() + 3600_000).toISOString();
  const o = offer();
  const ctx = resolveScanOfferAccessContext({
    offer: o,
    freeUsedToday: 2,
    paidUntil,
    paidRemainingScans: 0,
    now,
  });
  const built = buildScanOfferReply({
    offer: o,
    accessContext: ctx,
    gate: { allowed: false, reason: "payment_required" },
    userId: "U_paid_ex",
  });
  assert.equal(built.replyType, "paid_quota_exhausted");
});

test("buildPlaceholderVars", () => {
  const o = offer();
  const ctx = resolveScanOfferAccessContext({
    offer: o,
    freeUsedToday: 1,
    paidUntil: null,
    paidRemainingScans: 0,
    now: new Date(),
  });
  const v = buildPlaceholderVars(o, ctx);
  assert.equal(v.freeRemaining, 1);
});

test("buildApprovedIntroReply", () => {
  const o = offer();
  const b = buildApprovedIntroReply({ offer: o, userId: "U_appr" });
  assert.equal(b.replyType, "approved_intro");
  assert.ok(b.primaryText.length > 10);
});
