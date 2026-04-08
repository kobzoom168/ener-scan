import test from "node:test";
import assert from "node:assert/strict";
import { renderAmuletReportV2Html } from "../../src/templates/reports/amuletReportV2.template.js";

test("renderAmuletReportV2Html: renders sacred amulet shell", () => {
  const html = renderAmuletReportV2Html({
    reportId: "r1",
    publicToken: "t",
    scanId: "s1",
    userId: "u",
    birthdateUsed: "15/06/1990",
    generatedAt: new Date().toISOString(),
    reportVersion: "1",
    object: { objectImageUrl: "" },
    summary: {
      energyScore: 7,
      energyLevelLabel: "ปานกลาง",
      mainEnergyLabel: "คุ้มครอง",
      compatibilityPercent: 80,
      compatibilityBand: "เข้ากันได้ดี",
      summaryLine: "",
    },
    sections: {
      whatItGives: [],
      messagePoints: [],
      ownerMatchReason: [],
      roleDescription: [],
      bestUseCases: [],
      weakMoments: [],
      guidanceTips: [],
      careNotes: [],
      miniRitual: [],
    },
    trust: { trustNote: "ทดสอบ" },
    actions: {},
    wording: {},
    amuletV1: {
      version: "1",
      scoringMode: "deterministic_v1",
      detection: { reason: "sacred_amulet_lane_v1", matchedSignals: [] },
      powerCategories: {
        protection: { key: "protection", score: 88, labelThai: "คุ้มครองป้องกัน" },
        metta: { key: "metta", score: 70, labelThai: "เมตตาและคนเอ็นดู" },
        baramee: { key: "baramee", score: 65, labelThai: "บารมีและอำนาจนำ" },
        luck: { key: "luck", score: 60, labelThai: "โชคลาภและการเปิดทาง" },
        fortune_anchor: {
          key: "fortune_anchor",
          score: 55,
          labelThai: "หนุนดวงและการตั้งหลัก",
        },
        specialty: { key: "specialty", score: 50, labelThai: "งานเฉพาะทาง" },
      },
      primaryPower: "protection",
      secondaryPower: "metta",
      flexSurface: {
        headline: "พระเครื่อง",
        fitLine: "ตอนนี้เด่นสุด: คุ้มครองป้องกัน → เมตตาและคนเอ็นดู",
        bullets: ["a", "b"],
        ctaLabel: "ดูว่าชิ้นนี้ช่วยคุณยังไง",
        mainEnergyShort: "คุ้มครอง",
        tagline: "พระเครื่อง · โทนทอง",
        mainEnergyWordingLine: "x",
        htmlOpeningLine: "y",
        heroNamingLine: "z",
      },
      htmlReport: {
        lifeAreaBlurbs: {},
        usageCautionLines: ["บรรทัด 1"],
      },
    },
  });
  assert.ok(html.includes("พระเครื่อง"));
  assert.ok(html.includes("กราฟหกมิติพลังพระเครื่อง"));
  assert.ok(html.includes("ชั้น 1 = คุณ · ชั้น 2 = พลังพระเครื่อง"));
  assert.ok(html.includes('class="mv2a-radar-svg mv2a-radar-svg--animate"'));
  assert.ok(html.includes('class="mv2a-radar-layer mv2a-radar-layer--owner"'));
  assert.ok(html.includes('class="mv2a-radar-layer mv2a-radar-layer--amulet"'));
  assert.ok(html.includes('<circle class="mv2a-radar-peak"'));
  assert.ok(html.includes("แกนเด่นสุดของพลังพระเครื่อง: คุ้มครองป้องกัน"));
  assert.ok(html.includes('class="mv2a-radar-labels"'));
  assert.ok(html.includes("class=\"mv2a-radar-lbl mv2a-radar-lbl--protection mv2a-radar-lbl--top1\""));
  assert.ok(html.includes("class=\"mv2a-radar-lbl mv2a-radar-lbl--metta mv2a-radar-lbl--top2\""));
  assert.ok(html.includes("คุ้มครอง</span> <span class=\"mv2a-radar-axis-n\">88"));
  assert.ok(html.includes("เมตตา</span> <span class=\"mv2a-radar-axis-n\">70"));
  assert.ok(html.includes("งานเฉพาะ</span> <span class=\"mv2a-radar-axis-n\">50"));
  assert.ok(html.includes("มิติชีวิตละเอียด"));
  assert.ok(html.includes("สรุปจากกราฟ"));
  assert.ok(html.includes("โทนหลัก ·"));
  assert.ok(!html.includes("พลังหลัก ·"), "hero uses โทนหลัก, not พลังหลัก");
  assert.ok(html.includes("render amulet-html-v2"));
});
