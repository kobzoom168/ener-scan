import test from "node:test";
import assert from "node:assert/strict";
import { buildAmuletSummaryFirstFlex } from "../src/services/flex/flex.amuletSummary.js";

const basePayload = {
  summary: {
    energyScore: 7.5,
    compatibilityPercent: 78,
    compatibilityBand: "เข้ากันได้ดี",
  },
  object: { objectImageUrl: "https://example.com/x.jpg" },
  amuletV1: {
    version: "1",
    scoringMode: "deterministic_v1",
    powerCategories: {
      protection: { key: "protection", score: 90, labelThai: "คุ้มครองป้องกัน" },
      metta: { key: "metta", score: 80, labelThai: "เมตตาและคนเอ็นดู" },
      baramee: { key: "baramee", score: 70, labelThai: "บารมีและอำนาจนำ" },
      luck: { key: "luck", score: 60, labelThai: "โชคลาภและการเปิดทาง" },
      fortune_anchor: {
        key: "fortune_anchor",
        score: 55,
        labelThai: "หนุนดวงและการตั้งหลัก",
      },
      specialty: { key: "specialty", score: 50, labelThai: "งานเฉพาะทาง" },
    },
    flexSurface: {
      headline: "พระเครื่อง",
      fitLine: "ตอนนี้เด่นสุด: คุ้มครองป้องกัน → เมตตาและคนเอ็นดู",
      bullets: ["ข้อ 1", "ข้อ 2"],
      ctaLabel: "ดูว่าชิ้นนี้ช่วยคุณยังไง",
      mainEnergyShort: "คุ้มครอง",
      tagline: "พระเครื่อง · โทนทอง",
    },
  },
};

test("buildAmuletSummaryFirstFlex: flex bubble + gold-path body", async () => {
  const flex = await buildAmuletSummaryFirstFlex("ignored", {
    reportPayload: basePayload,
    reportUrl: "https://report.example/x",
    appendReportBubble: false,
  });
  assert.equal(flex.type, "flex");
  const bodyText = JSON.stringify(flex.contents);
  assert.ok(bodyText.includes("พระเครื่อง"));
  assert.ok(bodyText.includes("ตอนนี้เด่นสุด:"));
  assert.ok(bodyText.includes("ดูว่าชิ้นนี้ช่วยคุณยังไง"));
  assert.ok(bodyText.includes("พลังไปออกกับมิติไหน"));
  assert.ok(
    !bodyText.includes("พลังหลัก"),
    "sacred amulet flex: no main-energy pill section",
  );
  assert.ok(bodyText.includes("เรียงจากคะแนนสูงไปต่ำ"));
});
