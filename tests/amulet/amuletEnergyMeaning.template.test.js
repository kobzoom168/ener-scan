import test from "node:test";
import assert from "node:assert/strict";
import { renderAmuletEnergyMeaningHtml } from "../../src/templates/reports/amuletEnergyMeaning.template.js";
import { normalizeReportPayloadForRender } from "../../src/utils/reports/reportPayloadNormalize.util.js";

const basePayload = () => ({
  reportId: "r1",
  publicToken: "tok_meaning_1",
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
  trust: { trustNote: "" },
  actions: {},
  wording: {},
  amuletV1: {
    version: "1",
    scoringMode: "deterministic_v2",
    detection: { reason: "sacred_amulet_lane_v1", matchedSignals: [] },
    powerCategories: {
      protection: { key: "protection", score: 46, labelThai: "คุ้มครองป้องกัน" },
      metta: { key: "metta", score: 54, labelThai: "เมตตาและคนเอ็นดู" },
      baramee: { key: "baramee", score: 86, labelThai: "บารมีและอำนาจนำ" },
      luck: { key: "luck", score: 55, labelThai: "โชคลาภและการเปิดทาง" },
      fortune_anchor: {
        key: "fortune_anchor",
        score: 55,
        labelThai: "หนุนดวงและการตั้งหลัก",
      },
      specialty: { key: "specialty", score: 70, labelThai: "งานเฉพาะทาง" },
    },
    primaryPower: "baramee",
    secondaryPower: "specialty",
    flexSurface: {
      headline: "พระเครื่อง",
      fitLine: "x",
      bullets: ["a", "b"],
      ctaLabel: "ดู",
      mainEnergyShort: "บารมี",
      tagline: "t",
      mainEnergyWordingLine: "x",
      htmlOpeningLine: "y",
      heroNamingLine: "z",
    },
    htmlReport: { lifeAreaBlurbs: {}, usageCautionLines: [] },
  },
});

test("renderAmuletEnergyMeaningHtml: six cards and score order", () => {
  const { payload } = normalizeReportPayloadForRender(basePayload());
  const html = renderAmuletEnergyMeaningHtml(payload);
  assert.ok(html.includes("ความหมายพลังทั้ง 6 ด้าน"));
  assert.ok(html.includes("/r/tok_meaning_1"));
  const barameePos = html.indexOf("บารมีและอำนาจนำ");
  const protectionPos = html.indexOf("คุ้มครองป้องกัน");
  assert.ok(barameePos > 0 && protectionPos > 0);
  assert.ok(barameePos < protectionPos);
  assert.equal((html.match(/class="aem-card"/g) || []).length, 6);
});
