import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REPORT_ROLLOUT_SCHEMA_VERSION,
  deriveFlexPresentationMode,
  deriveReportLinkPlacement,
  getRolloutExecutionContext,
  safeLineUserIdPrefix,
  safeTokenPrefix,
} from "../src/utils/reports/reportRolloutTelemetry.util.js";

test("REPORT_ROLLOUT_SCHEMA_VERSION is 3 (Phase 2.6)", () => {
  assert.equal(REPORT_ROLLOUT_SCHEMA_VERSION, 3);
});

test("getRolloutExecutionContext: NODE_ENV and label truncation", (t) => {
  const prevNode = process.env.NODE_ENV;
  const prevLabel = process.env.ROLLOUT_WINDOW_LABEL;
  t.after(() => {
    if (prevNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNode;
    if (prevLabel === undefined) delete process.env.ROLLOUT_WINDOW_LABEL;
    else process.env.ROLLOUT_WINDOW_LABEL = prevLabel;
  });

  delete process.env.ROLLOUT_WINDOW_LABEL;
  delete process.env.REPORT_ROLLOUT_WINDOW_LABEL;
  process.env.NODE_ENV = "test";
  const a = getRolloutExecutionContext();
  assert.equal(a.nodeEnv, "test");
  assert.equal(a.rolloutWindowLabel, null);

  process.env.ROLLOUT_WINDOW_LABEL = `${"x".repeat(80)}`;
  const b = getRolloutExecutionContext();
  assert.equal(b.rolloutWindowLabel?.length, 64);
});

test("safeTokenPrefix: truncates and never returns full long token", () => {
  assert.equal(safeTokenPrefix("abcdefghijklmnop", 8), "abcdefgh…");
  assert.equal(safeTokenPrefix("short", 8), "short");
  assert.equal(safeTokenPrefix("", 8), "");
});

test("safeLineUserIdPrefix", () => {
  assert.equal(safeLineUserIdPrefix("U1234567890abcdef"), "U1234567…");
});

test("deriveFlexPresentationMode", () => {
  assert.equal(
    deriveFlexPresentationMode({
      flexSummaryFirstEnabled: false,
      summaryFirstBuildFailed: false,
      appendReportBubble: false,
    }),
    "legacy",
  );
  assert.equal(
    deriveFlexPresentationMode({
      flexSummaryFirstEnabled: true,
      summaryFirstBuildFailed: true,
      appendReportBubble: true,
    }),
    "summary_first_fallback_legacy",
  );
  assert.equal(
    deriveFlexPresentationMode({
      flexSummaryFirstEnabled: true,
      summaryFirstBuildFailed: false,
      appendReportBubble: true,
    }),
    "summary_first_append",
  );
  assert.equal(
    deriveFlexPresentationMode({
      flexSummaryFirstEnabled: true,
      summaryFirstBuildFailed: false,
      appendReportBubble: false,
    }),
    "summary_first_footer",
  );
});

test("deriveReportLinkPlacement", () => {
  assert.equal(
    deriveReportLinkPlacement("summary_first_footer", true),
    "footer_uri",
  );
  assert.equal(
    deriveReportLinkPlacement("legacy", true),
    "carousel_bubble",
  );
  assert.equal(deriveReportLinkPlacement("legacy", false), "none");
});
