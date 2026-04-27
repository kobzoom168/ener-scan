import test from "node:test";
import assert from "node:assert/strict";
import { extractObjectBaselineFromReportPayload } from "../../src/services/scanV2/objectBaselineExtract.util.js";

const SHA = "a".repeat(64);

function basePayload(overrides = {}) {
  return {
    reportId: "r1",
    publicToken: "tok-should-not-appear-in-baseline",
    scanId: "s1",
    userId: "U1",
    birthdateUsed: "1990-01-01",
    generatedAt: "2026-04-26T12:00:00.000Z",
    reportVersion: "1",
    object: { objectImageUrl: "https://example.com/x.jpg" },
    summary: {
      energyScore: 8,
      compatibilityPercent: 77,
      mainEnergyLabel: "โชค",
      energyCopyObjectFamily: "sacred_amulet",
    },
    sections: {
      whatItGives: [],
      messagePoints: [],
      ownerMatchReason: [],
      roleDescription: [],
      bestUseCases: [],
      weakMoments: [],
      guidanceTips: [],
      careNotes: [],
      miniRitual: [],
    },
    trust: { trustNote: "" },
    actions: {},
    amuletV1: {
      version: "1",
      scoringMode: "deterministic_v2",
      detection: { reason: "x", matchedSignals: [] },
      powerCategories: {
        protection: { key: "protection", score: 70, labelThai: "คุ้มครอง" },
        metta: { key: "metta", score: 65, labelThai: "เมตตา" },
        baramee: { key: "baramee", score: 60, labelThai: "บารมี" },
        luck: { key: "luck", score: 91, labelThai: "โชค" },
        fortune_anchor: { key: "fortune_anchor", score: 55, labelThai: "หนุน" },
        specialty: { key: "specialty", score: 50, labelThai: "เฉพาะ" },
      },
      primaryPower: "luck",
      secondaryPower: "metta",
      flexSurface: {
        headline: "ทดสอบ",
        fitLine: "",
        bullets: [],
        mainEnergyShort: "โชค",
      },
      htmlReport: { lifeAreaBlurbs: {}, usageCautionLines: [] },
    },
    ...overrides,
  };
}

test("extractObjectBaselineFromReportPayload: scores + peak, no owner fields in baseline JSON", () => {
  const r = extractObjectBaselineFromReportPayload(basePayload(), {
    imageSha256: SHA,
    imagePhash: "abcd",
    thumbnailPath: "scan-uploads/shared/thumb.webp",
    objectCategory: "thai_amulet",
    dominantColorSlug: "gold",
    materialFamily: "metal",
    shapeFamily: "amulet",
  });
  assert.ok(r);
  assert.equal(r.peakPowerKey, "luck");
  assert.equal(r.axisScores.luck, 91);
  const j = JSON.stringify(r.baseline);
  assert.ok(!j.includes("tok-should-not-appear-in-baseline"));
  assert.ok(!j.includes("1990-01-01"));
  assert.ok(!j.includes("compatibilityPercent"));
  assert.ok(!j.includes("U1"));
  assert.equal(r.baseline.baselineSchemaVersion, 1);
  assert.equal(r.baseline.lane, "sacred_amulet");
  assert.equal(r.baseline.image.imageSha256, SHA);
  assert.equal(r.baseline.image.thumbnailPath, null);
  assert.equal(r.baseline.powerCategories.luck.score, 91);
});

test("extractObjectBaselineFromReportPayload: different birthdate does not change axis scores", () => {
  const a = extractObjectBaselineFromReportPayload(
    basePayload({ birthdateUsed: "1990-01-01" }),
    {
      imageSha256: SHA,
      dominantColorSlug: null,
      materialFamily: null,
      shapeFamily: null,
    },
  );
  const b = extractObjectBaselineFromReportPayload(
    basePayload({ birthdateUsed: "2000-05-20" }),
    {
      imageSha256: SHA,
      dominantColorSlug: null,
      materialFamily: null,
      shapeFamily: null,
    },
  );
  assert.ok(a && b);
  assert.deepEqual(a.axisScores, b.axisScores);
});

test("extractObjectBaselineFromReportPayload: returns null without amuletV1", () => {
  const p = basePayload();
  delete p.amuletV1;
  assert.equal(
    extractObjectBaselineFromReportPayload(p, { imageSha256: SHA }),
    null,
  );
});

test("extractObjectBaselineFromReportPayload: rejects invalid sha", () => {
  assert.equal(
    extractObjectBaselineFromReportPayload(basePayload(), { imageSha256: "short" }),
    null,
  );
});
