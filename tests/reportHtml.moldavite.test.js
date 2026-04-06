import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMoldaviteV1Slice } from "../src/moldavite/moldavitePayload.build.js";
import { resolveMoldaviteDisplayNaming } from "../src/moldavite/moldaviteDisplayNaming.util.js";
import { normalizeReportPayloadForRender } from "../src/utils/reports/reportPayloadNormalize.util.js";
import { renderReportHtmlPage } from "../src/services/reports/reportHtmlRenderer.service.js";
import { renderMobileReportHtml } from "../src/templates/reports/mobileReport.template.js";
import { renderMoldaviteReportV2Html } from "../src/templates/reports/moldaviteReportV2.template.js";

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
  assert.ok(html.includes("เปรียบเทียบคุณกับพลังของหิน"));
  assert.ok(html.includes("สรุปจากกราฟ"));
  assert.ok(html.includes("พลังเด่น: งาน"));
  assert.ok(html.includes("หินช่วยเรื่องงานให้ชัดที่สุดตอนนี้"));
  assert.ok(html.includes("รองลงมาเป็นความสัมพันธ์"));
  assert.ok(html.includes("เรื่องการเงินค่อย ๆ ไปก็พอ ไม่ต้องเร่ง"));
  assert.ok(html.includes('class="mv2-radar-key-dot mv2-radar-key-dot--owner"'));
  assert.ok(html.includes('class="mv2-radar-key-dot mv2-radar-key-dot--stone"'));
  assert.ok(html.includes('class="mv2-radar-key-chip"'));
  assert.ok(html.includes('class="mv2-radar-key-label">คุณ</span>'));
  assert.ok(html.includes('class="mv2-radar-key-label">หิน</span>'));
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
  assert.ok(html.includes('mv2-strip-cell--level'));
  assert.ok(html.includes("เร่งการเปลี่ยนแปลง"));
  assert.ok(html.includes("<polygon"));
  assert.ok(html.includes('class="mv2-radar-svg mv2-radar-svg--animate"'));
  assert.ok(html.includes('class="mv2-radar-layer mv2-radar-layer--owner"'));
  assert.ok(html.includes("แนวโน้มโดยรวม:"));
  assert.ok(
    html.includes("โปรไฟล์แกนสรุปจากวันเกิดแบบจำลองเชิงสัญลักษณ์"),
  );
  assert.ok(html.includes('mv2-radar-axis-fo'));
  assert.ok(!html.includes("mv2-radar-axis--2l"));
  assert.ok(html.includes("text-rendering=\"optimizeLegibility\""));
  assert.ok(html.includes("-apple-system"));
  assert.ok(html.includes('class="mv2-radar-axis-t"'));
  assert.ok(html.includes(">งาน</span>"));
  assert.ok(html.includes(">82</span>"));
  assert.ok(html.includes('class="mv2-radar-compare"'));
  assert.ok(html.includes("งาน: หินสูงกว่า"));
  assert.ok(html.includes("ความสัมพันธ์: หินสูงกว่า"));
  assert.ok(html.includes("การเงิน: ใกล้เคียง"));
  assert.ok(!html.includes("mv2-radar-series-lbl"));
  assert.ok(html.includes('class="mv2-radar-key"'));
  assert.ok(!html.includes("โทนหิน (มิติชีวิต)"));
  assert.ok(html.includes("ไม่ได้การันตีผลลัพธ์"));
  assert.ok(!html.includes("\u2014"));
});

test("Moldavite V2: footer render-meta line omitted when NODE_ENV=production", () => {
  const mv = buildMoldaviteV1Slice({
    scanResultId: "rid-meta",
    detection: { reason: "keyword_match", matchedSignals: ["x"] },
    seedKey: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    energyScore: 7.5,
    mainEnergyLabel: "เร่งการเปลี่ยนแปลง",
    displayNaming: namingHigh,
  });
  const raw = {
    reportId: "r-meta",
    scanId: "s-meta",
    birthdateUsed: null,
    generatedAt: new Date().toISOString(),
    reportVersion: "1.0.0",
    object: {},
    summary: {
      energyScore: 7,
      energyLevelLabel: "สูง",
      mainEnergyLabel: mv.flexSurface.mainEnergyShort,
      compatibilityPercent: 70,
      summaryLine: "x",
    },
    sections: {},
    trust: { modelLabel: "m" },
    actions: {},
    wording: {},
    moldaviteV1: mv,
  };
  const { payload } = normalizeReportPayloadForRender(raw);
  const prevNode = process.env.NODE_ENV;
  const prevMeta = process.env.REPORT_HTML_RENDER_META;
  process.env.NODE_ENV = "production";
  delete process.env.REPORT_HTML_RENDER_META;
  try {
    const html = renderMoldaviteReportV2Html(payload);
    assert.ok(!html.includes("render moldavite-html-v2"));
    assert.ok(!html.includes('<p class="mv2-render-meta">'));
  } finally {
    process.env.NODE_ENV = prevNode;
    if (prevMeta === undefined) delete process.env.REPORT_HTML_RENDER_META;
    else process.env.REPORT_HTML_RENDER_META = prevMeta;
  }
});

test("Moldavite V2: REPORT_HTML_RENDER_META=true shows footer meta in production", () => {
  const mv = buildMoldaviteV1Slice({
    scanResultId: "rid-meta2",
    detection: { reason: "keyword_match", matchedSignals: ["x"] },
    seedKey: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    energyScore: 7.5,
    mainEnergyLabel: "เร่งการเปลี่ยนแปลง",
    displayNaming: namingHigh,
  });
  const raw = {
    reportId: "r-meta2",
    scanId: "s-meta2",
    birthdateUsed: null,
    generatedAt: new Date().toISOString(),
    reportVersion: "9.9.9",
    object: {},
    summary: {
      energyScore: 7,
      energyLevelLabel: "สูง",
      mainEnergyLabel: mv.flexSurface.mainEnergyShort,
      compatibilityPercent: 70,
      summaryLine: "x",
    },
    sections: {},
    trust: {},
    actions: {},
    wording: {},
    moldaviteV1: mv,
  };
  const { payload } = normalizeReportPayloadForRender(raw);
  const prevNode = process.env.NODE_ENV;
  const prevMeta = process.env.REPORT_HTML_RENDER_META;
  process.env.NODE_ENV = "production";
  process.env.REPORT_HTML_RENDER_META = "true";
  try {
    const html = renderMoldaviteReportV2Html(payload);
    assert.ok(html.includes('<p class="mv2-render-meta">'));
    assert.ok(html.includes("render moldavite-html-v2"));
    assert.ok(html.includes("9.9.9"));
  } finally {
    process.env.NODE_ENV = prevNode;
    if (prevMeta === undefined) delete process.env.REPORT_HTML_RENDER_META;
    else process.env.REPORT_HTML_RENDER_META = prevMeta;
  }
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
