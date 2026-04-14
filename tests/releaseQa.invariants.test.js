/**
 * Release QA — deterministic invariants that mirror end-to-end expectations.
 * Does not replace staging/LINE/Supabase manual checks; encodes "must stay true" rules.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { decideScanGate, computePaidActive } from "../src/services/scanOfferAccess.resolver.js";
import { loadActiveScanOffer } from "../src/services/scanOffer.loader.js";
import {
  findActivePackageByPriceThb,
  findPackageByKey,
} from "../src/services/scanOffer.packages.js";
import {
  formatPaywallPriceTokensForLine,
  buildSingleOfferPaywallAltText,
  buildPaymentApprovedText,
  allowsUtilityCommandsDuringPendingVerify,
  isPaymentCommand,
} from "../src/utils/webhookText.util.js";

const futureIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

test("release: paid gate requires positive remaining scans and future paid_until", () => {
  assert.equal(
    computePaidActive(futureIso, 0, new Date()),
    false,
    "remaining 0 => not paid-active (even if window open)",
  );
  assert.equal(computePaidActive(futureIso, 3, new Date()), true);
  const g = decideScanGate({
    freeUsedToday: 99,
    freeQuotaPerDay: 2,
    paidUntil: futureIso,
    paidRemainingScans: 2,
    now: new Date(),
  });
  assert.equal(g.allowed, true);
  assert.equal(g.reason, "paid");
  assert.equal(g.remaining, 2);
});

test("release: approve path can resolve entitlement when package key is stale but amount matches offer", () => {
  const offer = {
    packages: [
      {
        key: "49baht_4scans_24h",
        priceThb: 49,
        scanCount: 4,
        windowHours: 24,
        active: true,
      },
      {
        key: "99baht_10scans_24h",
        priceThb: 99,
        scanCount: 10,
        windowHours: 24,
        active: true,
      },
    ],
  };
  assert.equal(findPackageByKey(offer, "old_removed_key_xyz"), null);
  const byAmt = findActivePackageByPriceThb(offer, 99);
  assert.ok(byAmt);
  assert.equal(byAmt.key, "99baht_10scans_24h");
  assert.equal(byAmt.scanCount, 10);
});

test("release: single-offer alt text includes price from formatPaywallPriceTokensForLine", () => {
  const offer = loadActiveScanOffer(new Date());
  const tokens = formatPaywallPriceTokensForLine(offer);
  assert.equal(tokens, "49");
  const alt = buildSingleOfferPaywallAltText(offer);
  assert.ok(alt.includes("49"));
  assert.ok(alt.includes("จ่ายเงิน"));
});

test("release: buildPaymentApprovedText reflects DB fields and paidPlanCode intro shape", async () => {
  const offer = loadActiveScanOffer(new Date());
  const code = offer.packages[0]?.key;
  assert.ok(code);
  const pkg0 = findPackageByKey(offer, code);
  assert.ok(pkg0);
  const text = await buildPaymentApprovedText({
    paidRemainingScans: pkg0.scanCount,
    paidUntil: futureIso,
    lineUserId: "U_release_qa_intro",
    paidPlanCode: code,
    paymentRef: "REF-RELEASE-QA",
  });
  assert.match(text, new RegExp(String(pkg0.scanCount)));
  assert.match(text, /สแกนได้อีก/);
  assert.ok(text.includes("REF-RELEASE-QA"));
  assert.match(text, /ขอให้/);
  assert.ok(text.includes("ส่งรูปมาสแกนต่อได้เลยครับ"));
});

test("release: conversation hardening — pending_verify utility vs payment command", () => {
  assert.equal(allowsUtilityCommandsDuringPendingVerify("ประวัติ", "ประวัติ"), true);
  assert.equal(isPaymentCommand("จ่ายเงิน", ""), true);
});
