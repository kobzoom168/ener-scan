import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCompatibilityPercent } from "../src/services/reports/reportPayload.builder.js";
import { normalizeReportPayloadForRender } from "../src/utils/reports/reportPayloadNormalize.util.js";

test("parseCompatibilityPercent: percent and 0–10 scale", () => {
  assert.equal(parseCompatibilityPercent("78%"), 78);
  assert.equal(parseCompatibilityPercent("7.8"), 78);
  assert.equal(parseCompatibilityPercent("10"), 100);
  assert.equal(parseCompatibilityPercent("-"), null);
});

test("normalizeReportPayloadForRender: empty input gets defaults", () => {
  const { payload, warnings } = normalizeReportPayloadForRender(null);
  assert.ok(Array.isArray(warnings));
  assert.ok(warnings.includes("payload_not_object"));
  assert.ok(payload.summary.summaryLine.length > 0);
  assert.ok(Array.isArray(payload.sections.whatItGives));
});

test("normalizeReportPayloadForRender: partial nested", () => {
  const { payload, warnings } = normalizeReportPayloadForRender({
    reportId: "x",
    publicToken: "y",
    scanId: "z",
    userId: "u",
    generatedAt: "not-a-date",
    summary: { summaryLine: "hi" },
  });
  assert.ok(warnings.includes("invalid_generatedAt"));
  assert.equal(payload.summary.summaryLine, "hi");
});

test("normalizeReportPayloadForRender: string energyScore", () => {
  const { payload } = normalizeReportPayloadForRender({
    summary: { energyScore: "8.5", summaryLine: "t" },
    sections: {},
    trust: {},
    actions: {},
    object: {},
  });
  assert.equal(payload.summary.energyScore, 8.5);
});
