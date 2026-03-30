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

test("buildSummaryLinkFallbackText: snippet + URL", () => {
  const long = "บรรทัดแรก\nบรรทัดสอง\nบรรทัดสาม";
  const t = buildSummaryLinkFallbackText(long, "https://x/r/a");
  assert.ok(t.includes("บรรทัดแรก"));
  assert.ok(t.includes("https://x/r/a"));
});
