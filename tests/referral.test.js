import test from "node:test";
import assert from "node:assert/strict";

import {
  generateReferralCodeCandidate,
  normalizeReferralCode,
  isReferralCodeFormat,
  extractReferralCodeFromText,
} from "../src/utils/referralCode.util.js";
import { decideScanGate } from "../src/services/scanOfferAccess.resolver.js";
import { mapAccessDecisionToSource } from "../src/services/scanV2/mapAccessSource.js";
import {
  buildMyCodeReply,
  buildRedeemReply,
  buildReferralPaywallPromoBlock,
} from "../src/services/lineWebhook/referralCommand.service.js";

// ---------------------------------------------------------------------------
// referralCode.util
// ---------------------------------------------------------------------------

test("generateReferralCodeCandidate: EN- prefix + 6 unambiguous chars", () => {
  for (let i = 0; i < 200; i += 1) {
    const code = generateReferralCodeCandidate();
    assert.match(code, /^EN-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    assert.ok(isReferralCodeFormat(code));
    // never contains ambiguous chars
    assert.ok(!/[OIL01]/.test(code.slice(3)));
  }
});

test("normalizeReferralCode: accepts spacing/case/missing dash variants", () => {
  assert.equal(normalizeReferralCode("en7kmq9p"), "EN-7KMQ9P");
  assert.equal(normalizeReferralCode("EN 7KMQ9P"), "EN-7KMQ9P");
  assert.equal(normalizeReferralCode("en-7kmq9p"), "EN-7KMQ9P");
  assert.equal(normalizeReferralCode("  EN-7KMQ9P  "), "EN-7KMQ9P");
});

test("normalizeReferralCode: rejects non-codes", () => {
  assert.equal(normalizeReferralCode(""), "");
  assert.equal(normalizeReferralCode("hello"), "");
  assert.equal(normalizeReferralCode("1990-02-14"), "");
  assert.equal(normalizeReferralCode("EN-12345"), ""); // too short
  assert.equal(normalizeReferralCode("EN-1234OI"), ""); // ambiguous chars not allowed
});

test("extractReferralCodeFromText: finds a code inside a longer message", () => {
  assert.equal(
    extractReferralCodeFromText("เพื่อนส่งโค้ดมาให้ EN-7KMQ9P ลองใช้ดู"),
    "EN-7KMQ9P",
  );
  assert.equal(extractReferralCodeFromText("ไม่มีโค้ดเลย"), "");
});

// ---------------------------------------------------------------------------
// decideScanGate — bonus branch
// ---------------------------------------------------------------------------

test("decideScanGate: bonus ignored when free quota remains", () => {
  const g = decideScanGate({
    freeUsedToday: 0,
    freeQuotaPerDay: 2,
    paidUntil: null,
    paidRemainingScans: 0,
    bonusCredits: 5,
  });
  assert.equal(g.allowed, true);
  assert.equal(g.reason, "free");
});

test("decideScanGate: bonus used after free exhausted, before paywall", () => {
  const g = decideScanGate({
    freeUsedToday: 2,
    freeQuotaPerDay: 2,
    paidUntil: null,
    paidRemainingScans: 0,
    bonusCredits: 3,
  });
  assert.equal(g.allowed, true);
  assert.equal(g.reason, "bonus");
  assert.equal(g.remaining, 3);
  assert.equal(g.bonusRemaining, 3);
});

test("decideScanGate: no bonus + free exhausted => paywall (unchanged default)", () => {
  const g = decideScanGate({
    freeUsedToday: 2,
    freeQuotaPerDay: 2,
    paidUntil: null,
    paidRemainingScans: 0,
  });
  assert.equal(g.allowed, false);
  assert.equal(g.reason, "payment_required");
  assert.equal(g.bonusRemaining, 0);
});

test("decideScanGate: paid wins over bonus", () => {
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const g = decideScanGate({
    freeUsedToday: 5,
    freeQuotaPerDay: 2,
    paidUntil: future,
    paidRemainingScans: 4,
    bonusCredits: 9,
  });
  assert.equal(g.allowed, true);
  assert.equal(g.reason, "paid");
});

// ---------------------------------------------------------------------------
// mapAccessDecisionToSource
// ---------------------------------------------------------------------------

test("mapAccessDecisionToSource: bonus reason maps to bonus source", () => {
  assert.equal(
    mapAccessDecisionToSource({ allowed: true, reason: "bonus" }),
    "bonus",
  );
  assert.equal(
    mapAccessDecisionToSource({ allowed: true, reason: "paid" }),
    "paid",
  );
  assert.equal(
    mapAccessDecisionToSource({ allowed: true, reason: "free" }),
    "free",
  );
  assert.equal(mapAccessDecisionToSource({ allowed: false }), null);
});

// ---------------------------------------------------------------------------
// reply copy (pure)
// ---------------------------------------------------------------------------

test("buildMyCodeReply: shows the code and credits when > 0", () => {
  const t = buildMyCodeReply("EN-7KMQ9P", 4);
  assert.ok(t.includes("EN-7KMQ9P"));
  assert.ok(t.includes("4"));
});

test("buildMyCodeReply: omits credits line when 0", () => {
  const t = buildMyCodeReply("EN-7KMQ9P", 0);
  assert.ok(t.includes("EN-7KMQ9P"));
  assert.ok(!t.includes("สะสม"));
});

test("buildReferralPaywallPromoBlock: shows code + invite framing", () => {
  const t = buildReferralPaywallPromoBlock("EN-7KMQ9P");
  assert.ok(t.includes("EN-7KMQ9P"));
  assert.ok(t.includes("ชวนเพื่อน"));
  assert.ok(t.includes("ฟรี"));
});

test("buildRedeemReply: distinct copy per outcome", () => {
  assert.ok(buildRedeemReply({ ok: true, reason: "redeemed" }).includes("เรียบร้อย"));
  assert.ok(
    buildRedeemReply({ ok: false, reason: "already_referred" }).includes("ครั้งเดียว"),
  );
  assert.ok(buildRedeemReply({ ok: false, reason: "self" }).includes("ของคุณเอง"));
  assert.ok(buildRedeemReply({ ok: false, reason: "not_found" }).includes("ไม่พบ"));
  assert.ok(
    buildRedeemReply({ ok: false, reason: "invalid_format" }).includes("EN-XXXXXX"),
  );
});
