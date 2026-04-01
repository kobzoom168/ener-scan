import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildFinalDeliveryCorrelation,
  buildScanResultOutboundTrace,
  classifyReportPublicationBuildError,
  FinalDeliveryErrorCode,
  publicTokenPrefix12,
} from "../src/utils/scanV2/finalDeliveryTelemetry.util.js";

test("publicTokenPrefix12 truncates safely", () => {
  assert.equal(publicTokenPrefix12("abcdefghijklmno"), "abcdefghijkl");
  assert.equal(publicTokenPrefix12("short"), "short");
  assert.equal(publicTokenPrefix12(""), "");
});

test("buildFinalDeliveryCorrelation omits empty ids", () => {
  const c = buildFinalDeliveryCorrelation({
    path: "worker-scan",
    jobId: "job-uuid-123456",
    publicToken: "tokentokentok",
  });
  assert.equal(c.path, "worker-scan");
  assert.equal(c.jobIdPrefix, "job-uuid");
  assert.equal(c.publicTokenPrefix, "tokentokento");
});

test("classifyReportPublicationBuildError maps common cases", () => {
  assert.equal(
    classifyReportPublicationBuildError(new Error("missing token for report")),
    FinalDeliveryErrorCode.REPORT_TOKEN_MISSING,
  );
  assert.equal(
    classifyReportPublicationBuildError(new Error("report_payload invalid")),
    FinalDeliveryErrorCode.PUBLICATION_PAYLOAD_MISSING,
  );
  assert.equal(
    classifyReportPublicationBuildError(new Error("something else")),
    FinalDeliveryErrorCode.PUBLICATION_BUILD_FAILED,
  );
});

test("buildScanResultOutboundTrace: summary_link vs legacy_full flags", () => {
  const msg = { related_job_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" };
  const summary = {
    deliveryStrategy: "summary_link",
    reportUrl: "https://x.example/r/abc",
    reportPublicationId: "pubid-here-0000-0000-0000-000000000001",
    scanResultV2Id: "scan-v2-id-here-0000-0000-0000-000000000001",
    publicToken: "publictoken12charsxtra",
    lineSummary: { foo: 1 },
    reportPayload: null,
    accessSource: "free",
  };
  const t1 = buildScanResultOutboundTrace(msg, summary);
  assert.equal(t1.deliveryStrategy, "summary_link");
  assert.equal(t1.summaryLinkMode, true);
  assert.equal(t1.hasLegacyReportPayload, false);
  assert.equal(t1.lineSummaryPresent, true);
  assert.equal(t1.hasReportUrl, true);
  assert.equal(t1.quotaMode, "free");
  assert.equal(t1.accessSource, "free");

  const legacy = {
    deliveryStrategy: "legacy_full",
    reportUrl: "",
    reportPayload: { x: 1 },
    scanResultV2Id: "scan-v2-id-here-0000-0000-0000-000000000001",
    publicToken: "publictoken12charsxtra",
    lineSummary: null,
  };
  const t2 = buildScanResultOutboundTrace(msg, legacy);
  assert.equal(t2.summaryLinkMode, false);
  assert.equal(t2.hasLegacyReportPayload, true);
  assert.equal(t2.lineSummaryPresent, false);
});
