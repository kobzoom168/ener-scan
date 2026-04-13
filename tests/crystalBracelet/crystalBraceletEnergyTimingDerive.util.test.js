import { test } from "node:test";
import assert from "node:assert/strict";
import {
  crystalBraceletRitualModeFromOwnerFit,
  deriveCrystalBraceletEnergyTimingV1,
} from "../../src/crystalBracelet/crystalBraceletEnergyTimingDerive.util.js";

const baseStone = () => ({
  charm_attraction: 40,
  money: 40,
  career: 40,
  luck: 40,
  intuition: 40,
  love: 40,
});

test("deriveCrystalBraceletEnergyTimingV1: career-led → วันจันทร์", () => {
  const stone = { ...baseStone(), career: 88, luck: 20 };
  const out = deriveCrystalBraceletEnergyTimingV1({
    bracelet: { stoneScores: stone },
    ownerProfile: { identityPhrase: "ทดสอบ", ownerChips: [] },
    ownerFitScore: 82,
    primaryAxis: "career",
    secondaryAxis: "luck",
    alignmentAxisKey: "career",
  });
  assert.equal(out.recommendedWeekday, "วันจันทร์");
  assert.ok(out.recommendedTimeBand.includes("08:00") || out.recommendedTimeBand.includes("07:00"));
  assert.ok(out.timingReason.includes("จันทร์") || out.timingReason.includes("การงาน"));
  assert.equal(out.timingModeKey, "bracelet_v1_career");
});

test("deriveCrystalBraceletEnergyTimingV1: love-led → วันศุกร์ + ช่วงค่ำ", () => {
  const stone = { ...baseStone(), love: 90, career: 25 };
  const out = deriveCrystalBraceletEnergyTimingV1({
    bracelet: { stoneScores: stone },
    ownerProfile: null,
    ownerFitScore: 85,
    primaryAxis: "love",
    secondaryAxis: "career",
    alignmentAxisKey: "love",
  });
  assert.equal(out.recommendedWeekday, "วันศุกร์");
  assert.ok(out.recommendedTimeBand.startsWith("19:00") || out.recommendedTimeBand.startsWith("17:00"));
  assert.ok(out.timingReason.includes("ศุกร์") || out.timingReason.includes("ความรัก"));
});

test("deriveCrystalBraceletEnergyTimingV1: intuition + โปรไฟล์ไวต่อสัญญาณ → 05:00-07:59", () => {
  const stone = { ...baseStone(), intuition: 92, money: 30 };
  const out = deriveCrystalBraceletEnergyTimingV1({
    bracelet: { stoneScores: stone },
    ownerProfile: {
      identityPhrase: "รับสัญญาณไว",
      ownerChips: ["ไวต่อความรู้สึก"],
    },
    ownerFitScore: 75,
    primaryAxis: "intuition",
    secondaryAxis: "money",
    alignmentAxisKey: "intuition",
  });
  assert.equal(out.recommendedTimeBand, "05:00-07:59");
});

test("crystalBraceletRitualModeFromOwnerFit: fit ต่ำ → โทนเบา", () => {
  const m = crystalBraceletRitualModeFromOwnerFit(55, "career");
  assert.ok(m.includes("ใจนิ่ง"));
  assert.ok(m.includes("ค่อย ๆ สังเกต"));
});

test("deriveCrystalBraceletEnergyTimingV1: secondary ใกล้ primary → reason กล่าวถึงวันรอง", () => {
  const stone = { ...baseStone(), money: 80, luck: 78 };
  const out = deriveCrystalBraceletEnergyTimingV1({
    bracelet: { stoneScores: stone },
    ownerProfile: null,
    ownerFitScore: 70,
    primaryAxis: "money",
    secondaryAxis: "luck",
    alignmentAxisKey: "money",
  });
  assert.equal(out.recommendedWeekday, "วันพุธ");
  assert.ok(
    out.timingReason.includes("พฤหัส") ||
      out.timingReason.includes("เสริมต่อได้ดี"),
  );
});
