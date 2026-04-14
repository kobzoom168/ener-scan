/**
 * Structural checks for V2 image dedupe + webhook V1 fallback (no live DB).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("lineWebhook: V1 isDuplicateImage only when IMAGE_DEDUP_ENABLED is false", () => {
  const src = readFileSync(join(__dirname, "../src/routes/lineWebhook.js"), "utf8");
  const idxDup = src.indexOf("const isDuplicate = await isDuplicateImage(imageBuffer)");
  assert.ok(idxDup > 0, "expected isDuplicateImage call");
  const before = src.slice(Math.max(0, idxDup - 200), idxDup);
  assert.ok(
    before.includes("!env.IMAGE_DEDUP_ENABLED"),
    "V1 dedupe should be gated behind !env.IMAGE_DEDUP_ENABLED",
  );
});

test("processScanJob: SHA-256 dedup runs before dHash and imports store helper", () => {
  const src = readFileSync(
    join(__dirname, "../src/services/scanV2/processScanJob.service.js"),
    "utf8",
  );
  assert.ok(
    src.includes("findScanUploadBySha256AndUser"),
    "imports findScanUploadBySha256AndUser",
  );
  assert.ok(src.includes("SCAN_SHA256_DEDUP_HIT"), "logs SCAN_SHA256_DEDUP_HIT");
  const shaIdx = src.indexOf("SCAN_SHA256_DEDUP_HIT");
  const dhashIdx = src.indexOf("computeImageDHash(imageBuffer)");
  assert.ok(shaIdx > 0 && dhashIdx > shaIdx, "SHA path should appear before computeImageDHash");
});

test("scanUploads.db exports findScanUploadBySha256AndUser", () => {
  const src = readFileSync(
    join(__dirname, "../src/stores/scanV2/scanUploads.db.js"),
    "utf8",
  );
  assert.ok(
    /export async function findScanUploadBySha256AndUser/.test(src),
    "expected named export findScanUploadBySha256AndUser",
  );
});

test("SQL migration lists completed_at on scan_jobs", () => {
  const src = readFileSync(
    join(__dirname, "../sql/20260410_add_completed_at_scan_jobs.sql"),
    "utf8",
  );
  assert.ok(/completed_at\s+timestamptz/i.test(src));
  assert.ok(/scan_jobs/i.test(src));
});

test("backfill script wires storage + phash insert", () => {
  const src = readFileSync(
    join(__dirname, "../scripts/backfillScanPhashes.js"),
    "utf8",
  );
  assert.ok(src.includes("BACKFILL_LIMIT"));
  assert.ok(src.includes("readScanImageFromStorage"));
  assert.ok(src.includes("insertScanPhash"));
  assert.ok(src.includes("scan_image_phashes"));
  assert.ok(src.includes("upload_id"));
});
