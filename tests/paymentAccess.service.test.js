import { test } from "node:test";
import assert from "node:assert/strict";
import { decideScanGate } from "../src/services/scanOfferAccess.resolver.js";
import { loadActiveScanOffer } from "../src/services/scanOffer.loader.js";

/**
 * PR1: gate math is shared with `checkScanAccess` via `decideScanGate`.
 * Integration tests with Supabase are out of scope; behavior vs quota is covered here.
 */

test("default offer from loader matches 2 free / 49 / 5 / 24", () => {
  const o = loadActiveScanOffer(new Date());
  assert.equal(o.freeQuotaPerDay, 2);
  assert.equal(o.paidPriceThb, 49);
  assert.equal(o.paidScanCount, 5);
  assert.equal(o.paidWindowHours, 24);
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
