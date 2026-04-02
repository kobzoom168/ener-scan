import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildFlexSummarySurfaceFields,
  resolveFlexSummarySurfaceForLine,
} from "../src/utils/reports/flexSummarySurface.util.js";

test("buildFlexSummarySurfaceFields: caps lengths and yields 2 bullets", () => {
  const w = {
    flexHeadline: "x".repeat(100),
    lifeTranslation: "เหตุผลยาว " + "y".repeat(120),
    flexBullets: ["บูลเล็ตแรกยาวมาก " + "z".repeat(80), "สอง"],
    bestFor: "",
  };
  const r = buildFlexSummarySurfaceFields({
    wording: w,
    compatibilityReason: "",
    summaryLine: "",
    scanTips: [],
  });
  assert.ok(r.headlineShort.length <= 42);
  assert.ok(r.fitReasonShort.length <= 64);
  assert.equal(r.bulletsShort.length, 2);
  assert.ok(r.bulletsShort.every((b) => b.length <= 38));
  assert.equal(r.ctaLabel, "เปิดรายงานฉบับเต็ม");
});

test("resolveFlexSummarySurfaceForLine: prefers explicit summary.headlineShort", () => {
  const r = resolveFlexSummarySurfaceForLine({
    summary: {
      headlineShort: "ตั้งใจสั้น",
      fitReasonShort: "เหตุผลสั้น",
      bulletsShort: ["ก", "ข"],
      ctaLabel: "เปิดฉบับเต็ม",
    },
  });
  assert.equal(r.headlineShort, "ตั้งใจสั้น");
  assert.equal(r.ctaLabel, "เปิดฉบับเต็ม");
});
