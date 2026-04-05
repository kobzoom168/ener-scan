import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMoldaviteSummaryFirstFlex } from "../src/services/flex/flex.moldaviteSummary.js";

/** Must match `bubble.body` keys in `flex.summaryFirst.js` (known-good LINE path). */
const SUMMARY_FIRST_BODY_KEYS = [
  "backgroundColor",
  "contents",
  "layout",
  "paddingAll",
  "spacing",
  "type",
];

const moldavitePayload = {
  reportId: "r1",
  scanId: "s1",
  userId: "u1",
  generatedAt: new Date().toISOString(),
  reportVersion: "1.2.10",
  summary: {
    energyScore: 7.5,
    compatibilityPercent: 76,
    compatibilityBand: "เข้ากันได้",
    summaryLine: "test",
  },
  object: {
    objectImageUrl: "https://example.com/hero.jpg",
  },
  sections: {},
  trust: {},
  actions: {},
  moldaviteV1: {
    version: "1",
    scoringMode: "deterministic_v1",
    detection: { reason: "keyword_match", matchedSignals: ["x"] },
    lifeAreas: {
      work: { key: "work", score: 80, labelThai: "งาน" },
      money: { key: "money", score: 70, labelThai: "การเงิน" },
      relationship: {
        key: "relationship",
        score: 60,
        labelThai: "ความสัมพันธ์",
      },
    },
    flexSurface: {
      headline: "มอลดาไวต์",
      fitLine: "ฟิต",
      bullets: ["a", "b"],
      mainEnergyShort: "เร่งการเปลี่ยนแปลง",
      tagline: "แท็กไลน์",
    },
  },
};

test("Moldavite bubble.body uses same top-level box keys as generic summary-first (LINE-safe parity)", async () => {
  const mv = await buildMoldaviteSummaryFirstFlex("x", {
    reportPayload: moldavitePayload,
    reportUrl: "https://report.example/x",
  });

  const b = mv.contents.body;
  assert.equal(b.type, "box");
  assert.deepEqual(Object.keys(b).sort(), [...SUMMARY_FIRST_BODY_KEYS].sort());

  assert.equal(b.paddingAll, "20px");
  assert.equal(b.spacing, "md");
  assert.equal(b.layout, "vertical");

  assert.ok(!("paddingTop" in b));
  assert.ok(!("paddingBottom" in b));
  assert.ok(!("paddingStart" in b));
  assert.ok(!("paddingEnd" in b));
});
