import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeExternalHintsIntoWordingContext,
  classifyHintVsObjectFamily,
} from "../src/utils/webEnrichmentMerge.util.js";

test("classifyHintVsObjectFamily — crystal vs amulet wording", () => {
  assert.equal(
    classifyHintVsObjectFamily("พระปิดตาเนื้อผง", "crystal"),
    "hard_conflict",
  );
  assert.equal(
    classifyHintVsObjectFamily("ควอตซ์ใส", "crystal"),
    "ok",
  );
});

test("mergeExternalHintsIntoWordingContext — applies label when default", () => {
  const base = {
    reportId: "r1",
    publicToken: "t",
    scanId: "s",
    userId: "u",
    birthdateUsed: null,
    generatedAt: "2020-01-01T00:00:00.000Z",
    reportVersion: "1",
    object: { objectLabel: "วัตถุจากการสแกน" },
    summary: {
      energyCopyObjectFamily: "thai_amulet",
      headlineShort: "",
    },
    sections: {},
    trust: {},
    actions: {},
    wording: { htmlOpeningLine: "", objectLabel: "วัตถุจากการสแกน" },
  };
  const hints = {
    probableObjectLabel: "พระสมเด็จ",
    spiritualContextHints: ["บูชาเพื่อความสงบในใจ"],
    marketNames: [],
    culturalDescriptors: [],
    sourceUrls: ["https://example.com"],
    confidenceBand: "medium",
    provider: "test",
    fetchedAt: "2020-01-01T00:00:00.000Z",
  };
  const { payload, appliedFields, ignoredConflict } =
    mergeExternalHintsIntoWordingContext(base, hints);
  assert.equal(ignoredConflict, false);
  assert.ok(appliedFields.includes("object.objectLabel"));
  assert.equal(payload.object.objectLabel, "พระสมเด็จ");
  assert.ok(
    String(payload.wording.htmlOpeningLine || "").includes("บูชาเพื่อความสงบ"),
  );
});

test("mergeExternalHintsIntoWordingContext — ignores conflicting crystal label on amulet", () => {
  const base = {
    reportId: "r1",
    publicToken: "t",
    scanId: "s",
    userId: "u",
    birthdateUsed: null,
    generatedAt: "2020-01-01T00:00:00.000Z",
    reportVersion: "1",
    object: { objectLabel: "วัตถุจากการสแกน" },
    summary: { energyCopyObjectFamily: "thai_amulet" },
    sections: {},
    trust: {},
    actions: {},
    wording: { objectLabel: "วัตถุจากการสแกน" },
  };
  const hints = {
    probableObjectLabel: "คริสตัลโรสควอตซ์",
    spiritualContextHints: [],
    marketNames: [],
    culturalDescriptors: [],
    sourceUrls: [],
    provider: "test",
    fetchedAt: "2020-01-01T00:00:00.000Z",
  };
  const { payload, ignoredConflict, mergeMode } =
    mergeExternalHintsIntoWordingContext(base, hints);
  assert.equal(ignoredConflict, true);
  assert.equal(payload.object.objectLabel, "วัตถุจากการสแกน");
  assert.ok(mergeMode.includes("blocked") || mergeMode.includes("conflict"));
});
