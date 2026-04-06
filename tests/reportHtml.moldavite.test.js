import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMoldaviteV1Slice } from "../src/moldavite/moldavitePayload.build.js";
import { resolveMoldaviteDisplayNaming } from "../src/moldavite/moldaviteDisplayNaming.util.js";
import { normalizeReportPayloadForRender } from "../src/utils/reports/reportPayloadNormalize.util.js";
import { renderReportHtmlPage } from "../src/services/reports/reportHtmlRenderer.service.js";
import { renderMobileReportHtml } from "../src/templates/reports/mobileReport.template.js";

const namingHigh = resolveMoldaviteDisplayNaming({
  geminiSubtypeConfidence: 0.9,
  moldaviteDecisionSource: "gemini",
  detectionReason: "gemini_crystal_subtype",
});

const UNIQUE_HERO_PROSE = "UNIQUE_V2_HERO_OPENING_SHOULD_NOT_RENDER_9921";

test("Moldavite: renderReportHtmlPage uses Moldavite HTML V2 (radar, owner, graph data)", () => {
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
    birthdateUsed: "15/03/1990",
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
      htmlOpeningLine: `${UNIQUE_HERO_PROSE} ${mv.flexSurface.htmlOpeningLine || ""}`,
    },
    moldaviteV1: mv,
  };

  const { payload } = normalizeReportPayloadForRender(raw);
  assert.ok(payload.moldaviteV1?.htmlReport);
  const html = renderReportHtmlPage(payload);
  assert.ok(html.includes("<!-- moldavite-html-v2 -->"));
  assert.ok(html.includes("moldavite-html-v2"));
  assert.ok(html.includes("ภาพรวมการจับคู่"));
  assert.ok(html.includes("สรุปจากกราฟ"));
  assert.ok(html.includes("แรงสอดคล้องสุด"));
  assert.ok(html.includes("จุดที่ควรบาลานซ์"));
  assert.ok(!html.includes(UNIQUE_HERO_PROSE));
  assert.ok(html.includes('<circle class="mv2-radar-peak"'));
  assert.ok(html.includes("โปรไฟล์เจ้าของ"));
  assert.ok(html.includes('class="mv2-owner-id"'));
  assert.ok(html.includes("หินทำงานกับคุณอย่างไร"));
  assert.ok(html.includes("เสริมแรง"));
  assert.ok(html.includes("ระวังจังหวะ"));
  assert.ok(html.includes("มิติชีวิตละเอียด"));
  assert.ok(html.includes("การใช้และข้อควรระวัง"));
  assert.ok(html.includes("มอลดาไวต์"));
  assert.ok(html.includes("พลังหลัก ·"));
  assert.ok(html.includes("เร่งการเปลี่ยนแปลง"));
  assert.ok(html.includes("<polygon"));
  assert.ok(html.includes("แนวโน้มโดยรวม:"));
  assert.ok(
    html.includes("โปรไฟล์แกนสรุปจากวันเกิดแบบจำลองเชิงสัญลักษณ์"),
  );
});

test("non-Moldavite crystal HTML still uses legacy mobile template (no V2 marker)", () => {
  const raw = {
    reportId: "r2",
    generatedAt: new Date().toISOString(),
    reportVersion: "1.0.0",
    object: { objectLabel: "ทดสอบ", objectImageUrl: "" },
    summary: {
      energyScore: 6,
      energyLevelLabel: "ปานกลาง",
      mainEnergyLabel: "สมดุล",
      summaryLine: "บรรทัดสรุป",
    },
    sections: {},
    trust: {},
    actions: {},
  };
  const { payload } = normalizeReportPayloadForRender(raw);
  assert.equal(payload.moldaviteV1, undefined);
  const html = renderReportHtmlPage(payload);
  assert.ok(!html.includes("<!-- moldavite-html-v2 -->"));
  assert.ok(html.includes("สรุปภาพรวม"));
});

test("renderMobileReportHtml unchanged for non-Moldavite payloads (wording section)", () => {
  const html = renderMobileReportHtml({
    reportVersion: "1",
    generatedAt: new Date().toISOString(),
    object: {},
    summary: { summaryLine: "x", mainEnergyLabel: "y" },
    wording: {
      mainEnergy: "พลังหลักทดสอบ",
      energyCharacter: "ลักษณะ",
    },
    sections: {},
    trust: {},
    actions: {},
  });
  assert.ok(html.includes("ความหมายเชิงลึก"));
  assert.ok(html.includes("พลังหลักทดสอบ"));
});
