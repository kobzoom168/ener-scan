import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeScanOffer } from "../src/services/scanOffer.loader.js";
import { resolveScanOfferAccessContext } from "../src/services/scanOfferAccess.resolver.js";
import {
  buildDeterministicFreeQuotaExhaustedPaywallText,
  buildDeterministicPaywallSoftCloseText,
  matchesDeterministicPaywallPurchaseIntent,
  matchesDeterministicPaywallSoftDeclineIntent,
} from "../src/utils/webhookText.util.js";

const testOffer = () =>
  normalizeScanOffer({
    active: true,
    label: "default",
    freeQuotaPerDay: 2,
    paidPriceThb: 49,
    paidScanCount: 4,
    paidWindowHours: 24,
    defaultPackageKey: "49baht_4scans_24h",
    packages: [
      {
        key: "49baht_4scans_24h",
        priceThb: 49,
        scanCount: 4,
        windowHours: 24,
        active: true,
        label: "49 บาท 4 ครั้ง / 24 ชม.",
      },
    ],
    startAt: null,
    endAt: null,
    configVersion: "t1",
  });

test("buildDeterministicFreeQuotaExhaustedPaywallText: short natural copy + offer numbers", () => {
  const o = testOffer();
  const t = buildDeterministicFreeQuotaExhaustedPaywallText(o);
  assert.ok(t.includes("วันนี้สิทธิ์สแกนฟรีครบแล้วครับ"));
  assert.ok(t.includes("แพ็ก 49 บาท"));
  assert.ok(t.includes("4 ครั้ง"));
  assert.ok(t.includes("24 ชม."));
  assert.ok(t.includes('"จ่าย"'));
  assert.ok(!t.includes("• "));
});

test("buildDeterministicPaywallSoftCloseText", () => {
  assert.equal(
    buildDeterministicPaywallSoftCloseText(),
    "ได้เลยครับ พรุ่งนี้ค่อยส่งมาใหม่ได้เสมอครับ",
  );
});

test("matchesDeterministicPaywallPurchaseIntent: pay / ok / scan ต่อ / แนวครับ", () => {
  assert.ok(matchesDeterministicPaywallPurchaseIntent("จ่าย", "จ่าย"));
  assert.ok(matchesDeterministicPaywallPurchaseIntent("โอเค", "โอเค"));
  assert.ok(matchesDeterministicPaywallPurchaseIntent("scan ต่อ", "scan ต่อ"));
  assert.ok(matchesDeterministicPaywallPurchaseIntent("แนวครับ", "แนวครับ"));
  assert.ok(matchesDeterministicPaywallPurchaseIntent("รายละเอียด", "รายละเอียด"));
});

test("matchesDeterministicPaywallPurchaseIntent: single_supported scan path not matched here", () => {
  assert.equal(matchesDeterministicPaywallPurchaseIntent("สแกนรูปนี้", "สแกนรูปนี้"), false);
});

test("matchesDeterministicPaywallSoftDeclineIntent", () => {
  assert.ok(matchesDeterministicPaywallSoftDeclineIntent("พรุ่งนี้"));
  assert.ok(matchesDeterministicPaywallSoftDeclineIntent("ไว้ก่อน"));
  assert.ok(matchesDeterministicPaywallSoftDeclineIntent("ยังไม่เอา"));
  assert.ok(matchesDeterministicPaywallSoftDeclineIntent("เดี๋ยวก่อน"));
  assert.equal(matchesDeterministicPaywallSoftDeclineIntent("พรุ่งนี้ขอพัก"), false);
});

test("resolveScanOfferAccessContext: free quota exhausted needs freeUsedToday not stray decision key", () => {
  const o = testOffer();
  const broken = resolveScanOfferAccessContext({
    offer: o,
    decision: { usedScans: 2 },
    now: new Date(),
  });
  assert.equal(broken.freeUsedToday, 0);
  assert.notEqual(broken.scenario, "free_quota_exhausted");

  const ok = resolveScanOfferAccessContext({
    offer: o,
    freeUsedToday: 2,
    paidUntil: null,
    paidRemainingScans: 0,
    now: new Date(),
  });
  assert.equal(ok.scenario, "free_quota_exhausted");
});

test("deterministic paywall primary is stable (phase1 must not replace before send)", () => {
  const t = buildDeterministicFreeQuotaExhaustedPaywallText(testOffer());
  assert.ok(t.length > 120);
  assert.ok(t.startsWith("วันนี้สิทธิ์สแกนฟรีครบแล้วครับ"));
});
