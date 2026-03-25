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
  resetGuidanceNoProgress(uid, "paywall_selecting_package");
  let n = bumpGuidanceNoProgress(uid, "paywall_selecting_package");
  assert.equal(n, 1);
  assert.equal(guidanceTierFromStreak(n), "full");
  n = bumpGuidanceNoProgress(uid, "paywall_selecting_package");
  assert.equal(n, 2);
  assert.equal(guidanceTierFromStreak(n), "short");
  n = bumpGuidanceNoProgress(uid, "paywall_selecting_package");
  assert.equal(n, 3);
  assert.equal(guidanceTierFromStreak(n), "micro");
  resetGuidanceNoProgress(uid, "paywall_selecting_package");
  assert.equal(getGuidanceNoProgressCount(uid, "paywall_selecting_package"), 0);
});

test("paywall replyType: unclear tier full vs micro", () => {
  assert.equal(resolvePaywallPromptReplyType("unclear", "full"), "payment_package_prompt_full");
  assert.equal(resolvePaywallPromptReplyType("unclear", "micro"), "payment_package_prompt_micro");
  assert.equal(
    resolvePaywallPromptReplyType("pay_too_early", "full"),
    "payment_package_prompt_pay_too_early",
  );
  assert.equal(
    resolvePaywallPromptReplyType("date_wrong", "short"),
    "payment_package_prompt_date_wrong_state",
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

test("package_selected: แพง does not parse as 99 when thaiRelativeAliases off", () => {
  const offer = loadActiveScanOffer();
  assert.equal(parsePackageSelectionFromText("แพง", offer), null);
  assert.equal(
    parsePackageSelectionFromText("แพง", offer, { thaiRelativeAliases: false }),
    null,
  );
});

test("hesitation copy for 99 suggests 49, does not reopen selection menu", () => {
  const offer = loadActiveScanOffer();
  const pkg99 = findPackageByKey(offer, "99baht_10scans_24h");
  const body = buildPaymentPackageSelectedHesitationText(pkg99);
  assert.match(body, /49/);
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

test("hesitation: next cheaper tier comes from offer (not hardcoded 49)", () => {
  const pkgHigh = findPackageByKey(offerMini, "high");
  const body = buildPaymentPackageSelectedHesitationText(pkgHigh, offerMini);
  assert.match(body, /30/);
  assert.ok(!body.includes("49"));
});

test("pending_verify: utility commands pass through (not payment)", () => {
  assert.equal(isPaymentCommand("ประวัติ", "ประวัติ"), false);
  assert.equal(allowsUtilityCommandsDuringPendingVerify("ประวัติ", "ประวัติ"), true);
});

test("pending_verify: payment command detected before utility ordering contract", () => {
  assert.equal(isPaymentCommand("จ่ายเงิน", ""), true);
  assert.equal(isPaymentCommand("จ่าย", ""), true);
});
