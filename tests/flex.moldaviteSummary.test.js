import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMoldaviteSummaryFirstFlex } from "../src/services/flex/flex.moldaviteSummary.js";

const basePayload = {
  reportId: "r1",
  scanId: "s1",
  userId: "u1",
  generatedAt: new Date().toISOString(),
  reportVersion: "1.2.10",
  summary: {
    energyScore: 8,
    compatibilityPercent: 72,
    compatibilityBand: "เข้ากันดี",
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
    detection: { reason: "keyword_match", matchedSignals: ["result_text"] },
    lifeAreas: {},
    primaryLifeArea: "work",
    secondaryLifeArea: "money",
    flexSurface: {
      headline: "มอลดาไวต์ — ทดสอบ",
      fitLine: "บรรทัดรอง",
      bullets: ["bullet 1", "bullet 2"],
      mainEnergyShort: "มอลดาไวต์",
    },
  },
};

test("buildMoldaviteSummaryFirstFlex: requires moldaviteV1 on payload", async () => {
  await assert.rejects(
    () =>
      buildMoldaviteSummaryFirstFlex("text", {
        reportPayload: { ...basePayload, moldaviteV1: undefined },
        reportUrl: "https://report.example/x",
      }),
    /MOLDAVITE_FLEX_MISSING_PAYLOAD/,
  );
});

test("buildMoldaviteSummaryFirstFlex: returns flex bubble without calling generic DB hero path", async () => {
  const flex = await buildMoldaviteSummaryFirstFlex("ignored body", {
    reportPayload: basePayload,
    reportUrl: "https://report.example/x",
    appendReportBubble: false,
  });
  assert.equal(flex.type, "flex");
  assert.ok(String(flex.altText).length > 0);
  const bubble = flex.contents;
  assert.equal(bubble.type, "bubble");
  assert.ok(bubble.hero);
  const bodyText = JSON.stringify(bubble.body);
  assert.ok(bodyText.includes("มอลดาไวต์ — ทดสอบ"));
  assert.ok(bodyText.includes("bullet 1"));
});
