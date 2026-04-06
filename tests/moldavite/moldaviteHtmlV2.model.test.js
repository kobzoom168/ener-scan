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
    "หินช่วยเรื่องงานให้ชัดที่สุดตอนนี้",
    "รองลงมาเป็นความสัมพันธ์",
    "เรื่องการเงินค่อย ๆ ไปก็พอ ไม่ต้องเร่ง",
  ]);
});

test("buildGraphSummaryLinesFromCrystal: relationship lead copy", () => {
  const lines = buildGraphSummaryLinesFromCrystal({
    work: 60,
    relationship: 90,
    money: 55,
  });
  assert.equal(
    lines[0],
    "หินช่วยเรื่องความสัมพันธ์ให้ชัดที่สุดตอนนี้",
  );
});
