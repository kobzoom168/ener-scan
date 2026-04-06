import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMoldaviteV1Slice } from "../src/moldavite/moldavitePayload.build.js";
import { resolveMoldaviteDisplayNaming } from "../src/moldavite/moldaviteDisplayNaming.util.js";
import { normalizeReportPayloadForRender } from "../src/utils/reports/reportPayloadNormalize.util.js";
import { renderMobileReportHtml } from "../src/templates/reports/mobileReport.template.js";

const namingHigh = resolveMoldaviteDisplayNaming({
  geminiSubtypeConfidence: 0.9,
  moldaviteDecisionSource: "gemini",
  detectionReason: "gemini_crystal_subtype",
});

test("normalize preserves moldaviteV1; HTML includes Moldavite lane sections", () => {
  const mv = buildMoldaviteV1Slice({
    scanResultId: "rid-html",
    detection: { reason: "keyword_match", matchedSignals: ["x"] },
    seedKey: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    energyScore: 7.5,
    mainEnergyLabel: "เร่งการเปลี่ยนแปลง",
    displayNaming: namingHigh,
  });

  const raw = {
    reportId: "r1",
    publicToken: "tok1",
    scanId: "s1",
    userId: "u1",
    birthdateUsed: null,
    generatedAt: new Date().toISOString(),
    reportVersion: "1.0.0",
    object: {
      objectImageUrl: "https://example.com/hero.jpg",
      objectLabel: "วัตถุจากการสแกน",
      objectType: "",
    },
    summary: {
      energyScore: 7.5,
      energyLevelLabel: "สูง",
      mainEnergyLabel: mv.flexSurface.mainEnergyShort,
      compatibilityPercent: 76,
      compatibilityBand: "เข้ากันดี",
      summaryLine:
        "สรุปบรรทัดสำหรับรายงานทดสอบที่ยาวพอสำหรับ normalize และ render",
    },
    sections: {
      whatItGives: [],
      messagePoints: [],
      ownerMatchReason: [],
      roleDescription: "",
      bestUseCases: [],
      weakMoments: [],
      guidanceTips: [],
      careNotes: [],
      miniRitual: [],
    },
    trust: {
      trustNote: "n",
      rendererVersion: "html-1.0.0",
    },
    actions: {
      historyUrl: "",
      rescanUrl: "",
      changeBirthdateUrl: "",
      lineHomeUrl: "",
    },
    wording: {
      heroNaming: mv.flexSurface.heroNamingLine || "",
      mainEnergy: mv.flexSurface.mainEnergyWordingLine || "",
      htmlOpeningLine: mv.flexSurface.htmlOpeningLine || "",
    },
    moldaviteV1: mv,
  };

  const { payload } = normalizeReportPayloadForRender(raw);
  assert.ok(payload.moldaviteV1?.htmlReport);
  const html = renderMobileReportHtml(payload);
  assert.ok(html.includes("พลังไปออกกับเรื่องไหน"));
  assert.ok(html.includes("แรงโทนเปลี่ยนแปลง"));
  assert.ok(html.includes("มุมชีวิตละเอียด"));
  assert.ok(html.includes("การใช้และข้อควรระวัง"));
  assert.ok(html.includes("มอลดาไวต์"));
  assert.ok(!html.includes("ความหมายเชิงลึก"));
});
