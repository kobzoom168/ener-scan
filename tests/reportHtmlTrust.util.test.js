import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveScannedAtIsoForReportMeta } from "../src/utils/reports/reportHtmlTrust.util.js";

/** Past instants so `Date.now()`-relative “not too far future” guards in the resolver do not flake. */
const GEN = "2024-04-16T10:00:00.000Z";
const HERO = "2024-04-17T10:00:00.000Z";
const TOP = "2024-04-18T10:00:00.000Z";
const COMPAT = "2024-04-19T10:00:00.000Z";

test("resolveScannedAtIsoForReportMeta: prefers generatedAt over compatibility.inputs.scannedAt", () => {
  const iso = resolveScannedAtIsoForReportMeta(
    {
      generatedAt: GEN,
      compatibility: { inputs: { scannedAt: COMPAT } },
    },
    HERO,
  );
  assert.equal(iso, GEN);
});

test("resolveScannedAtIsoForReportMeta: uses hero when generatedAt missing/invalid", () => {
  const iso = resolveScannedAtIsoForReportMeta(
    {
      generatedAt: "not-a-date",
      compatibility: { inputs: { scannedAt: COMPAT } },
    },
    HERO,
  );
  assert.equal(iso, HERO);
});

test("resolveScannedAtIsoForReportMeta: uses payload.scannedAt before compatibility.inputs.scannedAt", () => {
  const iso = resolveScannedAtIsoForReportMeta(
    {
      generatedAt: "",
      scannedAt: TOP,
      compatibility: { inputs: { scannedAt: COMPAT } },
    },
    "",
  );
  assert.equal(iso, TOP);
});

test("resolveScannedAtIsoForReportMeta: last resort compatibility.inputs.scannedAt", () => {
  const iso = resolveScannedAtIsoForReportMeta(
    {
      generatedAt: "",
      compatibility: { inputs: { scannedAt: COMPAT } },
    },
    "",
  );
  assert.equal(iso, COMPAT);
});

test("resolveScannedAtIsoForReportMeta: drops suspicious compatibility.inputs.scannedAt (too short)", () => {
  const iso = resolveScannedAtIsoForReportMeta(
    {
      generatedAt: "",
      compatibility: { inputs: { scannedAt: "2019-01-01" } },
    },
    "",
  );
  assert.equal(iso, "");
});

test("resolveScannedAtIsoForReportMeta: no payload uses hero only", () => {
  assert.equal(resolveScannedAtIsoForReportMeta(null, HERO), HERO);
});
