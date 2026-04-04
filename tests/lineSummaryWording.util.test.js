import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveLineSummaryWording,
  lineSummaryBankKey,
  tryLineSummaryFromStoredDbPayload,
  pickLineOpeningFitFromVisibleBundle,
} from "../src/utils/lineSummaryWording.util.js";

/** First entry in `LINE_BANKS.crystal.protection` — used to prove LINE output is not this when DB path wins. */
const LINE_BANK_KNOWN_CRYSTAL_PROTECTION_OPENING =
  "โทนนี้เน้นพื้นที่ปลอดภัยรอบตัว";
const LINE_BANK_KNOWN_CRYSTAL_PROTECTION_FIT =
  "เหมาะเวลาต้องเจอคนหลากหลายหรืออยากกันแรงลบ";

/**
 * Shape aligned with `buildReportPayloadFromScan` when DB surface hydrate succeeded (`dbSurfaceOk`).
 * Field names match `reportPayload.builder` + `reportPayload.types` (summary/diagnostics).
 */
function fixtureReportPayloadDbHydratedLikeBuilder(overrides = {}) {
  const openingShort =
    overrides.openingShort ??
    "VERIFY_DB_STORED_OPENING_ไม่ใช่แบงก์_LINE_โทนเก่า";
  const fitReasonShort =
    overrides.fitReasonShort ??
    "VERIFY_DB_STORED_FIT_ไม่ใช่แบงก์_LINE_โทนเก่า";
  return {
    reportId: "00000000-0000-4000-8000-00000000db01",
    reportVersion: "1.2.3",
    generatedAt: new Date().toISOString(),
    summary: {
      energyCopyObjectFamily: "crystal",
      energyCategoryCode: "protection",
      crystalMode: "general",
      headlineShort: "หัวย่อจาก DB clamp",
      fitReasonShort,
      bulletsShort: ["กระสุน_db_1", "กระสุน_db_2"],
      openingShort,
      teaserShort: undefined,
      presentationAngleId: "noise_cut",
      wordingVariantId: "db:protection",
      ctaLabel: "เปิดรายงานฉบับเต็ม",
      ...overrides.summary,
    },
    diagnostics: {
      objectFamily: "crystal",
      resolvedCategoryCode: "protection",
      wordingPrimarySource: "db",
      visibleCopyUsedCodeFallback: false,
      wordingBankUsed: "db:energy_copy_templates",
      wordingVariantId: "db:protection",
      dbWordingSelected: true,
      dbWordingRowId: 229,
      dbWordingSlot: "headline",
      dbWordingPresentationAngle: null,
      dbWordingClusterTag: null,
      dbWordingFallbackLevel: 0,
      flexPresentationAngleId: "noise_cut",
      ...overrides.diagnostics,
    },
    wording: {},
    ...overrides.root,
  };
}

test("lineSummaryBankKey: crystal + protection", () => {
  assert.equal(lineSummaryBankKey("crystal", "protection"), "crystal.protection");
});

test("tryLineSummaryFromStoredDbPayload: returns aligned lines when DB won on payload", () => {
  const r = tryLineSummaryFromStoredDbPayload({
    summary: {
      energyCopyObjectFamily: "crystal",
      energyCategoryCode: "protection",
      wordingVariantId: "db:protection",
      openingShort: "บรรทัดเปิดจาก DB",
      fitReasonShort: "บรรทัดฟิตจาก DB",
      presentationAngleId: "shield",
    },
    diagnostics: {
      visibleCopyUsedCodeFallback: false,
      wordingPrimarySource: "db",
      dbWordingRowId: 42,
      dbWordingClusterTag: "sem:protection_hint",
      dbWordingFallbackLevel: 0,
    },
    wording: {},
  });
  assert.ok(r);
  assert.equal(r.opening, "บรรทัดเปิดจาก DB");
  assert.equal(r.fitLine, "บรรทัดฟิตจาก DB");
  assert.equal(r.lineSummaryPrimarySource, "stored_db_payload");
  assert.equal(r.lineSummaryUsedBankFallback, false);
});

test("pickLineOpeningFitFromVisibleBundle: maps headline + bullets", () => {
  const p = pickLineOpeningFitFromVisibleBundle({
    headline: "หัวเรื่อง",
    fitLine: "",
    bullets: ["กระสุนหนึ่ง", "กระสุนสอง"],
  });
  assert.ok(p);
  assert.equal(p.opening, "หัวเรื่อง");
  assert.equal(p.fitLine, "กระสุนหนึ่ง");
});

// --- Pre-push: (1) DB-hydrated report payload → stored_db_payload only, never db_resolver / line_bank

test("pre-push (1): fixture matching report DB-hydrate path → stored_db_payload and lines match summary (not bank)", async () => {
  const payload = fixtureReportPayloadDbHydratedLikeBuilder();
  const r = await resolveLineSummaryWording(payload, "U1", "seed-pre1");
  assert.equal(r.lineSummaryPrimarySource, "stored_db_payload");
  assert.equal(r.lineSummaryUsedBankFallback, false);
  assert.notEqual(r.lineSummaryPrimarySource, "db_resolver");
  assert.notEqual(r.lineSummaryPrimarySource, "line_bank");
  assert.equal(
    r.opening,
    payload.summary.openingShort,
    "opening must come from openingShort (same lane as stored report/Flex), not async DB re-fetch",
  );
  assert.equal(r.fitLine, payload.summary.fitReasonShort);
  assert.equal(r.presentationAngleId, "noise_cut");
  assert.notEqual(r.opening, LINE_BANK_KNOWN_CRYSTAL_PROTECTION_OPENING);
  assert.notEqual(r.fitLine, LINE_BANK_KNOWN_CRYSTAL_PROTECTION_FIT);
});

// --- Pre-push: (2) code fallback diagnostics → skip stored; DB resolver before LINE bank

test("pre-push (2): code_bank + no db variant id → skips stored even if headlineShort exists; uses db_resolver when DB has rows", async () => {
  const r = await resolveLineSummaryWording(
    {
      reportId: "rep-code-fallback",
      summary: {
        energyCopyObjectFamily: "crystal",
        energyCategoryCode: "protection",
        headlineShort: "คอมโพสจาก fallback — ไม่ใช่เกณฑ์ stored_db",
        fitReasonShort: "ฟิตจาก composed pool",
        wordingVariantId: "crystal.protection:v0",
      },
      diagnostics: {
        visibleCopyUsedCodeFallback: true,
        wordingPrimarySource: "code_bank",
      },
    },
    "Utestuser1",
    "job-pre2",
  );
  assert.equal(r.lineSummaryPrimarySource, "db_resolver");
  assert.equal(r.lineSummaryUsedBankFallback, false);
  assert.notEqual(r.lineSummaryPrimarySource, "stored_db_payload");
  assert.notEqual(r.lineSummaryPrimarySource, "line_bank");
  assert.match(r.summaryBankUsed, /^db:energy_copy_templates:protection/);
});

test("resolveLineSummaryWording: uses stored DB payload when diagnostics say db (no bank)", async () => {
  const r = await resolveLineSummaryWording(
    {
      reportId: "rep-1",
      summary: {
        energyCopyObjectFamily: "crystal",
        energyCategoryCode: "protection",
        wordingVariantId: "db:protection",
        openingShort: "โอเพ่นจากสตอร์",
        fitReasonShort: "ฟิตจากสตอร์",
        presentationAngleId: "calm_shield",
      },
      diagnostics: {
        visibleCopyUsedCodeFallback: false,
        wordingPrimarySource: "db",
        dbWordingRowId: 99,
      },
      wording: {},
    },
    "U1",
    "seed",
  );
  assert.equal(r.opening, "โอเพ่นจากสตอร์");
  assert.equal(r.fitLine, "ฟิตจากสตอร์");
  assert.equal(r.lineSummaryPrimarySource, "stored_db_payload");
  assert.equal(r.lineSummaryUsedBankFallback, false);
  assert.equal(r.presentationAngleId, "calm_shield");
});

// --- Pre-push: (3) category with no DB rows → line_bank only

test("pre-push (3): unknown category code → DB empty → line_bank (not db_resolver)", async () => {
  const r = await resolveLineSummaryWording(
    {
      reportId: "rep-2",
      summary: {
        energyCopyObjectFamily: "crystal",
        energyCategoryCode: "__no_db_category_test_xyz__",
        wordingVariantId: "thai.confidence:v0",
      },
      diagnostics: {
        visibleCopyUsedCodeFallback: true,
        wordingPrimarySource: "code_bank",
      },
    },
    "Utestuser1",
    "job-seed-1",
  );
  assert.ok(r.opening.length > 0);
  assert.ok(r.fitLine.length > 0);
  assert.equal(r.lineSummaryPrimarySource, "line_bank");
  assert.equal(r.lineSummaryUsedBankFallback, true);
  assert.notEqual(r.lineSummaryPrimarySource, "db_resolver");
  assert.notEqual(r.lineSummaryPrimarySource, "stored_db_payload");
  assert.match(r.summaryBankUsed, /^crystal\.__no_db_category_test_xyz__$/);
});

// --- Pre-push: (4) semantic lane — stored / db_resolver must not reproduce LINE bank crystal.protection[0] unless coincidence

test("pre-push (4): stored DB fixture lines stay distinct from LINE bank canonical pair", async () => {
  const payload = fixtureReportPayloadDbHydratedLikeBuilder();
  const r = await resolveLineSummaryWording(payload, "U1", "seed-pre4");
  assert.equal(r.lineSummaryPrimarySource, "stored_db_payload");
  assert.equal(r.opening, payload.summary.openingShort);
  assert.notEqual(r.opening, LINE_BANK_KNOWN_CRYSTAL_PROTECTION_OPENING);
  assert.notEqual(r.fitLine, LINE_BANK_KNOWN_CRYSTAL_PROTECTION_FIT);
});

test("resolveLineSummaryWording: crystal + protection code_bank diagnostics still gets db_resolver (not bank tone)", async () => {
  const r = await resolveLineSummaryWording(
    {
      summary: {
        energyCopyObjectFamily: "crystal",
        energyCategoryCode: "protection",
      },
      diagnostics: {
        visibleCopyUsedCodeFallback: true,
        wordingPrimarySource: "code_bank",
      },
    },
    "Utestuser1",
    "job-seed-1",
  );
  assert.ok(r.opening.length > 0);
  assert.ok(r.fitLine.length > 0);
  assert.equal(r.lineSummaryPrimarySource, "db_resolver");
  assert.match(r.summaryBankUsed, /^db:energy_copy_templates:protection/);
  assert.match(r.summaryVariantId, /^db:[^:]+:protection$/);
});
