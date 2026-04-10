import test from "node:test";
import assert from "node:assert/strict";
import { buildAmuletHtmlV2ViewModel } from "../../src/amulet/amuletHtmlV2.model.js";

function minimalPayload(overrides = {}) {
  const base = {
    reportId: "r1",
    scanId: "s-amulet",
    birthdateUsed: "15/06/1990",
    generatedAt: new Date().toISOString(),
    summary: {
      energyScore: 7,
      energyLevelLabel: "ปานกลาง",
      mainEnergyLabel: "คุ้มครอง",
      compatibilityPercent: 80,
      compatibilityBand: "เข้ากันได้ดี",
    },
    amuletV1: {
      version: "1",
      scoringMode: "deterministic_v2",
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
        fitLine: "เด่นสุด คุ้มครองป้องกัน · รอง เมตตาและคนเอ็นดู",
        bullets: [],
        ctaLabel: "เปิด",
        mainEnergyShort: "คุ้มครอง",
        tagline: "พระเครื่อง · หกมิติพลัง",
      },
      htmlReport: { lifeAreaBlurbs: {}, usageCautionLines: [] },
    },
  };
  return { ...base, ...overrides };
}

test("buildAmuletHtmlV2ViewModel: graph summary stays 2 rows (พลังเด่น / รองลงมา)", () => {
  const vm = buildAmuletHtmlV2ViewModel(minimalPayload());
  assert.ok(
    vm.usageCaution.disclaimer.includes("วันเดือนปีเกิด") &&
      vm.usageCaution.disclaimer.includes("\u2014 Ener Scan"),
    "fixed sacred_amulet usage disclaimer (not payload lines)",
  );
  assert.ok(
    !JSON.stringify({ ...vm, usageCaution: { disclaimer: "" } }).includes("\u2014"),
    "sacred_amulet VM copy avoids em dash outside fixed disclaimer",
  );
  assert.equal(vm.graphSummary.rows.length, 2);
  assert.equal(vm.graphSummary.rows[0].label, "พลังเด่น");
  assert.equal(vm.graphSummary.rows[1].label, "รองลงมา");
  assert.ok(
    String(vm.graphSummary.rows[0].value || "").includes("คุ้มครองป้องกัน"),
  );
  assert.ok(
    String(vm.graphSummary.rows[1].value || "").includes("เมตตาและคนเอ็นดู"),
  );
});

test("buildAmuletHtmlV2ViewModel: interaction + graph align to same top axes", () => {
  const vm = buildAmuletHtmlV2ViewModel(minimalPayload());
  const top = vm.power.objectPeakKey;
  assert.equal(top, "protection");
  const third = vm.interactionSummary.rows[2];
  assert.ok(String(third.main || "").includes("คุ้มครอง"));
  assert.ok(String(third.sub || "").includes("คุ้มครอง"));
});

test("buildAmuletHtmlV2ViewModel: no weak hedging tokens in default blurbs", () => {
  const vm = buildAmuletHtmlV2ViewModel(minimalPayload());
  const text = vm.lifeAreaDetail.rows.map((r) => r.blurb).join(" ");
  assert.ok(!/ค่อนข้าง|มีแนวโน้ม|อาจ |พอมี|ดูเหมือน/.test(text));
});
