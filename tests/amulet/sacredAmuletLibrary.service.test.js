import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSacredAmuletLibraryViewFromItems,
  extractSacredAmuletLibraryItem,
} from "../../src/services/reports/sacredAmuletLibrary.service.js";

function makeRaw({
  token,
  reportId,
  generatedAt,
  energyScore,
  compatibilityPercent,
  imageUrl,
  primaryPower = "luck",
  extra = {},
}) {
  return {
    publicToken: token,
    reportId,
    scanId: `scan-${reportId}`,
    userId: "U1",
    generatedAt,
    summary: {
      energyScore,
      compatibilityPercent,
      mainEnergyLabel: "โชคลาภ",
    },
    object: { objectImageUrl: imageUrl || "" },
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
        protection: { key: "protection", score: 80, labelThai: "คุ้มครอง" },
        metta: { key: "metta", score: 65, labelThai: "เมตตา" },
        baramee: { key: "baramee", score: 58, labelThai: "บารมี" },
        luck: { key: "luck", score: 85, labelThai: "โชคลาภ" },
        fortune_anchor: { key: "fortune_anchor", score: 55, labelThai: "หนุนดวง" },
        specialty: { key: "specialty", score: 50, labelThai: "เฉพาะทาง" },
      },
      primaryPower,
      secondaryPower: "metta",
      flexSurface: { headline: "ทดสอบ", fitLine: "", bullets: [], mainEnergyShort: "โชคลาภ" },
      htmlReport: { lifeAreaBlurbs: {}, usageCautionLines: [] },
    },
    ...extra,
  };
}

test("buildSacredAmuletLibraryViewFromItems: groups by trusted key and picks latest representative", () => {
  const aOld = extractSacredAmuletLibraryItem(
    makeRaw({
      token: "tok-a-old",
      reportId: "ra-old",
      generatedAt: "2026-04-10T08:00:00.000Z",
      energyScore: 7.4,
      compatibilityPercent: 70,
      extra: { stableFeatureSeed: "seed-obj-a" },
    }),
    { id: "row-a-old", created_at: "2026-04-10T08:00:00.000Z" },
  );
  const aNew = extractSacredAmuletLibraryItem(
    makeRaw({
      token: "tok-a-new",
      reportId: "ra-new",
      generatedAt: "2026-04-20T08:00:00.000Z",
      energyScore: 8.6,
      compatibilityPercent: 88,
      extra: { stableFeatureSeed: "seed-obj-a" },
    }),
    { id: "row-a-new", created_at: "2026-04-20T08:00:00.000Z" },
  );
  const b = extractSacredAmuletLibraryItem(
    makeRaw({
      token: "tok-b",
      reportId: "rb",
      generatedAt: "2026-04-21T08:00:00.000Z",
      energyScore: 8.0,
      compatibilityPercent: 82,
      extra: { objectFingerprint: "fp-obj-b" },
    }),
    { id: "row-b", created_at: "2026-04-21T08:00:00.000Z" },
  );

  assert.ok(aOld && aNew && b);
  const view = buildSacredAmuletLibraryViewFromItems([aOld, aNew, b]);
  assert.ok(view);
  assert.equal(view.totalCount, 3);
  assert.equal(view.groupedObjectCount, 2);
  assert.equal(view.items.length, 2);
  assert.equal(view.topOverall?.publicToken, "tok-a-new");
  assert.equal(view.topOverall?.scanCountInGroup, 2);
});

test("buildSacredAmuletLibraryViewFromItems: fallback publicToken does not merge different scans", () => {
  const x = extractSacredAmuletLibraryItem(
    makeRaw({
      token: "tok-x",
      reportId: "rx",
      generatedAt: "2026-04-20T08:00:00.000Z",
      energyScore: 6.8,
      compatibilityPercent: 61,
    }),
    { id: "row-x", created_at: "2026-04-20T08:00:00.000Z" },
  );
  const y = extractSacredAmuletLibraryItem(
    makeRaw({
      token: "tok-y",
      reportId: "ry",
      generatedAt: "2026-04-21T08:00:00.000Z",
      energyScore: 7.1,
      compatibilityPercent: 64,
    }),
    { id: "row-y", created_at: "2026-04-21T08:00:00.000Z" },
  );
  assert.ok(x && y);
  const view = buildSacredAmuletLibraryViewFromItems([x, y]);
  assert.ok(view);
  assert.equal(view.totalCount, 2);
  assert.equal(view.items.length, 2);
  assert.equal(view.groupedObjectCount, null);
  assert.equal(view.items.every((it) => it.scanCountInGroup === 1), true);
});
