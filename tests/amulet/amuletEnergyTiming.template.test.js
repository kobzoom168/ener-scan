import test from "node:test";
import assert from "node:assert/strict";
import { renderAmuletEnergyTimingHtml } from "../../src/templates/reports/amuletEnergyTiming.template.js";
import { computeTimingV1 } from "../../src/services/timing/timingEngine.service.js";

/** @returns {import("../../src/services/reports/reportPayload.types.js").ReportPayload} */
function amuletPayload(overrides = {}) {
  return {
    reportId: "r-et-1",
    publicToken: "tok_et_1",
    scanId: "s1",
    userId: "u1",
    birthdateUsed: "1990-06-15",
    generatedAt: new Date().toISOString(),
    reportVersion: "1",
    object: { objectImageUrl: "" },
    summary: {
      energyScore: 7,
      compatibilityPercent: 80,
      mainEnergyLabel: "คุ้มครอง",
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
    amuletV1: {
      version: "1",
      scoringMode: "deterministic_v2",
      detection: { reason: "x", matchedSignals: [] },
      powerCategories: {
        protection: { key: "protection", score: 80, labelThai: "คุ้มครอง" },
        metta: { key: "metta", score: 60, labelThai: "เมตตา" },
        baramee: { key: "baramee", score: 50, labelThai: "บารมี" },
        luck: { key: "luck", score: 50, labelThai: "โชค" },
        fortune_anchor: { key: "fortune_anchor", score: 50, labelThai: "หนุน" },
        specialty: { key: "specialty", score: 50, labelThai: "เฉพาะทาง" },
      },
      primaryPower: "protection",
      secondaryPower: "metta",
      flexSurface: {
        headline: "ทดสอบ",
        fitLine: "",
        bullets: [],
        mainEnergyShort: "คุ้มครอง",
      },
      htmlReport: { lifeAreaBlurbs: {}, usageCautionLines: [] },
    },
    ...overrides,
  };
}

test("renderAmuletEnergyTimingHtml: title, back CTA, weekday + hour tables, disclaimer (full timing)", () => {
  const tv = computeTimingV1({
    birthdateIso: "1990-06-15",
    lane: "sacred_amulet",
    primaryKey: "protection",
    compatibilityScore: 78,
    ownerFitScore: 78,
  });
  const html = renderAmuletEnergyTimingHtml(amuletPayload({ timingV1: tv }));
  assert.ok(html.includes("วิธีคำนวณจังหวะเสริมพลัง"));
  assert.ok(html.includes("กลับไปหน้ารายงาน"));
  assert.ok(html.includes("/r/tok_et_1"));
  assert.ok(html.includes('content="noindex,nofollow"'));
  assert.ok(html.includes("ตารางคะแนนวัน"));
  assert.ok(html.includes("ตารางคะแนนช่วงเวลา"));
  assert.ok(html.includes("<th>วัน</th>"));
  assert.ok(html.includes("<th>ช่วงเวลา</th>"));
  assert.ok(html.includes("ไม่ควรใช้แทนการตัดสินใจสำคัญในชีวิต"));
  assert.ok(html.includes("วันอาทิตย์"));
  assert.ok(html.includes("ช่วงเช้า 07:00–10:59"));
});

test("renderAmuletEnergyTimingHtml: no birth + no timing — fallback, no score tables", () => {
  const html = renderAmuletEnergyTimingHtml(
    amuletPayload({
      birthdateUsed: null,
      timingV1: undefined,
    }),
  );
  assert.ok(html.includes("วิธีคำนวณจังหวะเสริมพลัง"));
  assert.ok(html.includes("กลับไปหน้ารายงาน"));
  assert.ok(!html.includes("ตารางคะแนนวัน"));
  assert.ok(!html.includes("ตารางคะแนนช่วงเวลา"));
  assert.ok(html.includes("เมื่อยังไม่มีตารางคะแนนรายวัน"));
  assert.ok(html.includes("ไม่ควรใช้แทนการตัดสินใจสำคัญในชีวิต"));
});
