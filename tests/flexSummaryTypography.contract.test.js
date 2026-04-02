import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FLEX_SUMMARY_BULLET_MAX,
  FLEX_SUMMARY_FIT_MAX,
  FLEX_SUMMARY_HEADLINE_MAX,
} from "../src/utils/reports/flexSummarySurface.util.js";
import { buildScanSummaryFirstFlex } from "../src/services/flex/flex.summaryFirst.js";

test("Flex summary surface caps are mobile-tight", () => {
  assert.equal(FLEX_SUMMARY_HEADLINE_MAX, 42);
  assert.equal(FLEX_SUMMARY_FIT_MAX, 64);
  assert.equal(FLEX_SUMMARY_BULLET_MAX, 38);
});

test("summary Flex: percent and band are separate text nodes (no 71%+band on one line)", () => {
  const flex = buildScanSummaryFirstFlex("ระดับพลัง: 8/10\nพลังหลัก: สมดุล\nความสอดคล้อง: 50%", {
    reportUrl: "https://example.com/r/t",
    reportPayload: {
      reportId: "r",
      publicToken: "t",
      scanId: "s",
      userId: "u",
      generatedAt: new Date().toISOString(),
      reportVersion: "1",
      object: { objectImageUrl: "", objectLabel: "", objectType: "" },
      summary: {
        energyScore: 8,
        mainEnergyLabel: "สมดุล",
        compatibilityPercent: 71,
        compatibilityBand: "เข้ากันดี",
        headlineShort: "หัวข้อสั้น",
        fitReasonShort: "เหตุผล",
        bulletsShort: ["ก", "ข"],
      },
    },
  });
  const bubble = flex.contents;
  const body = bubble.body;
  const flat = JSON.stringify(body);
  assert.ok(flat.includes("71%"));
  assert.ok(flat.includes("เข้ากันดี"));
  assert.ok(!flat.includes("71%เข้ากันดี"));
});
