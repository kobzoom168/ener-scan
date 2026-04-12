import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildScanResultFlexWithFallback,
  buildSummaryLinkFlexShell,
} from "../src/services/flex/scanFlexReply.builder.js";

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
    contents: { type: "bubble", body: {} },
  };
}

test("buildScanResultFlexWithFallback: summaryFirst off → legacy only", async () => {
  const out = await buildScanResultFlexWithFallback(
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
      buildScanSummaryFirstFlex: async () => {
        throw new Error("should not call");
      },
    },
  );
  assert.equal(out.summaryFirstBuildFailed, false);
  assert.equal(out.flex.altText, "legacy");
});

test("buildScanResultFlexWithFallback: summaryFirst on → summary builder", async () => {
  const out = await buildScanResultFlexWithFallback(
    {
      summaryFirstEnabled: true,
      resultText: SAMPLE_TEXT,
      birthdate: null,
      reportUrl: null,
      reportPayload: null,
      appendReportBubble: false,
    },
    {
      buildScanSummaryFirstFlex: async () => fakeSummaryFlex(),
      buildScanFlex: () => fakeLegacyFlex(),
    },
  );
  assert.equal(out.summaryFirstBuildFailed, false);
  assert.equal(out.flex.altText, "summary");
  assert.equal(out.flex.contents.type, "bubble");
});

test("buildScanResultFlexWithFallback: moldaviteV1 → moldavite builder (not generic summary-first)", async () => {
  const out = await buildScanResultFlexWithFallback(
    {
      summaryFirstEnabled: true,
      resultText: SAMPLE_TEXT,
      birthdate: null,
      reportUrl: null,
      reportPayload: { moldaviteV1: { version: "1" } },
      appendReportBubble: false,
    },
    {
      buildMoldaviteSummaryFirstFlex: async () => ({
        type: "flex",
        altText: "moldavite_shell",
        contents: { type: "bubble" },
      }),
      buildScanSummaryFirstFlex: async () => {
        throw new Error("should_not_call_summary_first_when_moldavite");
      },
      buildScanFlex: () => fakeLegacyFlex(),
    },
  );
  assert.equal(out.summaryFirstBuildFailed, false);
  assert.equal(out.flex.altText, "moldavite_shell");
});

test("buildScanResultFlexWithFallback: amuletV1 → sacred amulet builder (not generic summary-first)", async () => {
  const out = await buildScanResultFlexWithFallback(
    {
      summaryFirstEnabled: true,
      resultText: SAMPLE_TEXT,
      birthdate: null,
      reportUrl: null,
      reportPayload: { amuletV1: { version: "1" } },
      appendReportBubble: false,
    },
    {
      buildAmuletSummaryFirstFlex: async () => ({
        type: "flex",
        altText: "amulet_shell",
        contents: { type: "bubble" },
      }),
      buildScanSummaryFirstFlex: async () => {
        throw new Error("should_not_call_summary_first_when_amulet");
      },
      buildScanFlex: () => fakeLegacyFlex(),
    },
  );
  assert.equal(out.summaryFirstBuildFailed, false);
  assert.equal(out.flex.altText, "amulet_shell");
});

test("buildSummaryLinkFlexShell: crystalBraceletV1 → crystal bracelet builder (worker-scan path)", async () => {
  const out = await buildSummaryLinkFlexShell(
    SAMPLE_TEXT,
    {
      birthdate: null,
      reportUrl: null,
      reportPayload: { crystalBraceletV1: { version: "1" } },
      appendReportBubble: false,
    },
    { path: "worker-scan", jobIdPrefix: "job12345" },
    {
      buildCrystalBraceletSummaryFirstFlex: async () => ({
        type: "flex",
        altText: "crystal_bracelet_shell",
        contents: { type: "bubble" },
      }),
      buildScanSummaryFirstFlex: async () => {
        throw new Error("should_not_call_generic_summary_in_worker_cb_lane");
      },
    },
  );
  assert.ok(out && typeof out === "object");
  assert.equal(/** @type {{ altText?: string }} */ (out).altText, "crystal_bracelet_shell");
});

test("buildScanResultFlexWithFallback: crystalBraceletV1 → crystal bracelet builder (not generic summary-first)", async () => {
  const out = await buildScanResultFlexWithFallback(
    {
      summaryFirstEnabled: true,
      resultText: SAMPLE_TEXT,
      birthdate: null,
      reportUrl: null,
      reportPayload: { crystalBraceletV1: { version: "1" } },
      appendReportBubble: false,
    },
    {
      buildCrystalBraceletSummaryFirstFlex: async () => ({
        type: "flex",
        altText: "crystal_bracelet_shell",
        contents: { type: "bubble" },
      }),
      buildScanSummaryFirstFlex: async () => {
        throw new Error("should_not_call_summary_first_when_crystal_bracelet");
      },
      buildScanFlex: () => fakeLegacyFlex(),
    },
  );
  assert.equal(out.summaryFirstBuildFailed, false);
  assert.equal(out.flex.altText, "crystal_bracelet_shell");
});

test("buildScanResultFlexWithFallback: crystalGenericSafeV1 alone → generic summary-first (third lane removed)", async () => {
  const out = await buildScanResultFlexWithFallback(
    {
      summaryFirstEnabled: true,
      resultText: SAMPLE_TEXT,
      birthdate: null,
      reportUrl: null,
      reportPayload: { crystalGenericSafeV1: { version: "1", mode: "generic_safe_v1" } },
      appendReportBubble: false,
    },
    {
      buildScanSummaryFirstFlex: async () => fakeSummaryFlex(),
      buildScanFlex: () => fakeLegacyFlex(),
    },
  );
  assert.equal(out.summaryFirstBuildFailed, false);
  assert.equal(out.flex.altText, "summary");
});

test("buildScanResultFlexWithFallback: summary-first throws → legacy + flag", async () => {
  const out = await buildScanResultFlexWithFallback(
    {
      summaryFirstEnabled: true,
      resultText: SAMPLE_TEXT,
      birthdate: null,
      reportUrl: null,
      reportPayload: null,
      appendReportBubble: false,
    },
    {
      buildScanSummaryFirstFlex: async () => {
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

test("buildScanResultFlexWithFallback: passes objectFamily from reportPayload to legacy buildScanFlex", async () => {
  /** @type {Record<string, unknown>|null} */
  let capturedOpts = null;
  await buildScanResultFlexWithFallback(
    {
      summaryFirstEnabled: false,
      resultText: SAMPLE_TEXT,
      birthdate: null,
      reportUrl: null,
      reportPayload: {
        summary: { energyCopyObjectFamily: "crystal" },
      },
      appendReportBubble: false,
    },
    {
      buildScanFlex: (_text, opts) => {
        capturedOpts = opts;
        return fakeLegacyFlex();
      },
      buildScanSummaryFirstFlex: async () => fakeSummaryFlex(),
    },
  );
  assert.equal(capturedOpts?.objectFamily, "crystal");
});

test("buildScanResultFlexWithFallback: diagnostics.objectFamily when summary slug missing", async () => {
  /** @type {Record<string, unknown>|null} */
  let capturedOpts = null;
  await buildScanResultFlexWithFallback(
    {
      summaryFirstEnabled: false,
      resultText: SAMPLE_TEXT,
      birthdate: null,
      reportUrl: null,
      reportPayload: {
        summary: {},
        diagnostics: { objectFamily: "crystal" },
      },
      appendReportBubble: false,
    },
    {
      buildScanFlex: (_text, opts) => {
        capturedOpts = opts;
        return fakeLegacyFlex();
      },
      buildScanSummaryFirstFlex: async () => fakeSummaryFlex(),
    },
  );
  assert.equal(capturedOpts?.objectFamily, "crystal");
});
