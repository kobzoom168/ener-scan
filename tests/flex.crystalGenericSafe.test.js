import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCrystalGenericSafeSummaryFirstFlex } from "../src/services/flex/flex.crystalGenericSafe.js";

const basePayload = {
  reportId: "r1",
  scanId: "s1",
  userId: "u1",
  generatedAt: new Date().toISOString(),
  reportVersion: "1.2.11",
  summary: {
    energyScore: 7.5,
    compatibilityPercent: 76,
    compatibilityBand: "เข้ากันดี",
    summaryLine: "test",
  },
  object: {
    objectImageUrl: "https://example.com/hero.jpg",
  },
  sections: {},
  trust: {},
  actions: {},
  crystalGenericSafeV1: {
    version: "1",
    mode: "generic_safe_v1",
    flexSurface: {
      headline: "วัตถุชิ้นนี้อยู่ในกลุ่มหินและคริสตัล",
      fitLine: "บรรทัดรอง",
      bullets: ["bullet 1", "bullet 2"],
      mainEnergyShort: "หิน/คริสตัล",
    },
    display: {},
    context: { scanResultIdPrefix: "r1" },
  },
};

test("buildCrystalGenericSafeSummaryFirstFlex: requires crystalGenericSafeV1 on payload", async () => {
  await assert.rejects(
    () =>
      buildCrystalGenericSafeSummaryFirstFlex("text", {
        reportPayload: { ...basePayload, crystalGenericSafeV1: undefined },
        reportUrl: "https://report.example/x",
      }),
    /CRYSTAL_GENERIC_SAFE_FLEX_MISSING_PAYLOAD/,
  );
});

test("buildCrystalGenericSafeSummaryFirstFlex: returns flex bubble with neutral headline", async () => {
  const flex = await buildCrystalGenericSafeSummaryFirstFlex("ignored body", {
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
  assert.ok(bodyText.includes("วัตถุชิ้นนี้อยู่ในกลุ่มหินและคริสตัล"));
  assert.ok(bodyText.includes("bullet 1"));
  assert.ok(bodyText.includes("หิน/คริสตัล"));
});
