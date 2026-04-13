import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReportPayloadFromScan } from "../../src/services/reports/reportPayload.builder.js";
import { buildCrystalBraceletV1Slice } from "../../src/crystalBracelet/crystalBraceletPayload.build.js";
import {
  CRYSTAL_BRACELET_AXIS_ORDER,
  computeCrystalBraceletScoresDeterministicV1,
} from "../../src/crystalBracelet/crystalBraceletScores.util.js";
import { renderCrystalBraceletReportV2Html } from "../../src/templates/reports/crystalBraceletReportV2.template.js";

test("buildCrystalBraceletV1Slice: shape + deterministic_v1 + flexSurface contract", () => {
  const slice = buildCrystalBraceletV1Slice({
    scanResultId: "rid-bracelet-1",
    seedKey: "seed-bracelet-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    detection: { reason: "crystal_bracelet_lane_v1", matchedSignals: [] },
    energyScore: 7.2,
    mainEnergyLabel: "พลังสมดุล",
    ownerFitScore: 78,
  });
  assert.equal(slice.version, "1");
  assert.equal(slice.scoringMode, "deterministic_v1");
  assert.equal(slice.lane, "crystal_bracelet");
  assert.equal(slice.identity.formFactor, "bracelet");
  assert.equal(slice.identity.objectFamily, "crystal");
  assert.equal(slice.display.namingPolicy, "generic_crystal_bracelet");
  assert.equal(slice.detection.reason, "crystal_bracelet_lane_v1");
  assert.ok(CRYSTAL_BRACELET_AXIS_ORDER.includes(slice.primaryAxis));
  assert.ok(CRYSTAL_BRACELET_AXIS_ORDER.includes(slice.secondaryAxis));
  assert.notEqual(slice.primaryAxis, slice.secondaryAxis);
  assert.equal(Object.keys(slice.axes).length, 7);
  assert.ok(slice.axes.third_eye);
  assert.equal(String(slice.axes.third_eye.labelThai || "").trim(), "ตาที่ 3");
  assert.equal(slice.context?.energyScoreSnapshot, 7.2);
  assert.equal(String(slice.flexSurface.headline).trim(), "กำไลหินคริสตัล");
  assert.equal(Array.isArray(slice.flexSurface.bullets), true);
  assert.ok(String(slice.flexSurface.ctaLabel || "").length > 0);
  assert.ok(
    String(slice.flexSurface.mainEnergyWordingLine || "").includes(
      "ไม่ได้ยืนยันชนิดหิน",
    ),
  );
  assert.ok(
    String(slice.flexSurface.htmlOpeningLine || "").length > 40,
    "htmlOpeningLine for HTML/report",
  );
  assert.ok(
    String(slice.flexSurface.fitLine || "").includes("ตอนนี้เด่นสุด"),
  );
  assert.ok(slice.htmlReport && typeof slice.htmlReport === "object");
  assert.ok(Array.isArray(slice.htmlReport.meaningParagraphs));
  assert.ok(slice.htmlReport.meaningParagraphs.length >= 2);
  assert.ok(Array.isArray(slice.htmlReport.graphSummaryRows));
  assert.ok(slice.htmlReport.axisBlurbs?.protection?.length > 20);
  assert.ok(slice.htmlReport.axisBlurbs?.third_eye?.length > 20);
  assert.ok(Array.isArray(slice.htmlReport.usageCautionLines));
  assert.ok(slice.htmlReport.usageCautionLines.length >= 2);
  assert.ok(Array.isArray(slice.internalHints?.internalStoneHints));
  assert.ok(slice.ownerProfile && typeof slice.ownerProfile === "object");
  assert.equal(slice.ownerProfile.version, "1");
  assert.ok(Array.isArray(slice.ownerProfile.ownerChips));
  assert.ok(slice.ownerProfile.ownerChips.length >= 2);
  assert.ok(
    CRYSTAL_BRACELET_AXIS_ORDER.includes(slice.ownerProfile.alignAxisKey),
  );
  assert.ok(
    CRYSTAL_BRACELET_AXIS_ORDER.includes(slice.ownerProfile.tensionAxisKey),
  );
  assert.ok(String(slice.flexSurface.ownerProfileTeaser || "").length > 0);
});

test("renderCrystalBraceletReportV2Html: includes owner profile + disclaimer", () => {
  const slice = buildCrystalBraceletV1Slice({
    scanResultId: "rid-html-1",
    seedKey: "seed-html-bracelet",
    detection: { reason: "crystal_bracelet_lane_v1", matchedSignals: [] },
    energyScore: 7.5,
    mainEnergyLabel: "พลังสมดุล",
    ownerFitScore: 67,
    birthdateUsed: "10/04/1995",
  });
  const html = renderCrystalBraceletReportV2Html({
    generatedAt: new Date().toISOString(),
    summary: {
      energyScore: 7.5,
      compatibilityPercent: 67,
      energyLevelLabel: "A",
    },
    object: {},
    crystalBraceletV1: slice,
  });
  assert.ok(html.includes("โปรไฟล์เจ้าของ"));
  assert.ok(
    html.includes(
      "ผลนี้อ่านจากพลังรวมของกำไลทั้งเส้น ไม่ยืนยันชนิดหินรายเม็ด",
    ),
  );
});

test("computeCrystalBraceletScoresDeterministicV1: stable seed → stable axes", () => {
  const a = computeCrystalBraceletScoresDeterministicV1("same-seed", {
    sessionKey: "sess-1",
  });
  const b = computeCrystalBraceletScoresDeterministicV1("same-seed", {
    sessionKey: "sess-1",
  });
  assert.equal(a.primaryAxis, b.primaryAxis);
  assert.equal(a.axes.work.score, b.axes.work.score);
});

test("buildReportPayloadFromScan: crystal + bracelet + non-Moldavite → crystalBraceletV1", async () => {
  const text = `
ระดับพลัง: 7.5
พลังหลัก: พลังสมดุล
ความสอดคล้อง: 72%

ภาพรวม
โทนนิ่ง

เหตุผลที่เข้ากับเจ้าของ
เหมาะกับช่วงกดดัน

ชิ้นนี้หนุนเรื่อง
• หนุนเรื่องแรก

เหมาะใช้เมื่อ
• เหมาะบรรทัดหนึ่ง

อาจไม่เด่นเมื่อ: ไม่ใช่สายดึงดูด
`;
  const payload = await buildReportPayloadFromScan({
    resultText: text,
    scanResultId: "00000000-0000-4000-8000-00000000cb02",
    scanRequestId: "req-cb-1",
    lineUserId: "U1",
    publicToken: "tok-cb-1",
    objectFamily: "crystal",
    shapeFamily: "bracelet",
    strictSupportedLane: "crystal_bracelet",
    geminiCrystalSubtypeResult: {
      mode: "ok",
      moldaviteLikely: false,
      subtypeConfidence: 0.45,
      crystalSubtype: "mixed_generic",
    },
  });
  assert.ok(payload.crystalBraceletV1, "bracelet lane slice attached");
  assert.equal(payload.crystalBraceletV1.lane, "crystal_bracelet");
  assert.equal(payload.crystalBraceletV1.identity.formFactor, "bracelet");
  assert.equal(payload.moldaviteV1, undefined);
  assert.equal(payload.diagnostics?.crystalBraceletStrictLaneEarlyExit, true);
  assert.equal(payload.diagnostics?.dbWordingSelected, false);
  assert.equal(payload.diagnostics?.wordingPrimarySource, "crystal_bracelet_lane");
  assert.equal(payload.crystalBraceletV1.detection.reason, "crystal_bracelet_strict_lane_v1");
});

test("buildReportPayloadFromScan: strict crystal_bracelet lane skips DB wording hydrate path", async () => {
  const text = `
ระดับพลัง: 7.5
พลังหลัก: พลังสมดุล
ความสอดคล้อง: 72%
ภาพรวม
โทนนิ่ง
`;
  const payload = await buildReportPayloadFromScan({
    resultText: text,
    scanResultId: "00000000-0000-4000-8000-00000000cb99",
    scanRequestId: "req-cb-early",
    lineUserId: "U1",
    publicToken: "tok-cb-early",
    objectFamily: "crystal",
    shapeFamily: "bracelet",
    strictSupportedLane: "crystal_bracelet",
  });
  assert.equal(payload.diagnostics?.crystalBraceletStrictLaneEarlyExit, true);
  assert.equal(payload.diagnostics?.dbWordingSelected, false);
  assert.ok(payload.crystalBraceletV1);
});

test("buildReportPayloadFromScan: crystal without proven bracelet shape => no crystalBraceletV1", async () => {
  const text = `
ระดับพลัง: 7.5
พลังหลัก: พลังสมดุล
ความสอดคล้อง: 72%

ภาพรวม
โทนนิ่ง
`;
  const payload = await buildReportPayloadFromScan({
    resultText: text,
    scanResultId: "00000000-0000-4000-8000-00000000cb03",
    scanRequestId: "req-cb-2",
    lineUserId: "U1",
    publicToken: "tok-cb-2",
    objectFamily: "crystal",
    shapeFamily: "unknown",
    geminiCrystalSubtypeResult: {
      mode: "ok",
      moldaviteLikely: false,
      subtypeConfidence: 0.45,
      crystalSubtype: "mixed_generic",
    },
  });
  assert.equal(payload.crystalBraceletV1, undefined);
});
