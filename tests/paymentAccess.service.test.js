import { test } from "node:test";
import assert from "node:assert/strict";
import { decideScanGate } from "../src/services/scanOfferAccess.resolver.js";
import { loadActiveScanOffer } from "../src/services/scanOffer.loader.js";
import { buildPaymentGateReply } from "../src/services/paymentAccess.service.js";

/**
 * PR1: gate math is shared with `checkScanAccess` via `decideScanGate`.
 * Integration tests with Supabase are out of scope; behavior vs quota is covered here.
 */

test("default offer from loader: 2 free / default pack 49×4 / 24h + 2 packages", () => {
  const o = loadActiveScanOffer(new Date());
  assert.equal(o.freeQuotaPerDay, 2);
  assert.equal(o.paidPriceThb, 49);
  assert.equal(o.paidScanCount, 4);
  assert.equal(o.paidWindowHours, 24);
  assert.equal(o.packages.length, 2);
});

test("gate behavior tracks freeQuotaPerDay from config (no FREE_SCANS_LIMIT constant)", () => {
  const g2 = decideScanGate({
    freeUsedToday: 2,
    freeQuotaPerDay: 2,
    paidUntil: null,
    paidRemainingScans: 0,
    now: new Date(),
  });
  assert.equal(g2.allowed, false);

  const g3 = decideScanGate({
    freeUsedToday: 2,
    freeQuotaPerDay: 3,
    paidUntil: null,
    paidRemainingScans: 0,
    now: new Date(),
  });
  assert.equal(g3.allowed, true);
  assert.equal(g3.freeScansLimit, 3);
});

test("buildPaymentGateReply returns scanOffer bundle for payment_required", async () => {
  const r = await buildPaymentGateReply({
    decision: {
      allowed: false,
      reason: "payment_required",
      usedScans: 2,
      freeScansLimit: 2,
      freeScansRemaining: 0,
      paidUntil: null,
      paidRemainingScans: 0,
    },
    userId: "U_paywall_test",
  });
  assert.ok(r.scanOffer);
  assert.equal(r.scanOffer.replyType, "free_quota_exhausted");
  assert.ok(String(r.fallbackText || "").length > 20);
  assert.ok(r.scanOffer.semanticKey.includes("free_quota_exhausted"));
  assert.ok(Array.isArray(r.scanOffer.alternateTexts));
});
