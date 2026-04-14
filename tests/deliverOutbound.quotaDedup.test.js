/**
 * Paid quota: duplicate re-delivery (dedup) must not decrement remaining scans.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { shouldSkipPaidQuotaDecrementAfterDelivery } from "../src/services/scanV2/deliverOutbound.service.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("shouldSkipPaidQuotaDecrementAfterDelivery: true only when skipQuotaDecrement is true", () => {
  assert.equal(shouldSkipPaidQuotaDecrementAfterDelivery({}), false);
  assert.equal(shouldSkipPaidQuotaDecrementAfterDelivery(null), false);
  assert.equal(
    shouldSkipPaidQuotaDecrementAfterDelivery({ skipQuotaDecrement: false }),
    false,
  );
  assert.equal(
    shouldSkipPaidQuotaDecrementAfterDelivery({ skipQuotaDecrement: true }),
    true,
  );
  assert.equal(
    shouldSkipPaidQuotaDecrementAfterDelivery({
      skipQuotaDecrement: true,
      dedupHit: true,
      dedupType: "sha256",
    }),
    true,
  );
});

test("processScanJob: dedup outbound payloads include skipQuotaDecrement + dedup metadata", () => {
  const src = readFileSync(
    join(__dirname, "../src/services/scanV2/processScanJob.service.js"),
    "utf8",
  );
  const shaIdx = src.indexOf("SCAN_SHA256_DEDUP_HIT");
  const phIdx = src.indexOf("SCAN_IMAGE_DEDUP_HIT");
  assert.ok(shaIdx > 0 && phIdx > shaIdx);

  const shaBlock = src.slice(shaIdx, phIdx);
  assert.ok(
    shaBlock.includes("skipQuotaDecrement: true"),
    "SHA dedup insertOutboundMessage should set skipQuotaDecrement",
  );
  assert.ok(
    shaBlock.includes('dedupType: "sha256"'),
    "SHA dedup should set dedupType sha256",
  );
  assert.ok(
    shaBlock.includes("dedupHit: true"),
    "SHA dedup should set dedupHit",
  );

  const phBlock = src.slice(phIdx, phIdx + 2500);
  assert.ok(phBlock.includes("skipQuotaDecrement: true"));
  assert.ok(phBlock.includes('dedupType: "phash"'));
  assert.ok(phBlock.includes("dedupHit: true"));
});

test("deliverOutbound.service exports quota skip helper for post-delivery hook", () => {
  assert.equal(typeof shouldSkipPaidQuotaDecrementAfterDelivery, "function");
});
