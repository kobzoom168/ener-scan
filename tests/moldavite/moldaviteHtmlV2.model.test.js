import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildGraphSummaryLinesFromCrystal,
  buildMoldaviteHtmlV2ViewModel,
  buildRadarSectionCompareHelperLine,
  DEFAULT_RADAR_COMPARE_TARGET_ENERGY_LABEL_MOLDAVITE,
  MOLDAVITE_ENERGY_TIMING_DEFAULTS,
  RADAR_SECTION_COMPARE_HELPER_PREFIX,
} from "../../src/moldavite/moldaviteHtmlV2.model.js";
import { buildMoldaviteV1Slice } from "../../src/moldavite/moldavitePayload.build.js";
import { resolveMoldaviteDisplayNaming } from "../../src/moldavite/moldaviteDisplayNaming.util.js";

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

const namingHigh = resolveMoldaviteDisplayNaming({
  geminiSubtypeConfidence: 0.9,
  moldaviteDecisionSource: "gemini",
  detectionReason: "gemini_crystal_subtype",
});

test("buildMoldaviteHtmlV2ViewModel: energyTiming defaults", () => {
  const mv = buildMoldaviteV1Slice({
    scanResultId: "rid-et",
    detection: { reason: "keyword_match", matchedSignals: ["x"] },
    seedKey: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    energyScore: 7.5,
    mainEnergyLabel: "เร่งการเปลี่ยนแปลง",
    displayNaming: namingHigh,
  });
  const vm = buildMoldaviteHtmlV2ViewModel({
    moldaviteV1: mv,
    scanId: "s-et",
    reportId: "r-et",
    birthdateUsed: "15/03/1990",
    generatedAt: new Date().toISOString(),
    summary: {},
    object: {},
  });
  assert.equal(vm.energyTiming.bestTimeText, MOLDAVITE_ENERGY_TIMING_DEFAULTS.bestTimeText);
  assert.equal(vm.energyTiming.focusAmplifierNote, MOLDAVITE_ENERGY_TIMING_DEFAULTS.focusAmplifierNote);
});

test("buildMoldaviteHtmlV2ViewModel: energyTiming partial override from htmlReport", () => {
  const mv = buildMoldaviteV1Slice({
    scanResultId: "rid-et2",
    detection: { reason: "keyword_match", matchedSignals: ["x"] },
    seedKey: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    energyScore: 7.5,
    mainEnergyLabel: "เร่งการเปลี่ยนแปลง",
    displayNaming: namingHigh,
  });
  mv.htmlReport = {
    ...mv.htmlReport,
    energyTiming: {
      bestTimeText: "ช่วงทดสอบเฉพาะเวลา",
    },
  };
  const vm = buildMoldaviteHtmlV2ViewModel({
    moldaviteV1: mv,
    scanId: "s-et2",
    reportId: "r-et2",
    birthdateUsed: "15/03/1990",
    generatedAt: new Date().toISOString(),
    summary: {},
    object: {},
  });
  assert.equal(vm.energyTiming.bestTimeText, "ช่วงทดสอบเฉพาะเวลา");
  assert.equal(vm.energyTiming.bestDayText, MOLDAVITE_ENERGY_TIMING_DEFAULTS.bestDayText);
});
