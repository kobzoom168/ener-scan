import test from "node:test";
import assert from "node:assert/strict";
import { env } from "../../src/config/env.js";
import { tryCrossAccountPhashBaselineReusePhase2C } from "../../src/services/scanV2/tryCrossAccountPhashBaselineReusePhase2C.service.js";

const ORIGINAL_ENABLE = env.CROSS_ACCOUNT_BASELINE_PHASH_REUSE_ENABLED;
const ORIGINAL_MAX_DISTANCE = env.CROSS_ACCOUNT_BASELINE_PHASH_REUSE_MAX_DISTANCE;

function setReuseEnv(enabled, maxDistance) {
  env.CROSS_ACCOUNT_BASELINE_PHASH_REUSE_ENABLED = enabled;
  env.CROSS_ACCOUNT_BASELINE_PHASH_REUSE_MAX_DISTANCE = maxDistance;
}

function baseCtx() {
  return {
    jobId: "job-1",
    lineUserId: "U1234567890",
    appUserId: "app-1",
    birthdate: "1990-01-01",
    imageBuffer: Buffer.from("img"),
    objectCheck: "single_supported",
  };
}

function baseBaseline(overrides = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    imageSha256: "a".repeat(64),
    imagePhash: "abcdabcdabcdabcd",
    stableFeatureSeed: "seed-1",
    lane: "sacred_amulet",
    objectFamily: "sacred_amulet",
    baselineSchemaVersion: 1,
    promptVersion: "p1",
    scoringVersion: "s1",
    objectBaselineJson: {
      objectCategory: "sacred_amulet::standard",
      visual: { dominantColor: "gold" },
    },
    axisScoresJson: null,
    peakPowerKey: "luck",
    thumbnailPath: null,
    sourceScanResultV2Id: null,
    sourceUploadId: null,
    confidence: 1,
    reuseCount: 0,
    ...overrides,
  };
}

function depsTemplate(overrides = {}) {
  return {
    computeImageDHash: async () => "abcdabcdabcdabcd",
    listGlobalObjectBaselinePhashCandidates: async () => [
      {
        baselineId: "00000000-0000-4000-8000-000000000001",
        shaPrefix: "aaaaaaaaaaaa",
        imagePhash: "abcdabcdabcdabcd",
        phashDistance: 0,
        lane: "sacred_amulet",
        objectFamily: "sacred_amulet",
        peakPowerKey: "luck",
        createdAt: "2026-04-27T00:00:00.000Z",
      },
    ],
    findGlobalObjectBaselineById: async () => baseBaseline(),
    createScanRequest: async () => "req-1",
    createScanResult: async () => "legacy-1",
    updateScanRequestStatus: async () => {},
    markGlobalObjectBaselineReused: async () => {},
    log: () => {},
    ...overrides,
  };
}

test.after(() => {
  setReuseEnv(ORIGINAL_ENABLE, ORIGINAL_MAX_DISTANCE);
});

test("phashDistance: 0 with maxDistance: 0 -> reuses baseline", async () => {
  setReuseEnv(true, 0);
  const out = await tryCrossAccountPhashBaselineReusePhase2C(baseCtx(), depsTemplate());
  assert.equal(out.ok, true);
  assert.equal(out.reuseMode, "phash");
  assert.equal(out.phashDistance, 0);
});

test("phashDistance: 1 with maxDistance: 0 -> no reuse", async () => {
  setReuseEnv(true, 0);
  const out = await tryCrossAccountPhashBaselineReusePhase2C(
    baseCtx(),
    depsTemplate({
      listGlobalObjectBaselinePhashCandidates: async (_ph, maxDistance) =>
        maxDistance >= 1
          ? [
              {
                baselineId: "00000000-0000-4000-8000-000000000001",
                shaPrefix: "aaaaaaaaaaaa",
                imagePhash: "abcdabcdabcdabcd",
                phashDistance: 1,
                lane: "sacred_amulet",
                objectFamily: "sacred_amulet",
                peakPowerKey: "luck",
                createdAt: "2026-04-27T00:00:00.000Z",
              },
            ]
          : [],
    }),
  );
  assert.equal(out.ok, false);
});

test("phashDistance: 1 with maxDistance: 2 -> reuses baseline", async () => {
  setReuseEnv(true, 2);
  const out = await tryCrossAccountPhashBaselineReusePhase2C(
    baseCtx(),
    depsTemplate({
      listGlobalObjectBaselinePhashCandidates: async (_ph, maxDistance) =>
        maxDistance >= 1
          ? [
              {
                baselineId: "00000000-0000-4000-8000-000000000001",
                shaPrefix: "aaaaaaaaaaaa",
                imagePhash: "abcdabcdabcdabcd",
                phashDistance: 1,
                lane: "sacred_amulet",
                objectFamily: "sacred_amulet",
                peakPowerKey: "luck",
                createdAt: "2026-04-27T00:00:00.000Z",
              },
            ]
          : [],
    }),
  );
  assert.equal(out.ok, true);
  assert.equal(out.phashDistance, 1);
});

test("wrong lane -> no reuse", async () => {
  setReuseEnv(true, 0);
  const out = await tryCrossAccountPhashBaselineReusePhase2C(
    baseCtx(),
    depsTemplate({
      findGlobalObjectBaselineById: async () => baseBaseline({ lane: "moldavite" }),
    }),
  );
  assert.equal(out.ok, false);
});

test("wrong objectFamily -> no reuse", async () => {
  setReuseEnv(true, 0);
  const out = await tryCrossAccountPhashBaselineReusePhase2C(
    baseCtx(),
    depsTemplate({
      findGlobalObjectBaselineById: async () => baseBaseline({ objectFamily: "crystal" }),
    }),
  );
  assert.equal(out.ok, false);
});

test("invalid baseline schema version -> no reuse", async () => {
  setReuseEnv(true, 0);
  const out = await tryCrossAccountPhashBaselineReusePhase2C(
    baseCtx(),
    depsTemplate({
      findGlobalObjectBaselineById: async () => baseBaseline({ baselineSchemaVersion: 2 }),
    }),
  );
  assert.equal(out.ok, false);
});

test("validateObjectBaselineJsonForReuse fails -> no reuse", async () => {
  setReuseEnv(true, 0);
  const out = await tryCrossAccountPhashBaselineReusePhase2C(
    baseCtx(),
    depsTemplate({
      findGlobalObjectBaselineById: async () =>
        baseBaseline({
          objectBaselineJson: {
            ownerProfile: { name: "x" },
          },
        }),
    }),
  );
  assert.equal(out.ok, false);
});

test("findGlobalObjectBaselineById returns null -> no reuse", async () => {
  setReuseEnv(true, 0);
  const out = await tryCrossAccountPhashBaselineReusePhase2C(
    baseCtx(),
    depsTemplate({
      findGlobalObjectBaselineById: async () => null,
    }),
  );
  assert.equal(out.ok, false);
});

test("computeImageDHash returns invalid -> no reuse and logs no_current_phash", async () => {
  setReuseEnv(true, 0);
  const logs = [];
  const out = await tryCrossAccountPhashBaselineReusePhase2C(
    baseCtx(),
    depsTemplate({
      computeImageDHash: async () => "bad",
      log: (msg) => logs.push(String(msg)),
    }),
  );
  assert.equal(out.ok, false);
  assert.equal(logs.some((x) => x.includes('"reason":"no_current_phash"')), true);
});

test("reuse succeeds -> markGlobalObjectBaselineReused called once", async () => {
  setReuseEnv(true, 0);
  let calls = 0;
  const out = await tryCrossAccountPhashBaselineReusePhase2C(
    baseCtx(),
    depsTemplate({
      markGlobalObjectBaselineReused: async () => {
        calls += 1;
      },
    }),
  );
  assert.equal(out.ok, true);
  assert.equal(calls, 1);
});

test("reuse skipped -> markGlobalObjectBaselineReused not called", async () => {
  setReuseEnv(true, 0);
  let calls = 0;
  const out = await tryCrossAccountPhashBaselineReusePhase2C(
    { ...baseCtx(), objectCheck: "not_single" },
    depsTemplate({
      markGlobalObjectBaselineReused: async () => {
        calls += 1;
      },
    }),
  );
  assert.equal(out.ok, false);
  assert.equal(calls, 0);
});
