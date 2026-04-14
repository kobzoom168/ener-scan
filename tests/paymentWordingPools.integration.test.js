import test from "node:test";
import assert from "node:assert/strict";
import { normalizeScanOffer } from "../src/services/scanOffer.loader.js";
import {
  buildPaymentQrIntroFactsText,
  buildPaymentQrIntroText,
  buildDeterministicFreeQuotaExhaustedPaywallText,
} from "../src/utils/webhookText.util.js";
import {
  paymentApprovedBlessingVariants,
  paymentSupportVariants,
} from "../src/config/paymentWordingPools.th.js";
import { __resetReplyVariantPickTestState } from "../src/utils/replyVariantPick.util.js";

const miniOffer = () =>
  normalizeScanOffer({
    active: true,
    label: "t",
    freeQuotaPerDay: 1,
    paidPriceThb: 49,
    paidScanCount: 4,
    paidWindowHours: 24,
    defaultPackageKey: "p1",
    packages: [
      {
        key: "p1",
        priceThb: 49,
        scanCount: 4,
        windowHours: 24,
        active: true,
        label: "x",
      },
    ],
    startAt: null,
    endAt: null,
    configVersion: "v",
  });

test("buildPaymentQrIntroFactsText: deterministic package numbers unchanged by pools", () => {
  const facts = buildPaymentQrIntroFactsText({
    paidPackage: { priceThb: 49, scanCount: 4, windowHours: 24 },
  });
  assert.ok(facts.includes("49"));
  assert.ok(facts.includes("4 ครั้ง"));
  assert.ok(facts.includes("24"));
});

test("buildPaymentQrIntroText: prepends curated line; facts block preserved", () => {
  __resetReplyVariantPickTestState();
  const full = buildPaymentQrIntroText({
    paidPackage: { priceThb: 49, scanCount: 4, windowHours: 24 },
    lineUserId: "U_wording_qr_intro",
  });
  const facts = buildPaymentQrIntroFactsText({
    paidPackage: { priceThb: 49, scanCount: 4, windowHours: 24 },
  });
  assert.ok(full.endsWith(facts));
  assert.ok(full.length > facts.length);
  assert.ok(paymentSupportVariants.some((v) => full.startsWith(v)));
});

test("free quota paywall: facts lines still include exact price/count/hours", () => {
  __resetReplyVariantPickTestState();
  const o = miniOffer();
  const t = buildDeterministicFreeQuotaExhaustedPaywallText(o, {
    lineUserId: "U_fq_facts",
  });
  assert.ok(t.includes("แพ็ก 49 บาท"));
  assert.ok(t.includes("4 ครั้ง"));
  assert.ok(t.includes("24 ชม."));
});

test("blessing pool size and uniqueness", () => {
  assert.equal(paymentApprovedBlessingVariants.length, 30);
  assert.equal(new Set(paymentApprovedBlessingVariants).size, 30);
});
