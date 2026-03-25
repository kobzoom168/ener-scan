import test from "node:test";
import assert from "node:assert/strict";
import { guidanceTierFromStreak } from "../src/utils/stateMicroIntent.util.js";
import {
  bumpGuidanceNoProgress,
  resetGuidanceNoProgress,
  getGuidanceNoProgressCount,
} from "../src/stores/session.store.js";
import {
  resolvePaywallPromptReplyType,
  buildPaywallFatiguePromptText,
  buildPaywallFullOfferIntroText,
  buildPaywallAckContinueText,
  buildPaymentPackageSelectedHesitationText,
  allowsUtilityCommandsDuringPendingVerify,
  isPaymentCommand,
} from "../src/utils/webhookText.util.js";
import {
  parsePackageSelectionFromText,
  findPackageByKey,
} from "../src/services/scanOffer.packages.js";
import { loadActiveScanOffer } from "../src/services/scanOffer.loader.js";

const uid = "test_stabilization_user";

test("fatigue: streak 1–3 maps to tiers via bumpGuidanceNoProgress", () => {
  resetGuidanceNoProgress(uid, "paywall_offer_single");
  let n = bumpGuidanceNoProgress(uid, "paywall_offer_single");
  assert.equal(n, 1);
  assert.equal(guidanceTierFromStreak(n), "full");
  n = bumpGuidanceNoProgress(uid, "paywall_offer_single");
  assert.equal(n, 2);
  assert.equal(guidanceTierFromStreak(n), "short");
  n = bumpGuidanceNoProgress(uid, "paywall_offer_single");
  assert.equal(n, 3);
  assert.equal(guidanceTierFromStreak(n), "micro");
  resetGuidanceNoProgress(uid, "paywall_offer_single");
  assert.equal(getGuidanceNoProgressCount(uid, "paywall_offer_single"), 0);
});

test("paywall replyType: unclear tier full vs micro", () => {
  assert.equal(
    resolvePaywallPromptReplyType("unclear", "full"),
    "single_offer_paywall_unclear_full",
  );
  assert.equal(
    resolvePaywallPromptReplyType("unclear", "micro"),
    "single_offer_paywall_unclear_micro",
  );
  assert.equal(
    resolvePaywallPromptReplyType("wait_tomorrow", "full"),
    "single_offer_paywall_wait_tomorrow",
  );
  assert.equal(
    resolvePaywallPromptReplyType("date_wrong", "short"),
    "single_offer_paywall_date_wrong_state",
  );
});

test("paywall fatigue copy: noise tier micro stays short (no giant menu in primary)", () => {
  const t = buildPaywallFatiguePromptText({
    tier: "micro",
    branch: "unclear",
  });
  assert.ok(t.length < 120, "micro primary should stay compact");
  assert.ok(!t.includes("เลือกได้ 2 แบบ"), "micro should not open full menu text");
});

test("paywall full intro + ack ladder stay human and bounded", () => {
  const full = buildPaywallFullOfferIntroText();
  assert.ok(full.includes("พรุ่งนี้"));
  assert.ok(full.includes("จ่ายเงิน"));
  const microAck = buildPaywallAckContinueText({
    userId: "u_test_ack",
    ackStreak: 3,
  });
  assert.ok(microAck.length < 40);
  assert.ok(!microAck.includes("จ่ายเงิน"));
});

test("single offer: แพง does not parse when thaiRelativeAliases off", () => {
  const offer = loadActiveScanOffer();
  assert.equal(parsePackageSelectionFromText("แพง", offer), null);
  assert.equal(
    parsePackageSelectionFromText("แพง", offer, { thaiRelativeAliases: false }),
    null,
  );
});

test("hesitation copy: single-offer gentle nudge (no cheaper tier)", () => {
  const offer = loadActiveScanOffer();
  const pkg = findPackageByKey(offer, "49baht_4scans_24h");
  const body = buildPaymentPackageSelectedHesitationText(pkg, offer);
  assert.ok(body.includes("จ่ายเงิน"));
  assert.ok(!body.includes("เลือกได้"));
});

const offerMini = {
  packages: [
    { key: "low", priceThb: 30, scanCount: 1, windowHours: 24, active: true },
    { key: "high", priceThb: 150, scanCount: 5, windowHours: 24, active: true },
  ],
};

test("parse: เอา <price> and Thai cheap/expensive use active offer prices", () => {
  assert.equal(
    parsePackageSelectionFromText("เอา 30", offerMini, { allowEoaPricePhrase: true }),
    "low",
  );
  assert.equal(
    parsePackageSelectionFromText("ถูก", offerMini, { thaiRelativeAliases: true }),
    "low",
  );
  assert.equal(
    parsePackageSelectionFromText("แพง", offerMini, { thaiRelativeAliases: true }),
    "high",
  );
});

test("hesitation: multi-package mini-offer still returns gentle nudge (UI is single-offer in prod)", () => {
  const pkgHigh = findPackageByKey(offerMini, "high");
  const body = buildPaymentPackageSelectedHesitationText(pkgHigh, offerMini);
  assert.ok(body.includes("จ่ายเงิน"));
});

test("pending_verify: utility commands pass through (not payment)", () => {
  assert.equal(isPaymentCommand("ประวัติ", "ประวัติ"), false);
  assert.equal(allowsUtilityCommandsDuringPendingVerify("ประวัติ", "ประวัติ"), true);
});

test("pending_verify: payment command detected before utility ordering contract", () => {
  assert.equal(isPaymentCommand("จ่ายเงิน", ""), true);
  assert.equal(isPaymentCommand("จ่าย", ""), true);
});
