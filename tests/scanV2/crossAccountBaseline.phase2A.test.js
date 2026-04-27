/**
 * Phase 2A cross-account baseline reuse: payload builder, validation, and structural wiring (no live DB).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildReportPayloadFromGlobalBaseline } from "../../src/services/scanV2/buildReportPayloadFromGlobalBaseline.service.js";
import { validateObjectBaselineJsonForReuse } from "../../src/services/scanV2/objectBaselineExtract.util.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SHA = "b".repeat(64);

/** @returns {import("../../src/stores/scanV2/globalObjectBaselines.db.js").GlobalObjectBaselineRow} */
function baselineRowTemplate(overrides = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    imageSha256: SHA,
    imagePhash: null,
    stableFeatureSeed: null,
    lane: "sacred_amulet",
    objectFamily: "sacred_amulet",
    baselineSchemaVersion: 1,
    promptVersion: "p1",
    scoringVersion: "deterministic_v2",
    objectBaselineJson: {
      baselineSchemaVersion: 1,
      lane: "sacred_amulet",
      objectFamily: "sacred_amulet",
      peakPowerKey: "luck",
      powerCategories: {
        protection: { key: "protection", score: 10, labelThai: "คุ้มครอง" },
        metta: { key: "metta", score: 20, labelThai: "เมตตา" },
        baramee: { key: "baramee", score: 30, labelThai: "บารมี" },
        luck: { key: "luck", score: 88, labelThai: "โชค" },
        fortune_anchor: { key: "fortune_anchor", score: 40, labelThai: "หนุน" },
        specialty: { key: "specialty", score: 50, labelThai: "เฉพาะ" },
      },
      visual: { dominantColor: "gold", materialType: "metal", formFactor: "amulet" },
      image: { imageSha256: SHA, imagePhash: null, thumbnailPath: null },
    },
    axisScoresJson: null,
    peakPowerKey: "luck",
    thumbnailPath: "scan-uploads/x/thumb.webp",
    sourceScanResultV2Id: null,
    sourceUploadId: null,
    confidence: 0.9,
    reuseCount: 0,
    ...overrides,
  };
}

test("buildReportPayloadFromGlobalBaseline: publicToken, userId, axes from baseline; compatibility differs by birthdate", async () => {
  const base = baselineRowTemplate();
  const p1 = await buildReportPayloadFromGlobalBaseline({
    baselineRow: base,
    lineUserId: "U-line-b",
    birthdate: "1990-03-15",
    publicToken: "tok-bbb",
    objectImageUrl: "https://example.com/current-user.jpg",
    scannedAtIso: "2026-04-27T10:00:00.000Z",
    scanRequestId: "req-b",
    legacyScanResultId: "legacy-b",
  });
  const p2 = await buildReportPayloadFromGlobalBaseline({
    baselineRow: base,
    lineUserId: "U-line-b",
    birthdate: "2005-11-01",
    publicToken: "tok-bbb",
    objectImageUrl: "https://example.com/current-user.jpg",
    scannedAtIso: "2026-04-27T10:00:00.000Z",
    scanRequestId: "req-b",
    legacyScanResultId: "legacy-b",
  });

  assert.equal(p1.publicToken, "tok-bbb");
  assert.equal(p1.userId, "U-line-b");
  assert.equal(p1.birthdateUsed, "1990-03-15");
  assert.equal(p1.object?.objectImageUrl, "https://example.com/current-user.jpg");
  assert.equal(p1.amuletV1?.powerCategories?.luck?.score, 88);
  assert.equal(p2.amuletV1?.powerCategories?.luck?.score, 88);
  assert.notEqual(
    p1.summary?.compatibilityPercent,
    p2.summary?.compatibilityPercent,
    "compatibility should recompute from birthdate",
  );
  assert.notDeepEqual(p1.timingV1, p2.timingV1, "timing should differ when birthdate differs");
});

test("validateObjectBaselineJsonForReuse: rejects nested forbidden owner key", () => {
  const bad = {
    lane: "sacred_amulet",
    nested: { ownerProfile: { x: 1 } },
  };
  const r = validateObjectBaselineJsonForReuse(bad);
  assert.equal(r.ok, false);
});

test("env.js: cross-account baseline flags default to false string parsing", () => {
  const src = readFileSync(join(__dirname, "../../src/config/env.js"), "utf8");
  assert.ok(src.includes("ENABLE_CROSS_ACCOUNT_BASELINE_REUSE"));
  assert.ok(src.includes("CROSS_ACCOUNT_BASELINE_REUSE_EXACT_SHA"));
  assert.ok(src.includes("CROSS_ACCOUNT_BASELINE_REUSE_PHASH"));
  assert.ok(src.includes("CROSS_ACCOUNT_BASELINE_PHASH_DIAGNOSTICS"));
  assert.ok(
    src.includes('process.env.CROSS_ACCOUNT_BASELINE_REUSE_EXACT_SHA ?? "false"'),
    "EXACT_SHA should default to false",
  );
});

test("tryCrossAccountExactBaselineReuse.service: gates lane, schema, phash env, forbidden validation", () => {
  const src = readFileSync(
    join(__dirname, "../../src/services/scanV2/tryCrossAccountExactBaselineReuse.service.js"),
    "utf8",
  );
  assert.ok(src.includes('lane_not_sacred_amulet'));
  assert.ok(src.includes("validateObjectBaselineJsonForReuse"));
  assert.ok(src.includes("forbidden_keys_in_baseline_json"));
  assert.ok(src.includes("env.CROSS_ACCOUNT_BASELINE_REUSE_PHASH"));
  assert.ok(src.includes("CROSS_ACCOUNT_BASELINE_EXACT_LOOKUP_START"));
  assert.ok(src.includes("CROSS_ACCOUNT_BASELINE_EXACT_HIT"));
  assert.ok(src.includes("CROSS_ACCOUNT_BASELINE_EXACT_MISS"));
  assert.ok(src.includes("CROSS_ACCOUNT_BASELINE_EXACT_REJECTED"));
  assert.ok(src.includes("CROSS_ACCOUNT_BASELINE_FALLBACK_FULL_SCAN"));
  assert.ok(src.includes("CROSS_ACCOUNT_BASELINE_PHASH_DIAGNOSTIC_START"));
  assert.ok(src.includes("CROSS_ACCOUNT_BASELINE_PHASH_DIAGNOSTIC_CANDIDATES"));
  assert.ok(src.includes("listGlobalObjectBaselinePhashCandidates"));
  assert.ok(src.includes("baselineTotal"));
  assert.ok(src.includes("nearbyShaPrefixes"));
  assert.ok(src.includes("countGlobalObjectBaselines"));
  assert.ok(src.includes("listGlobalObjectBaselineShaPrefixesByPrefix"));
  assert.ok(src.includes('modelName: "global_object_baseline_reuse"'));
});

test("processScanJob.service: same-user SHA dedup before cross-account try; reuse before runDeepScan; outbound skipQuota only for wasExactDup", () => {
  const src = readFileSync(
    join(__dirname, "../../src/services/scanV2/processScanJob.service.js"),
    "utf8",
  );
  const idxDedup = src.indexOf('event: "SCAN_SHA256_DEDUP_HIT"');
  const idxReuse = src.indexOf("await tryCrossAccountExactBaselineReusePhase2A");
  const idxDeep = src.indexOf("scanOut = await runDeepScan");
  assert.ok(idxDedup > 0 && idxReuse > idxDedup, "SHA dedup block should precede cross-account reuse");
  assert.ok(idxReuse > 0 && idxDeep > idxReuse, "runDeepScan should follow reuse attempt");

  const outboundIdx = src.indexOf("skipQuotaDecrement: wasExactDup");
  assert.ok(outboundIdx > 0, "outbound should tie skipQuotaDecrement to wasExactDup only");
  const beforeOutbound = src.slice(0, outboundIdx);
  assert.ok(
    !beforeOutbound.includes("skipQuotaDecrement: baselineCrossAccountReuse"),
    "must not set skipQuotaDecrement from baseline reuse flag alone",
  );
  assert.ok(
    src.includes("if (!baselineCrossAccountReuse)"),
    "full AI scan should be guarded by baseline reuse flag",
  );
  assert.ok(
    /if \(!baselineCrossAccountReuse\)\s*\{[\s\S]*scanOut = await runDeepScan\(/.test(src),
    "runDeepScan should only run on no-reuse path",
  );
});

test("globalObjectBaselines.db: find/select diagnostics helpers + mark logs REUSE_MARKED", () => {
  const src = readFileSync(
    join(__dirname, "../../src/stores/scanV2/globalObjectBaselines.db.js"),
    "utf8",
  );
  assert.ok(src.includes("reuse_count"));
  assert.ok(src.includes("CROSS_ACCOUNT_BASELINE_REUSE_MARKED"));
  assert.ok(src.includes("markGlobalObjectBaselineReused"));
  assert.ok(src.includes("countGlobalObjectBaselines"));
  assert.ok(src.includes("listGlobalObjectBaselineShaPrefixesByPrefix"));
});

test("scan upload debug helper exists for latest SHA/user prefixes", () => {
  const srcStore = readFileSync(join(__dirname, "../../src/stores/scanV2/scanUploads.db.js"), "utf8");
  assert.ok(srcStore.includes("listRecentScanUploadsDebug"));
  assert.ok(srcStore.includes("lineUserIdPrefix"));
  assert.ok(srcStore.includes("imageSha256Prefix"));
  assert.ok(srcStore.includes("imagePhash"));
  assert.ok(srcStore.includes("imagePhashPrefix"));

  const srcScript = readFileSync(
    join(__dirname, "../../scripts/scanV2-debug-latest-uploads.mjs"),
    "utf8",
  );
  assert.ok(srcScript.includes("SCAN_V2_DEBUG_LATEST_UPLOADS"));
  assert.ok(srcScript.includes("listRecentScanUploadsDebug"));
});
