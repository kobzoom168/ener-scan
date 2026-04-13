import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReportPayloadFromScan } from "../../src/services/reports/reportPayload.builder.js";
import { buildCrystalBraceletV1Slice } from "../../src/crystalBracelet/crystalBraceletPayload.build.js";
import {
  CRYSTAL_BRACELET_AXIS_ORDER,
  computeCrystalBraceletScoresDeterministicV1,
  crystalBraceletCompatibilityBandFromPercent,
} from "../../src/crystalBracelet/crystalBraceletScores.util.js";
import { renderCrystalBraceletReportV2Html } from "../../src/templates/reports/crystalBraceletReportV2.template.js";
import { buildCrystalBraceletSummaryFirstFlex } from "../../src/services/flex/flex.crystalBraceletSummary.js";

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
  assert.equal(slice.displayCompatibilityPercent, 78);
  assert.equal(slice.scoringMode, "deterministic_v1");
  assert.equal(slice.lane, "crystal_bracelet");
  assert.equal(slice.identity.formFactor, "bracelet");
  assert.equal(slice.identity.objectFamily, "crystal");
  assert.equal(slice.display.namingPolicy, "generic_crystal_bracelet");
  assert.equal(slice.detection.reason, "crystal_bracelet_lane_v1");
  assert.ok(CRYSTAL_BRACELET_AXIS_ORDER.includes(slice.primaryAxis));
  assert.ok(CRYSTAL_BRACELET_AXIS_ORDER.includes(slice.secondaryAxis));
  assert.notEqual(slice.primaryAxis, slice.secondaryAxis);
  assert.equal(Object.keys(slice.axes).length, 6);
  for (const k of CRYSTAL_BRACELET_AXIS_ORDER) {
    assert.ok(slice.axes[k], `missing axis ${k}`);
  }
  assert.equal(
    String(slice.axes.charm_attraction.labelThai || "").trim(),
    "เสน่ห์",
  );
  assert.equal(String(slice.axes.career.labelThai || "").trim(), "การงาน");
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
  assert.equal(slice.htmlReport.graphSummaryRows.length, 2);
  const pLabel = String(
    slice.axes[slice.primaryAxis]?.labelThai || "",
  ).trim();
  const alignKey = String(slice.ownerProfile?.alignAxisKey || "").trim();
  const alignLabel = String(
    slice.axes[alignKey]?.labelThai || "",
  ).trim();
  assert.ok(slice.htmlReport.graphSummaryRows[0].includes(pLabel));
  assert.ok(slice.htmlReport.graphSummaryRows[1].includes("เข้ากับคุณที่สุด"));
  assert.ok(slice.htmlReport.graphSummaryRows[1].includes(alignLabel));
  assert.ok(slice.htmlReport.axisBlurbs?.charm_attraction?.length > 15);
  assert.ok(slice.htmlReport.axisBlurbs?.career?.length > 15);
  assert.ok(slice.htmlReport.axisBlurbs?.love?.length > 15);
  assert.ok(Array.isArray(slice.htmlReport.usageCautionLines));
  assert.ok(slice.htmlReport.usageCautionLines.length >= 2);
  const et = slice.htmlReport.energyTiming;
  assert.ok(et && typeof et === "object");
  assert.ok(String(et.recommendedWeekday || "").length > 2);
  assert.ok(/\d{2}:\d{2}-\d{2}:\d{2}/.test(String(et.recommendedTimeBand || "")));
  assert.ok(String(et.ritualMode || "").length > 10);
  assert.ok(String(et.timingReason || "").length > 20);
  assert.ok(String(et.timingModeKey || "").startsWith("bracelet_v1_"));
  assert.ok(Array.isArray(slice.internalHints?.internalStoneHints));
  assert.ok(slice.ownerProfile && typeof slice.ownerProfile === "object");
  assert.equal(slice.ownerProfile.version, "1");
  assert.ok(Array.isArray(slice.ownerProfile.ownerChips));
  assert.ok(slice.ownerProfile.ownerChips.length >= 2);
  assert.ok(slice.ownerProfile.ownerChips.length <= 3);
  assert.ok(
    CRYSTAL_BRACELET_AXIS_ORDER.includes(slice.ownerProfile.alignAxisKey),
  );
  assert.ok(
    CRYSTAL_BRACELET_AXIS_ORDER.includes(slice.ownerProfile.tensionAxisKey),
  );
  assert.ok(String(slice.flexSurface.ownerProfileTeaser || "").length > 0);
  assert.equal(slice.context?.ownerAxisSessionKey, "rid-bracelet-1");
  assert.equal(
    slice.context?.ownerAxisSeedKey,
    "seed-bracelet-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  );
});

test("buildCrystalBraceletSummaryFirstFlex: axes block shows all 6 dimensions + new section copy", async () => {
  const slice = buildCrystalBraceletV1Slice({
    scanResultId: "rid-flex-6axes",
    seedKey: "seed-flex-6axes-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    detection: { reason: "crystal_bracelet_lane_v1", matchedSignals: [] },
    energyScore: 7.2,
    mainEnergyLabel: "พลังสมดุล",
    ownerFitScore: 70,
  });
  const flex = await buildCrystalBraceletSummaryFirstFlex("", {
    reportPayload: {
      summary: { energyScore: 7.2, compatibilityPercent: 70 },
      crystalBraceletV1: slice,
    },
    reportUrl: "https://example.com/r",
  });
  const j = JSON.stringify(flex);
  assert.equal(flex.contents?.size, "giga", "bracelet flex uses taller bubble");
  assert.ok(j.includes("มิติพลังของกำไล"));
  assert.ok(j.includes("เรียงจากพลังเด่นไปเบา"));
  assert.equal(j.includes("แสดง 4 พลังที่เด่นสุด"), false);
  assert.equal(j.includes("พลังเด่นของกำไล"), false);
  for (const k of CRYSTAL_BRACELET_AXIS_ORDER) {
    const label = String(slice.axes[k]?.labelThai || "").trim();
    assert.ok(label.length > 0, k);
    assert.ok(j.includes(label), `flex should include axis label ${k}`);
  }
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
  assert.ok(html.includes("cb2-foot-intro"));
  assert.ok(html.includes("อ่านผลแบบเฉพาะบุคคล"));
  assert.ok(html.includes("โปรไฟล์เจ้าของ"));
  assert.ok(
    html.includes(
      "ผลนี้อ่านจากพลังรวมของกำไลทั้งเส้น ไม่ยืนยันชนิดหินรายเม็ด",
    ),
  );
  assert.equal(html.includes("คุ้มกัน"), false);
  assert.equal(html.includes("ออร่า"), false);
  assert.ok(html.includes("จังหวะเสริมพลัง"));
  assert.ok(html.includes("cb2-card--et"));
  assert.ok(html.includes("cb2-et-trends"));
  assert.ok(html.includes("cb2-et-strip--week"));
  assert.ok(html.includes("cb2-et-strip--time"));
  assert.ok(html.includes("cb2-et-insight"));
  assert.ok(html.includes("วันเด่น"));
  assert.ok(html.includes("เวลาเด่น"));
  assert.ok(html.includes("cb2-et-sub"));
  assert.ok(
    html.includes("ช่วงที่พลังของกำไลตอบกับคุณได้ดีที่สุด"),
  );
  assert.ok(html.includes("cb2-et-mode-body"));
  assert.equal(html.includes("cb2-et-grid"), false);
  const et = slice.htmlReport?.energyTiming;
  assert.ok(
    et &&
      String(et.ritualMode || "").length > 5 &&
      html.includes(String(et.ritualMode).slice(0, 24)),
  );
  assert.ok(
    et &&
      String(et.timingReason || "").length > 10 &&
      html.includes(String(et.timingReason).slice(0, 28)),
  );
  assert.ok(html.includes("แชร์รายงาน"));
  assert.ok(html.includes("cb2-share-native"));
  assert.ok(html.includes("cb2-share-btn--line"));
  assert.ok(html.includes("lin.ee/6YZeFZ1"));
  assert.equal(html.includes("มิติชีวิตละเอียด"), false);
  assert.equal(html.includes("ความหมายโดยรวม"), false);
  assert.equal(html.includes("การใช้และข้อควรระวัง"), false);
  assert.equal(html.includes("cb2-bubble-cluster"), false);
  assert.equal(html.includes("setActive"), false);
  assert.equal(html.includes("ตาที่ 3"), false);
  assert.equal(html.includes("คะแนนแต่ละมิติ"), false);
  assert.ok(html.includes("cb2-gsum-bar-sub"));
  assert.ok(html.includes("cb2-owner-card--below-summary"));
  assert.ok(html.includes(">เข้ากับคุณ</span>"));
  assert.equal(html.includes("\u201c"), false);
  assert.equal(html.includes("\u201d"), false);
  assert.equal(html.includes("รองลงมา"), false);
});

test("computeCrystalBraceletScoresDeterministicV1: stable seed → stable axes", () => {
  const a = computeCrystalBraceletScoresDeterministicV1("same-seed", {
    sessionKey: "sess-1",
  });
  const b = computeCrystalBraceletScoresDeterministicV1("same-seed", {
    sessionKey: "sess-1",
  });
  assert.equal(a.primaryAxis, b.primaryAxis);
  assert.equal(a.axes.career.score, b.axes.career.score);
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

test("crystalBraceletCompatibilityBandFromPercent: tiers", () => {
  assert.equal(crystalBraceletCompatibilityBandFromPercent(86), "เข้ากันดีมาก");
  assert.equal(crystalBraceletCompatibilityBandFromPercent(72), "เข้ากันค่อนข้างดี");
  assert.equal(crystalBraceletCompatibilityBandFromPercent(58), "เข้ากันในระดับพอดี");
  assert.equal(crystalBraceletCompatibilityBandFromPercent(40), "เข้ากันเบา ๆ");
});

test("SSOT: summary 66 vs internal ownerFit.score 63 — HTML + Flex + owner profile", async () => {
  const slice = buildCrystalBraceletV1Slice({
    scanResultId: "rid-ssot-compat",
    seedKey: "seed-ssot-compat-bracelet-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    detection: { reason: "crystal_bracelet_lane_v1", matchedSignals: [] },
    energyScore: 7.5,
    mainEnergyLabel: "พลังสมดุล",
    ownerFitScore: 66,
    birthdateUsed: "10/04/1995",
  });
  assert.equal(slice.displayCompatibilityPercent, 66);
  slice.ownerFit = {
    score: 63,
    band: "เข้ากันเบา ๆ",
    reason: "internal_only_fixture",
  };
  assert.ok(
    String(slice.ownerProfile.profileSummaryShort || "").includes(
      "โดยรวมถือว่าเข้ากันในระดับพอดี",
    ),
  );
  assert.equal(String(slice.ownerProfile.profileSummaryShort || "").includes("63"), false);

  const html = renderCrystalBraceletReportV2Html({
    generatedAt: new Date().toISOString(),
    summary: {
      energyScore: 7.5,
      compatibilityPercent: 66,
      energyLevelLabel: "A",
    },
    object: {},
    crystalBraceletV1: slice,
  });
  assert.ok(html.includes("66%"));
  assert.equal(html.includes("เข้ากัน 63"), false);

  const flex = await buildCrystalBraceletSummaryFirstFlex("", {
    reportPayload: {
      summary: {
        energyScore: 7.5,
        compatibilityPercent: 66,
      },
      crystalBraceletV1: slice,
    },
    reportUrl: "https://example.com/report",
  });
  const flexJson = JSON.stringify(flex);
  const alignK = slice.ownerProfile.alignAxisKey;
  const alignBar = Math.max(
    0,
    Math.min(100, Math.round(Number(slice.axes[alignK].score))),
  );
  assert.ok(
    flexJson.includes(`"text":"${String(alignBar)}"`),
    "flex main figure = bracelet score on align axis (matches graph summary)",
  );
  assert.ok(
    flexJson.includes("โดยรวม") && flexJson.includes("66%"),
    "overall compatibility still shown under align bar score",
  );
  assert.ok(flexJson.includes("เข้ากันในระดับพอดี"));
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
