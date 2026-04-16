import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildGraphSummaryLinesFromCrystal,
  buildMoldaviteHtmlV2ViewModel,
  buildRadarSectionCompareHelperLine,
  DEFAULT_RADAR_COMPARE_TARGET_ENERGY_LABEL_MOLDAVITE,
  RADAR_SECTION_COMPARE_HELPER_PREFIX,
} from "../../src/moldavite/moldaviteHtmlV2.model.js";
import { buildMoldaviteV1Slice } from "../../src/moldavite/moldavitePayload.build.js";
import { resolveMoldaviteDisplayNaming } from "../../src/moldavite/moldaviteDisplayNaming.util.js";
import { normalizeReportPayloadForRender } from "../../src/utils/reports/reportPayloadNormalize.util.js";
import { renderMoldaviteReportV2Html } from "../../src/templates/reports/moldaviteReportV2.template.js";

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

test("buildMoldaviteHtmlV2ViewModel: energyTiming deterministic v1 (Moldavite)", () => {
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
    summary: { compatibilityPercent: 76 },
    object: {},
  });
  assert.equal(vm.energyTiming.recommendedWeekday, "วันจันทร์");
  assert.ok(vm.energyTiming.timingReason.includes("เปิดรอบใหม่ทางงาน"));
  assert.equal(vm.energyTiming.nativeIdentity, "change_acceleration");
  assert.ok(vm.energyTiming.ritualMode.includes("ตั้งเจตนา"));
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
      recommendedTimeBand: "ช่วงทดสอบเฉพาะเวลา",
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
  assert.equal(vm.energyTiming.recommendedTimeBand, "ช่วงทดสอบเฉพาะเวลา");
  assert.equal(vm.energyTiming.recommendedWeekday, "วันจันทร์");
});

test("buildMoldaviteHtmlV2ViewModel: legacy bestTimeText overrides recommendedTimeBand", () => {
  const mv = buildMoldaviteV1Slice({
    scanResultId: "rid-et3",
    detection: { reason: "keyword_match", matchedSignals: ["x"] },
    seedKey: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    energyScore: 7.5,
    mainEnergyLabel: "เร่งการเปลี่ยนแปลง",
    displayNaming: namingHigh,
  });
  mv.htmlReport = {
    ...mv.htmlReport,
    energyTiming: {
      bestTimeText: "legacy เวลา override",
    },
  };
  const vm = buildMoldaviteHtmlV2ViewModel({
    moldaviteV1: mv,
    scanId: "s-et3",
    reportId: "r-et3",
    birthdateUsed: "15/03/1990",
    generatedAt: new Date().toISOString(),
    summary: {},
    object: {},
  });
  assert.equal(vm.energyTiming.recommendedTimeBand, "legacy เวลา override");
});

test("renderMoldaviteReportV2Html: timing section reads vm.energyTiming only (visual shell, no re-derive)", () => {
  const mv = buildMoldaviteV1Slice({
    scanResultId: "rid-et-html",
    detection: { reason: "keyword_match", matchedSignals: ["x"] },
    seedKey: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    energyScore: 7.5,
    mainEnergyLabel: "เร่งการเปลี่ยนแปลง",
    displayNaming: namingHigh,
  });
  const raw = {
    reportId: "r-et-html",
    scanId: "s-et-html",
    birthdateUsed: "15/03/1990",
    generatedAt: new Date().toISOString(),
    reportVersion: "1.0.0",
    object: {},
    summary: {
      energyScore: 7.5,
      energyLevelLabel: "สูง",
      mainEnergyLabel: mv.flexSurface.mainEnergyShort,
      compatibilityPercent: 76,
      summaryLine: "x",
    },
    sections: {},
    trust: {},
    actions: {},
    wording: {},
    moldaviteV1: mv,
  };
  const { payload } = normalizeReportPayloadForRender(raw);
  const vm = buildMoldaviteHtmlV2ViewModel({
    moldaviteV1: payload.moldaviteV1,
    scanId: payload.scanId,
    reportId: payload.reportId,
    birthdateUsed: payload.birthdateUsed,
    generatedAt: payload.generatedAt,
    summary: payload.summary || {},
    object: payload.object || {},
  });
  const html = renderMoldaviteReportV2Html(payload);
  assert.ok(html.includes("จังหวะเสริมพลัง"));
  assert.ok(
    html.includes("ช่วงที่ Moldavite ตอบกับจังหวะของคุณได้ดีที่สุด"),
  );
  assert.ok(html.includes('class="mv2-et-sub"'));
  assert.ok(html.includes('class="mv2-et-strip mv2-et-strip--weekday"'));
  assert.ok(html.includes('class="mv2-et-strip mv2-et-strip--time"'));
  assert.ok(html.includes('class="mv2-et-insight"'));
  assert.ok(html.includes('class="mv2-et-mode-body"'));
  assert.ok(html.includes("แชร์และบันทึก"));
  assert.ok(html.includes('id="mv2-btn-share"'));
  assert.ok(html.includes("navigator.share"));
  assert.ok(html.includes(vm.energyTiming.recommendedWeekday));
  assert.ok(html.includes(vm.energyTiming.recommendedTimeBand));
  assert.ok(html.includes(vm.energyTiming.ritualMode));
  assert.ok(html.includes(vm.energyTiming.timingReason));
});

test("renderMoldaviteReportV2Html: htmlReport energyTiming override still drives strips (presentation only)", () => {
  const mv = buildMoldaviteV1Slice({
    scanResultId: "rid-et-ov",
    detection: { reason: "keyword_match", matchedSignals: ["x"] },
    seedKey: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    energyScore: 7.5,
    mainEnergyLabel: "เร่งการเปลี่ยนแปลง",
    displayNaming: namingHigh,
  });
  mv.htmlReport = {
    ...mv.htmlReport,
    energyTiming: {
      recommendedTimeBand: "ช่วงทดสอบเฉพาะเวลา",
    },
  };
  const raw = {
    reportId: "r-et-ov",
    scanId: "s-et-ov",
    birthdateUsed: "15/03/1990",
    generatedAt: new Date().toISOString(),
    reportVersion: "1.0.0",
    object: {},
    summary: {
      energyScore: 7.5,
      energyLevelLabel: "สูง",
      mainEnergyLabel: mv.flexSurface.mainEnergyShort,
      compatibilityPercent: 76,
      summaryLine: "x",
    },
    sections: {},
    trust: {},
    actions: {},
    wording: {},
    moldaviteV1: mv,
  };
  const { payload } = normalizeReportPayloadForRender(raw);
  const html = renderMoldaviteReportV2Html(payload);
  assert.ok(html.includes("ช่วงทดสอบเฉพาะเวลา"));
  assert.ok(html.includes('aria-label="เวลาเด่น ช่วงทดสอบเฉพาะเวลา"'));
});
