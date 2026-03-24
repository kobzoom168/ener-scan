import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeScanOffer,
  isOfferActive,
  resolveEffectiveScanOfferFromRaw,
  SCAN_OFFER_SAFE_DEFAULT,
  loadActiveScanOffer,
} from "../src/services/scanOffer.loader.js";

test("normalizeScanOffer: default file shape maps to 2 / 49 / 5 / 24", () => {
  const o = normalizeScanOffer({
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
  assert.equal(o.freeQuotaPerDay, 2);
  assert.equal(o.paidPriceThb, 49);
  assert.equal(o.paidScanCount, 5);
  assert.equal(o.paidWindowHours, 24);
});

test("normalizeScanOffer: invalid numbers fall back to safe defaults", () => {
  const o = normalizeScanOffer({
    freeQuotaPerDay: "x",
    paidPriceThb: -1,
    paidScanCount: 0,
    paidWindowHours: NaN,
  });
  assert.equal(o.freeQuotaPerDay, SCAN_OFFER_SAFE_DEFAULT.freeQuotaPerDay);
  assert.equal(o.paidPriceThb, SCAN_OFFER_SAFE_DEFAULT.paidPriceThb);
});

test("isOfferActive: false when active flag is false", () => {
  const o = normalizeScanOffer({ active: false, label: "x" });
  assert.equal(isOfferActive(o, new Date()), false);
});

test("isOfferActive: false before startAt", () => {
  const o = normalizeScanOffer({
    active: true,
    startAt: "2099-01-01T00:00:00.000Z",
    endAt: null,
  });
  assert.equal(isOfferActive(o, new Date("2020-06-01T00:00:00.000Z")), false);
});

test("isOfferActive: false after endAt", () => {
  const o = normalizeScanOffer({
    active: true,
    startAt: null,
    endAt: "2020-01-01T00:00:00.000Z",
  });
  assert.equal(isOfferActive(o, new Date("2021-06-01T00:00:00.000Z")), false);
});

test("resolveEffectiveScanOfferFromRaw: null → fallback safe default", () => {
  const r = resolveEffectiveScanOfferFromRaw(null, new Date());
  assert.equal(r.usedFallback, true);
  assert.equal(r.offer.freeQuotaPerDay, 2);
  assert.equal(r.offer.paidPriceThb, 49);
});

test("resolveEffectiveScanOfferFromRaw: inactive → fallback (numeric safe default)", () => {
  const r = resolveEffectiveScanOfferFromRaw(
    {
      active: false,
      label: "off",
      freeQuotaPerDay: 9,
      paidPriceThb: 49,
      paidScanCount: 5,
      paidWindowHours: 24,
      startAt: null,
      endAt: null,
      configVersion: "x",
    },
    new Date(),
  );
  assert.equal(r.usedFallback, true);
  assert.equal(r.offer.freeQuotaPerDay, SCAN_OFFER_SAFE_DEFAULT.freeQuotaPerDay);
});

test("resolveEffectiveScanOfferFromRaw: active in window → use file numbers", () => {
  const r = resolveEffectiveScanOfferFromRaw(
    {
      active: true,
      label: "t",
      freeQuotaPerDay: 3,
      paidPriceThb: 49,
      paidScanCount: 5,
      paidWindowHours: 24,
      startAt: null,
      endAt: null,
      configVersion: "1",
    },
    new Date(),
  );
  assert.equal(r.usedFallback, false);
  assert.equal(r.offer.freeQuotaPerDay, 3);
});

test("loadActiveScanOffer: reads repo default json", () => {
  const o = loadActiveScanOffer(new Date());
  assert.equal(o.freeQuotaPerDay, 2);
  assert.equal(o.paidPriceThb, 49);
  assert.equal(o.paidScanCount, 5);
  assert.equal(o.paidWindowHours, 24);
});
