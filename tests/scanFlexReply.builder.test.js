import { test } from "node:test";
import assert from "node:assert/strict";
import { buildScanResultFlexWithFallback } from "../src/services/flex/scanFlexReply.builder.js";

const SAMPLE_TEXT = `คะแนนพลัง: 8.2/10
พลังหลัก: ป้องกัน
ความเข้ากัน: 78%
บทสรุปภาพรวม
ชิ้นนี้ให้ความมั่นใจแบบนิ่ง`;

/** Minimal legacy-shaped flex for assertions. */
function fakeLegacyFlex() {
  return { type: "flex", altText: "legacy", contents: { type: "bubble" } };
}

/** Minimal summary-first-shaped flex for assertions. */
function fakeSummaryFlex() {
  return {
    type: "flex",
    altText: "summary",
    contents: { type: "carousel", contents: [{}, {}] },
  };
}

test("buildScanResultFlexWithFallback: summaryFirst off → legacy only", () => {
  const out = buildScanResultFlexWithFallback(
    {
      summaryFirstEnabled: false,
      resultText: SAMPLE_TEXT,
      birthdate: null,
      reportUrl: null,
      reportPayload: null,
      appendReportBubble: false,
    },
    {
      buildScanFlex: () => fakeLegacyFlex(),
      buildScanSummaryFirstFlex: () => {
        throw new Error("should not call");
      },
    },
  );
  assert.equal(out.summaryFirstBuildFailed, false);
  assert.equal(out.flex.altText, "legacy");
});

test("buildScanResultFlexWithFallback: summaryFirst on → summary builder", () => {
  const out = buildScanResultFlexWithFallback(
    {
      summaryFirstEnabled: true,
      resultText: SAMPLE_TEXT,
      birthdate: null,
      reportUrl: null,
      reportPayload: null,
      appendReportBubble: false,
    },
    {
      buildScanSummaryFirstFlex: () => fakeSummaryFlex(),
      buildScanFlex: () => fakeLegacyFlex(),
    },
  );
  assert.equal(out.summaryFirstBuildFailed, false);
  assert.equal(out.flex.altText, "summary");
  assert.equal(out.flex.contents.contents.length, 2);
});

test("buildScanResultFlexWithFallback: summary-first throws → legacy + flag", () => {
  const out = buildScanResultFlexWithFallback(
    {
      summaryFirstEnabled: true,
      resultText: SAMPLE_TEXT,
      birthdate: null,
      reportUrl: null,
      reportPayload: null,
      appendReportBubble: false,
    },
    {
      buildScanSummaryFirstFlex: () => {
        throw new Error("flex_build_boom");
      },
      buildScanFlex: () => fakeLegacyFlex(),
    },
  );
  assert.equal(out.summaryFirstBuildFailed, true);
  assert.ok(out.error);
  assert.match(String(out.error?.message), /flex_build_boom/);
  assert.equal(out.flex.altText, "legacy");
});
