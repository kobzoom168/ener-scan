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

test("buildSacredAmuletLibraryViewFromItems: exact sha256 groups and picks latest representative", () => {
  const aOld = extractSacredAmuletLibraryItem(
    makeRaw({
      token: "tok-a-old",
      reportId: "ra-old",
      generatedAt: "2026-04-10T08:00:00.000Z",
      energyScore: 7.4,
      compatibilityPercent: 70,
      extra: {
        image_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
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
      extra: {
        image_sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
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
  assert.equal(view.topOverall?.groupKeySource, "image_sha256");
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

test("buildSacredAmuletLibraryViewFromItems: groups by pHash distance threshold", () => {
  const a = extractSacredAmuletLibraryItem(
    makeRaw({
      token: "tok-ph-a",
      reportId: "rph-a",
      generatedAt: "2026-04-20T08:00:00.000Z",
      energyScore: 7.3,
      compatibilityPercent: 68,
      extra: { image_phash: "0000000000000000" },
    }),
    { id: "row-ph-a", created_at: "2026-04-20T08:00:00.000Z" },
  );
  const b = extractSacredAmuletLibraryItem(
    makeRaw({
      token: "tok-ph-b",
      reportId: "rph-b",
      generatedAt: "2026-04-22T08:00:00.000Z",
      energyScore: 8.1,
      compatibilityPercent: 79,
      extra: { image_phash: "000000000000000f" },
    }),
    { id: "row-ph-b", created_at: "2026-04-22T08:00:00.000Z" },
  );
  assert.ok(a && b);
  const view = buildSacredAmuletLibraryViewFromItems([a, b]);
  assert.ok(view);
  assert.equal(view.totalCount, 2);
  assert.equal(view.items.length, 1);
  assert.equal(view.items[0]?.scanCountInGroup, 2);
  assert.equal(view.items[0]?.publicToken, "tok-ph-b");
  assert.equal(view.items[0]?.groupKeySource, "image_phash");
});

test("buildSacredAmuletLibraryViewFromItems: possible duplicate is not auto merged", () => {
  const a = extractSacredAmuletLibraryItem(
    makeRaw({
      token: "tok-pd-a",
      reportId: "rpd-a",
      generatedAt: "2026-04-20T08:00:00.000Z",
      energyScore: 7.3,
      compatibilityPercent: 68,
      extra: { image_phash: "0000000000000000" },
    }),
    { id: "row-pd-a", created_at: "2026-04-20T08:00:00.000Z" },
  );
  const b = extractSacredAmuletLibraryItem(
    makeRaw({
      token: "tok-pd-b",
      reportId: "rpd-b",
      generatedAt: "2026-04-22T08:00:00.000Z",
      energyScore: 8.1,
      compatibilityPercent: 79,
      extra: { image_phash: "000000000000001f" },
    }),
    { id: "row-pd-b", created_at: "2026-04-22T08:00:00.000Z" },
  );
  assert.ok(a && b);
  const view = buildSacredAmuletLibraryViewFromItems([a, b]);
  assert.ok(view);
  assert.equal(view.totalCount, 2);
  assert.equal(view.items.length, 2);
  assert.equal(
    view.items.some((it) => it.duplicateStatus === "possible_duplicate"),
    true,
  );
});

test("buildSacredAmuletLibraryViewFromItems: 3 duplicate scans same pHash collapse to one card", () => {
  const rows = ["a", "b", "c"].map((s, i) =>
    extractSacredAmuletLibraryItem(
      makeRaw({
        token: `tok-ph3-${s}`,
        reportId: `rph3-${s}`,
        generatedAt: `2026-04-2${i}T08:00:00.000Z`,
        energyScore: 7 + i * 0.2,
        compatibilityPercent: 65 + i,
        extra: { image_phash: "aaaaaaaaaaaaaaaa" },
      }),
      { id: `row-ph3-${s}`, created_at: `2026-04-2${i}T08:00:00.000Z` },
    ),
  );
  assert.ok(rows.every(Boolean));
  const view = buildSacredAmuletLibraryViewFromItems(/** @type {any[]} */ (rows));
  assert.ok(view);
  assert.equal(view.totalCount, 3);
  assert.equal(view.items.length, 1);
  assert.equal(view.items[0]?.scanCountInGroup, 3);
  assert.equal(view.items[0]?.publicToken, "tok-ph3-c");
});

test("buildSacredAmuletLibraryViewFromItems: same sha256 groups even when publicToken differs", () => {
  const x = extractSacredAmuletLibraryItem(
    makeRaw({
      token: "tok-sha-x",
      reportId: "rsha-x",
      generatedAt: "2026-04-20T08:00:00.000Z",
      energyScore: 7.5,
      compatibilityPercent: 69,
      extra: { image_sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" },
    }),
    { id: "row-sha-x", created_at: "2026-04-20T08:00:00.000Z" },
  );
  const y = extractSacredAmuletLibraryItem(
    makeRaw({
      token: "tok-sha-y",
      reportId: "rsha-y",
      generatedAt: "2026-04-22T08:00:00.000Z",
      energyScore: 8.1,
      compatibilityPercent: 77,
      extra: { image_sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" },
    }),
    { id: "row-sha-y", created_at: "2026-04-22T08:00:00.000Z" },
  );
  assert.ok(x && y);
  const view = buildSacredAmuletLibraryViewFromItems([x, y]);
  assert.ok(view);
  assert.equal(view.totalCount, 2);
  assert.equal(view.items.length, 1);
  assert.equal(view.items[0]?.scanCountInGroup, 2);
  assert.equal(view.items[0]?.publicToken, "tok-sha-y");
  assert.equal(view.items[0]?.groupKeySource, "image_sha256");
});

test("buildSacredAmuletLibraryViewFromItems: axisHighlights picks highest score per axis", () => {
  const hiLuck = extractSacredAmuletLibraryItem(
    makeRaw({
      token: "tok-luck",
      reportId: "rluck",
      generatedAt: "2026-04-20T08:00:00.000Z",
      energyScore: 8.0,
      compatibilityPercent: 70,
      extra: { objectFingerprint: "fp-luck" },
    }),
    { id: "row-luck", created_at: "2026-04-20T08:00:00.000Z" },
  );
  const rawProtBase = makeRaw({
    token: "tok-prot",
    reportId: "rprot",
    generatedAt: "2026-04-21T08:00:00.000Z",
    energyScore: 7.5,
    compatibilityPercent: 72,
    extra: { objectFingerprint: "fp-prot" },
  });
  const hiProt = extractSacredAmuletLibraryItem(
    {
      ...rawProtBase,
      amuletV1: {
        ...rawProtBase.amuletV1,
        powerCategories: {
          protection: { key: "protection", score: 94, labelThai: "คุ้มครอง" },
          metta: { key: "metta", score: 50, labelThai: "เมตตา" },
          baramee: { key: "baramee", score: 50, labelThai: "บารมี" },
          luck: { key: "luck", score: 60, labelThai: "โชคลาภ" },
          fortune_anchor: { key: "fortune_anchor", score: 50, labelThai: "หนุนดวง" },
          specialty: { key: "specialty", score: 50, labelThai: "เฉพาะทาง" },
        },
      },
    },
    { id: "row-prot", created_at: "2026-04-21T08:00:00.000Z" },
  );
  assert.ok(hiLuck && hiProt);
  const view = buildSacredAmuletLibraryViewFromItems([hiLuck, hiProt]);
  assert.ok(view?.axisHighlights);
  const luckH = view.axisHighlights.find((h) => h.axis === "luck");
  const protH = view.axisHighlights.find((h) => h.axis === "protection");
  assert.equal(luckH?.item.publicToken, "tok-luck");
  assert.equal(protH?.item.publicToken, "tok-prot");
  assert.equal(luckH?.axisScore, 85);
  assert.equal(protH?.axisScore, 94);
});

test("buildSacredAmuletLibraryViewFromItems: axisHighlights tie-break uses compat when score and date equal", () => {
  const sameTime = "2026-04-20T08:00:00.000Z";
  const lowCompat = extractSacredAmuletLibraryItem(
    makeRaw({
      token: "tok-tie-a",
      reportId: "rtie-a",
      generatedAt: sameTime,
      energyScore: 7.0,
      compatibilityPercent: 60,
      extra: { objectFingerprint: "fp-tie-a" },
    }),
    { id: "row-tie-a", created_at: sameTime },
  );
  const highCompat = extractSacredAmuletLibraryItem(
    makeRaw({
      token: "tok-tie-b",
      reportId: "rtie-b",
      generatedAt: sameTime,
      energyScore: 7.0,
      compatibilityPercent: 88,
      extra: { objectFingerprint: "fp-tie-b" },
    }),
    { id: "row-tie-b", created_at: sameTime },
  );
  assert.ok(lowCompat && highCompat);
  const view = buildSacredAmuletLibraryViewFromItems([lowCompat, highCompat]);
  assert.ok(view);
  const luckH = view.axisHighlights.find((h) => h.axis === "luck");
  assert.equal(luckH?.item.publicToken, "tok-tie-b");
});
