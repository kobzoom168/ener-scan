import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSacredAmuletLibraryViewFromItems,
  extractSacredAmuletLibraryItem,
} from "../../src/services/reports/sacredAmuletLibrary.service.js";
import { resolveSacredAmuletLibraryThumbUrl } from "../../src/utils/reports/sacredAmuletLibraryThumbUrl.util.js";

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
    birthdateUsed: "1990-06-15",
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

test("extractSacredAmuletLibraryItem: uploadThumbnailPath in meta wins over objectImageUrl", () => {
  const it = extractSacredAmuletLibraryItem(
    makeRaw({
      token: "tok-thumb-meta",
      reportId: "rthumb",
      generatedAt: "2026-04-20T08:00:00.000Z",
      energyScore: 7.0,
      compatibilityPercent: 70,
      imageUrl: "https://object.example/o.jpg",
    }),
    {
      id: "row-thumb",
      created_at: "2026-04-20T08:00:00.000Z",
      uploadThumbnailPath: "https://thumb.example/t.webp",
    },
  );
  assert.ok(it);
  assert.equal(it.thumbUrl, "https://thumb.example/t.webp");
});

test("library thumb priority pass: thumbnail_path + signed URL before object (simulated enrich)", async () => {
  const it = extractSacredAmuletLibraryItem(
    makeRaw({
      token: "tok-enrich",
      reportId: "renr",
      generatedAt: "2026-04-20T08:00:00.000Z",
      energyScore: 7.0,
      compatibilityPercent: 70,
      imageUrl: "https://object.example/o.jpg",
    }),
    { id: "row-e", created_at: "2026-04-20T08:00:00.000Z" },
  );
  assert.ok(it);
  assert.equal(it.thumbUrl, "https://object.example/o.jpg");
  it.uploadThumbnailPath = "U1/upload-uuid/thumb.webp";
  const fallback = String(it._objectImageUrlForThumb || it.thumbUrl);
  it.thumbUrl = await resolveSacredAmuletLibraryThumbUrl(it.uploadThumbnailPath, fallback, {
    createSignedUrlForPath: async () => "https://signed.example/thumb",
  });
  delete it._objectImageUrlForThumb;
  assert.equal(it.thumbUrl, "https://signed.example/thumb");
});

test("library thumb after enrich: no thumbnail_path keeps object URL", async () => {
  const it = extractSacredAmuletLibraryItem(
    makeRaw({
      token: "tok-no-thumb",
      reportId: "rnt",
      generatedAt: "2026-04-20T08:00:00.000Z",
      energyScore: 7.0,
      compatibilityPercent: 70,
      imageUrl: "https://object.example/only.jpg",
    }),
    { id: "row-nt", created_at: "2026-04-20T08:00:00.000Z" },
  );
  assert.ok(it);
  it.uploadThumbnailPath = null;
  const fallback = String(it._objectImageUrlForThumb || it.thumbUrl);
  it.thumbUrl = await resolveSacredAmuletLibraryThumbUrl(it.uploadThumbnailPath, fallback, {});
  delete it._objectImageUrlForThumb;
  assert.equal(it.thumbUrl, "https://object.example/only.jpg");
});

test("library thumb: signed URL fail falls back to payload objectImageUrl", async () => {
  const it = extractSacredAmuletLibraryItem(
    makeRaw({
      token: "tok-sign-fail",
      reportId: "rsf",
      generatedAt: "2026-04-20T08:00:00.000Z",
      energyScore: 7.0,
      compatibilityPercent: 70,
      imageUrl: "https://object.example/fallback.jpg",
    }),
    { id: "row-sf", created_at: "2026-04-20T08:00:00.000Z" },
  );
  assert.ok(it);
  it.uploadThumbnailPath = "U1/bad/thumb.webp";
  const fallback = String(it._objectImageUrlForThumb || it.thumbUrl);
  it.thumbUrl = await resolveSacredAmuletLibraryThumbUrl(it.uploadThumbnailPath, fallback, {
    createSignedUrlForPath: async () => "",
  });
  delete it._objectImageUrlForThumb;
  assert.equal(it.thumbUrl, "https://object.example/fallback.jpg");
});

test("buildSacredAmuletLibraryViewFromItems: ranking tabs by axis filter by peakPowerKey (not raw axis score)", () => {
  const itemA = extractSacredAmuletLibraryItem(
    makeRaw({
      token: "tok-rank-luck-peak",
      reportId: "rrl",
      generatedAt: "2026-04-20T08:00:00.000Z",
      energyScore: 8.2,
      compatibilityPercent: 71,
      primaryPower: "luck",
      extra: { objectFingerprint: "fp-rank-luck" },
    }),
    { id: "row-rrl", created_at: "2026-04-20T08:00:00.000Z" },
  );
  const rawB = makeRaw({
    token: "tok-rank-baramee-high-luck",
    reportId: "rrb",
    generatedAt: "2026-04-21T08:00:00.000Z",
    energyScore: 8.0,
    compatibilityPercent: 73,
    primaryPower: "baramee",
    extra: { objectFingerprint: "fp-rank-baram" },
  });
  const itemB = extractSacredAmuletLibraryItem(
    {
      ...rawB,
      amuletV1: {
        ...rawB.amuletV1,
        powerCategories: {
          protection: { key: "protection", score: 60, labelThai: "คุ้มครอง" },
          metta: { key: "metta", score: 62, labelThai: "เมตตา" },
          baramee: { key: "baramee", score: 92, labelThai: "บารมี" },
          luck: { key: "luck", score: 88, labelThai: "โชคลาภ" },
          fortune_anchor: { key: "fortune_anchor", score: 50, labelThai: "หนุนดวง" },
          specialty: { key: "specialty", score: 50, labelThai: "เฉพาะทาง" },
        },
      },
    },
    { id: "row-rrb", created_at: "2026-04-21T08:00:00.000Z" },
  );
  const rawProt = makeRaw({
    token: "tok-rank-prot-peak",
    reportId: "rrp",
    generatedAt: "2026-04-22T08:00:00.000Z",
    energyScore: 7.5,
    compatibilityPercent: 72,
    primaryPower: "protection",
    extra: { objectFingerprint: "fp-rank-prot" },
  });
  const itemProt = extractSacredAmuletLibraryItem(
    {
      ...rawProt,
      amuletV1: {
        ...rawProt.amuletV1,
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
    { id: "row-rrp", created_at: "2026-04-22T08:00:00.000Z" },
  );
  const rawMetta = makeRaw({
    token: "tok-rank-metta-peak",
    reportId: "rrm",
    generatedAt: "2026-04-23T08:00:00.000Z",
    energyScore: 7.8,
    compatibilityPercent: 74,
    primaryPower: "metta",
    extra: { objectFingerprint: "fp-rank-metta" },
  });
  const itemMetta = extractSacredAmuletLibraryItem(
    {
      ...rawMetta,
      amuletV1: {
        ...rawMetta.amuletV1,
        powerCategories: {
          protection: { key: "protection", score: 70, labelThai: "คุ้มครอง" },
          metta: { key: "metta", score: 95, labelThai: "เมตตา" },
          baramee: { key: "baramee", score: 55, labelThai: "บารมี" },
          luck: { key: "luck", score: 58, labelThai: "โชคลาภ" },
          fortune_anchor: { key: "fortune_anchor", score: 50, labelThai: "หนุนดวง" },
          specialty: { key: "specialty", score: 50, labelThai: "เฉพาะทาง" },
        },
      },
    },
    { id: "row-rrm", created_at: "2026-04-23T08:00:00.000Z" },
  );
  assert.ok(itemA && itemB && itemProt && itemMetta);
  assert.equal(itemA.peakPowerKey, "luck");
  assert.equal(itemB.peakPowerKey, "baramee");
  assert.equal(itemProt.peakPowerKey, "protection");
  assert.equal(itemMetta.peakPowerKey, "metta");

  const view = buildSacredAmuletLibraryViewFromItems([itemA, itemB, itemProt, itemMetta]);
  assert.ok(view);
  const tokens = (arr) => arr.map((it) => it.publicToken).sort();

  assert.deepEqual(
    tokens(view.byLuck),
    ["tok-rank-luck-peak"],
    "only luck-peak item appears under โชคลาภ tab",
  );
  assert.equal(
    view.byLuck.some((it) => it.publicToken === "tok-rank-baramee-high-luck"),
    false,
    "high luck score but baramee peak must not appear in byLuck",
  );
  assert.deepEqual(tokens(view.byOverall), tokens(view.items));
  assert.deepEqual(tokens(view.byFit), tokens(view.items));
  assert.deepEqual(tokens(view.byProtection), ["tok-rank-prot-peak"]);
  assert.deepEqual(tokens(view.byMetta), ["tok-rank-metta-peak"]);
  assert.deepEqual(tokens(view.byBaramee), ["tok-rank-baramee-high-luck"]);
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
