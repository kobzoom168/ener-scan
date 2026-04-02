import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildFlexSummarySurfaceFields,
  resolveFlexSummarySurfaceForLine,
  FLEX_SUMMARY_HEADLINE_MAX,
  FLEX_SUMMARY_FIT_MAX,
  FLEX_SUMMARY_BULLET_MAX,
} from "../src/utils/reports/flexSummarySurface.util.js";
import { ENERGY_TYPES } from "../src/services/flex/scanCopy.config.js";
import { lineLooksLikeThaiTruncationArtifact } from "../src/utils/reports/flexSummaryShortCopy.js";

test("buildFlexSummarySurfaceFields: composed complete phrases, caps, 2 bullets", () => {
  const r = buildFlexSummarySurfaceFields({
    wording: {
      mainEnergy: ENERGY_TYPES.PROTECT,
      wordingFamily: "protection",
      flexHeadline: "x".repeat(100),
      lifeTranslation: "เหตุผลยาว " + "y".repeat(120),
      flexBullets: ["บูลเล็ตแรกยาวมาก " + "z".repeat(80), "สอง"],
      bestFor: "",
    },
    mainEnergyLabel: ENERGY_TYPES.PROTECT,
    wordingFamily: "protection",
    seed: "unit-test",
  });
  assert.ok(r.headlineShort.length <= FLEX_SUMMARY_HEADLINE_MAX);
  assert.ok(r.fitReasonShort.length <= FLEX_SUMMARY_FIT_MAX);
  assert.equal(r.bulletsShort.length, 2);
  assert.ok(r.bulletsShort.every((b) => b.length <= FLEX_SUMMARY_BULLET_MAX));
  assert.ok(!r.headlineShort.includes("x"));
  assert.ok(!lineLooksLikeThaiTruncationArtifact(r.headlineShort));
  assert.equal(r.ctaLabel, "เปิดรายงานฉบับเต็ม");
});

test("resolveFlexSummarySurfaceForLine: prefers valid explicit summary.headlineShort", () => {
  const r = resolveFlexSummarySurfaceForLine({
    reportId: "rid",
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

test("resolveFlexSummarySurfaceForLine: recomposes when stored lines look truncated", () => {
  const r = resolveFlexSummarySurfaceForLine({
    reportId: "r1",
    scanId: "s1",
    wording: { mainEnergy: ENERGY_TYPES.BALANCE, wordingFamily: "shielding" },
    summary: {
      mainEnergyLabel: ENERGY_TYPES.BALANCE,
      wordingFamily: "shielding",
      headlineShort: "พลังของชิ้นนี้เหมาะอย่างยิ่งสำหรับคนที่ต้องการคว",
      fitReasonShort: "เหมาะกับการเสริมควา",
      bulletsShort: ["หนึ่ง", "สอง"],
    },
  });
  assert.ok(!r.headlineShort.includes("ต้องการคว"));
  assert.ok(!r.fitReasonShort.includes("เสริมควา"));
});
