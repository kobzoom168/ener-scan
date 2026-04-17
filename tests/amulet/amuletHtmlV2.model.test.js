import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAmuletHtmlV2ViewModel,
  buildSacredAmuletDecisionCard,
  buildSacredAmuletTimingCardDisplay,
  buildSacredAmuletWeekdayItems,
  buildSacredAmuletTimeItems,
} from "../../src/amulet/amuletHtmlV2.model.js";

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

test("buildAmuletHtmlV2ViewModel: graph summary has 3 rows (พลังเด่น / เข้ากับคุณที่สุด / ควรค่อย ๆ ไป)", () => {
  const vm = buildAmuletHtmlV2ViewModel(minimalPayload());
  assert.equal(vm.metrics.energyLevelLabel, "B");
  assert.equal(vm.metrics.energyLevelGradeClass, "level-grade--B");
  assert.ok(
    vm.usageCaution.disclaimer.includes("วันเดือนปีเกิด") &&
      vm.usageCaution.disclaimer.includes("Ener Scan"),
    "fixed sacred_amulet usage disclaimer (not payload lines)",
  );
  assert.ok(
    !JSON.stringify({ ...vm, usageCaution: { disclaimer: "" } }).includes("\u2014"),
    "sacred_amulet VM copy avoids em dash outside fixed disclaimer",
  );
  assert.equal(vm.graphSummary.rows.length, 3);
  assert.equal(vm.graphSummary.rows[0].label, "พลังเด่น");
  assert.equal(vm.graphSummary.rows[1].label, "เข้ากับคุณที่สุด");
  assert.equal(vm.graphSummary.rows[2].label, "ควรค่อย ๆ ไป");
  assert.equal(/** @type {{ rowKind?: string }} */ (vm.graphSummary.rows[2]).rowKind, "tension");
  assert.ok(
    String(vm.graphSummary.rows[0].value || "").includes("คุ้มครองป้องกัน"),
  );
  assert.equal(
    String(vm.graphSummary.rows[1].value || ""),
    vm.power.alignment.labelThai,
  );
  assert.ok(String(vm.graphSummary.rows[2].value || "").includes(vm.power.tension.labelThai));
});

test("buildAmuletHtmlV2ViewModel: interaction + graph align to same top axes", () => {
  const vm = buildAmuletHtmlV2ViewModel(minimalPayload());
  const top = vm.power.objectPeakKey;
  assert.equal(top, "protection");
  const third = vm.interactionSummary.rows[2];
  assert.ok(String(third.main || "").includes("คุ้มครอง"));
  assert.ok(String(third.sub || "").includes("คุ้มครอง"));
});

test("buildAmuletHtmlV2ViewModel: ownerReactionCard kept for parity (not rendered in HTML v2)", () => {
  const vm = buildAmuletHtmlV2ViewModel(minimalPayload());
  assert.ok(vm.ownerReactionCard && typeof vm.ownerReactionCard === "object");
  assert.equal(vm.ownerReactionCard.rows.length, 3);
  assert.ok(String(vm.ownerReactionCard.title || "").includes("ชิ้นนี้"));
  assert.equal(vm.ownerReactionCard.rows[0].kicker, "ส่งกับคุณตรงสุด");
  assert.equal(vm.ownerReactionCard.rows[1].kicker, "เวลาใช้ชิ้นนี้");
  assert.equal(vm.ownerReactionCard.rows[2].kicker, "มุมที่ควรค่อย ๆ ไป");
  assert.ok(String(vm.ownerReactionCard.ownerRhythmLine || "").includes("จังหวะเกิด"));
});

test("buildAmuletHtmlV2ViewModel: decisionCard keep grade separate from system energy level", () => {
  const vm = buildAmuletHtmlV2ViewModel(minimalPayload());
  assert.ok(vm.decisionCard && typeof vm.decisionCard === "object");
  assert.ok(["S", "A", "B", "C"].includes(vm.decisionCard.keepGrade));
  assert.ok(vm.decisionCard.keepScore >= 0 && vm.decisionCard.keepScore <= 100);
  assert.equal(vm.decisionCard.title, "ชิ้นนี้ใช่กับคุณแค่ไหน");
  assert.ok(String(vm.decisionCard.verdict || "").length > 0);
  assert.ok(String(vm.decisionCard.baselineHint || "").includes("ตัวตั้ง"));
  assert.ok(String(vm.decisionCard.scanNextHint || "").includes("สแกนต่อ"));
});

test("buildSacredAmuletDecisionCard: deterministic keepScore formula", () => {
  const a = buildSacredAmuletDecisionCard({
    compatibilityPercent: 80,
    energyScore: 7,
    alignKey: "protection",
    ord: ["protection", "metta"],
    maxD: 20,
    alignLabel: "คุ้มครองป้องกัน",
    tensionLabel: "โชคลาภและการเปิดทาง",
  });
  const compat = 80;
  const energyN = 7;
  let bonus = 50 + 12 - 5 + 4;
  bonus = Math.min(100, Math.max(0, bonus));
  const expected = Math.round(Math.min(100, Math.max(0, 0.55 * compat + 0.25 * (energyN * 10) + 0.2 * bonus)) * 10) / 10;
  assert.equal(a.keepScore, expected);
});

test("buildAmuletHtmlV2ViewModel: no weak hedging tokens in default blurbs", () => {
  const vm = buildAmuletHtmlV2ViewModel(minimalPayload());
  const text = vm.lifeAreaDetail.rows.map((r) => r.blurb).join(" ");
  assert.ok(!/ค่อนข้าง|มีแนวโน้ม|อาจ |พอมี|ดูเหมือน/.test(text));
});

test("buildSacredAmuletTimingCardDisplay: timingBoost is display-only and clamped 4–12", () => {
  /** @type {import("../../src/services/reports/reportPayload.types.js").ReportTimingV1} */
  const tv = {
    engineVersion: "timing_v1_1",
    lane: "sacred_amulet",
    ritualMode: "ตั้งจิต",
    confidence: "medium",
    ownerProfile: { lifePath: 1, birthDayRoot: 6, weekday: 5 },
    bestHours: [{ key: "morning_07_10", score: 82, reasonCode: "x", reasonText: "x" }],
    bestWeekdays: [],
    bestDateRoots: [],
    avoidHours: [],
    summary: {
      topWindowLabel: "ช่วงเช้า",
      topWeekdayLabel: "วันพฤหัสบดี",
      practicalHint: "hint",
    },
  };
  const d = buildSacredAmuletTimingCardDisplay(tv, "protection", "metta", {
    alignKey: "protection",
    ord: ["protection", "metta"],
    gapTop12: 8,
  });
  assert.ok(d.timingBoost);
  assert.equal(typeof d.timingBoost.percent, "number");
  assert.ok(d.timingBoost.percent >= 4 && d.timingBoost.percent <= 12);
  assert.ok(String(d.timingBoost.label).includes("โบนัสจังหวะ"));
  assert.ok(String(d.timingBoost.hint).includes("ประมาณ"));
});

test("buildSacredAmuletWeekdayItems / TimeItems: active จาก summary + bestHours[0] เท่านั้น", () => {
  /** @type {import("../../src/services/reports/reportPayload.types.js").ReportTimingV1} */
  const tv = {
    engineVersion: "timing_v1_1",
    lane: "sacred_amulet",
    ritualMode: "ตั้งจิต",
    confidence: "medium",
    ownerProfile: { lifePath: 1, birthDayRoot: 6, weekday: 5 },
    bestHours: [
      { key: "morning_07_10", score: 82, reasonCode: "LANE_POWER_SUPPORT", reasonText: "x" },
    ],
    bestWeekdays: [],
    bestDateRoots: [],
    avoidHours: [],
    summary: {
      topWindowLabel: "ช่วงเช้า 07:00–10:59",
      topWeekdayLabel: "วันพฤหัสบดี",
      practicalHint: "hint",
    },
  };
  const wd = buildSacredAmuletWeekdayItems(tv);
  assert.equal(wd.length, 7);
  assert.ok(wd.find((x) => x.fullLabel === "วันพฤหัสบดี")?.active);
  assert.equal(wd.filter((x) => x.active).length, 1);
  const ti = buildSacredAmuletTimeItems(tv);
  assert.equal(ti.length, 7);
  assert.ok(ti.find((x) => x.key === "morning_07_10")?.active);
  assert.equal(ti.filter((x) => x.active).length, 1);
});

test("buildAmuletHtmlV2ViewModel: dailyOwnerCard stable across scans same Bangkok calendar day", () => {
  const iso = "2026-04-17T08:30:00.000Z";
  const vmA = buildAmuletHtmlV2ViewModel(
    minimalPayload({ scanId: "scan-a", generatedAt: iso }),
  );
  const vmB = buildAmuletHtmlV2ViewModel(
    minimalPayload({ scanId: "scan-b", reportId: "r-other", generatedAt: iso }),
  );
  assert.deepEqual(vmA.dailyOwnerCard, vmB.dailyOwnerCard);
  assert.equal(vmA.dailyOwnerCard.title, "วันนี้มีแรงของคุณ");
  assert.ok(String(vmA.dailyOwnerCard.line1 || "").length > 5);
  assert.ok(String(vmA.dailyOwnerCard.line2 || "").length > 5);
});

test("buildAmuletHtmlV2ViewModel: todayObjectBoostLine varies with compatibilityPercent", () => {
  const iso = "2026-04-17T10:00:00.000Z";
  const base = minimalPayload({ generatedAt: iso });
  const hi = buildAmuletHtmlV2ViewModel({
    ...base,
    summary: { ...base.summary, compatibilityPercent: 82 },
  });
  const lo = buildAmuletHtmlV2ViewModel({
    ...base,
    summary: { ...base.summary, compatibilityPercent: 48 },
  });
  assert.notEqual(hi.todayObjectBoostLine, lo.todayObjectBoostLine);
  assert.ok(String(hi.todayObjectBoostLine).includes("ชิ้นนี้"));
  assert.ok(String(lo.todayObjectBoostLine).includes("ชิ้นนี้"));
});

test("buildAmuletHtmlV2ViewModel: faithProgressCard B→A projection (display-only)", () => {
  const base = minimalPayload();
  const vm = buildAmuletHtmlV2ViewModel({
    ...base,
    summary: { ...base.summary, energyScore: 7.2 },
  });
  assert.ok(vm.faithProgressCard);
  assert.equal(vm.faithProgressCard.title, "ทางไปสู่ตัว top");
  assert.equal(vm.faithProgressCard.subtitle, "เสริมพลังตามความเชื่อ");
  assert.ok(String(vm.faithProgressCard.returnLoopHint || "").includes("เป้าหมายรอบถัดไป"));
  assert.equal(vm.faithProgressCard.baseGrade, "B");
  assert.equal(vm.faithProgressCard.projectedGrade, "A");
  assert.equal(vm.faithProgressCard.estimatedDaysToNextTier, 7);
  assert.ok(String(vm.faithProgressCard.progressHint).includes("B → A ได้"));
  assert.ok(String(vm.faithProgressCard.baselineHint).includes("ตัวตั้ง"));
  assert.ok(String(vm.faithProgressCard.scanNextHint).includes("2–3"));
  assert.ok(
    vm.faithProgressCard.boostCapPercent >= 6 && vm.faithProgressCard.boostCapPercent <= 15,
  );
});
