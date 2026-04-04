import test from "node:test";
import assert from "node:assert/strict";
import {
  extractLineSummaryFields,
  buildSummaryLinkLineText,
  buildSummaryLinkFallbackText,
} from "../src/services/scanV2/lineFinalScanDelivery.builder.js";

test("extractLineSummaryFields: from reportPayload.summary", () => {
  const f = extractLineSummaryFields(
    {
      summary: {
        energyScore: 7,
        mainEnergyLabel: "เมตตา",
        compatibilityPercent: 82,
        summaryLine: "เสริมบารมี",
      },
    },
    null,
  );
  assert.equal(f.energyScore, 7);
  assert.equal(f.mainEnergy, "เมตตา");
  assert.equal(f.compatibility, 82);
  assert.equal(f.headline, "เสริมบารมี");
});

test("buildSummaryLinkLineText: includes scores and URL", () => {
  const t = buildSummaryLinkLineText({
    energyScore: 8,
    mainEnergy: "ปกป้อง",
    compatibility: 75,
    headline: "เหมาะกับงานเจรจา",
    reportUrl: "https://example.com/r/tok",
  });
  assert.ok(t.includes("ปกป้อง"));
  assert.ok(t.includes("8/10"));
  assert.ok(t.includes("75%"));
  assert.ok(t.includes("https://example.com/r/tok"));
});

test("buildSummaryLinkLineText: LINE wording overrides long headline", () => {
  const t = buildSummaryLinkLineText({
    energyScore: 8.5,
    mainEnergy: "ปกป้อง",
    compatibility: 76,
    headline:
      "เด่นเรื่องคุ้มครองและกันแรงลบ — เหมาะกับคนที่ต้องเจอคนเยอะหรือไม่อยากรับพลังแย่ ๆ",
    reportUrl: "https://example.com/r/tok",
    lineWording: {
      opening: "โทนนี้เน้นพื้นที่ปลอดภัยรอบตัว",
      fitLine: "เหมาะเวลาต้องเจอคนหลากหลายหรืออยากกันแรงลบ",
    },
  });
  assert.ok(t.includes("โทนนี้เน้นพื้นที่ปลอดภัยรอบตัว"));
  assert.ok(t.includes("เหมาะเวลาต้องเจอคนหลากหลาย"));
  assert.ok(!t.includes("เด่นเรื่องคุ้มครอง"));
  assert.ok(t.includes("เปิดรายงานฉบับเต็ม"));
});

test("buildSummaryLinkFallbackText: snippet + URL", () => {
  const long = "บรรทัดแรก\nบรรทัดสอง\nบรรทัดสาม";
  const t = buildSummaryLinkFallbackText(long, "https://x/r/a");
  assert.ok(t.includes("บรรทัดแรก"));
  assert.ok(t.includes("https://x/r/a"));
});
