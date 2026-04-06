import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildGraphSummaryLinesFromCrystal,
  buildRadarSectionCompareHelperLine,
  DEFAULT_RADAR_COMPARE_TARGET_ENERGY_LABEL_MOLDAVITE,
  RADAR_SECTION_COMPARE_HELPER_PREFIX,
} from "../../src/moldavite/moldaviteHtmlV2.model.js";

test("buildRadarSectionCompareHelperLine: Moldavite default", () => {
  assert.equal(
    buildRadarSectionCompareHelperLine(DEFAULT_RADAR_COMPARE_TARGET_ENERGY_LABEL_MOLDAVITE),
    `${RADAR_SECTION_COMPARE_HELPER_PREFIX}${DEFAULT_RADAR_COMPARE_TARGET_ENERGY_LABEL_MOLDAVITE}`,
  );
  assert.equal(
    buildRadarSectionCompareHelperLine("พลังของวัตถุ"),
    "เปรียบเทียบคุณกับพลังของวัตถุ",
  );
});

test("buildRadarSectionCompareHelperLine: empty falls back to Moldavite default", () => {
  assert.equal(
    buildRadarSectionCompareHelperLine(""),
    buildRadarSectionCompareHelperLine(DEFAULT_RADAR_COMPARE_TARGET_ENERGY_LABEL_MOLDAVITE),
  );
});

test("buildGraphSummaryLinesFromCrystal: order by score, tie-break work first", () => {
  const lines = buildGraphSummaryLinesFromCrystal({
    work: 82,
    relationship: 75,
    money: 69,
  });
  assert.deepEqual(lines, [
    "หินก้อนนี้เด่นสุดที่งาน",
    "รองลงมาคือความสัมพันธ์",
    "เรื่องการเงินควรค่อย ๆ ดูจังหวะ",
  ]);
});

test("buildGraphSummaryLinesFromCrystal: relationship lead copy", () => {
  const lines = buildGraphSummaryLinesFromCrystal({
    work: 60,
    relationship: 90,
    money: 55,
  });
  assert.equal(lines[0], "หินก้อนนี้ช่วยเรื่องความสัมพันธ์มากที่สุด");
});
