import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveMoldaviteEnergyTimingV1,
  moldaviteOwnerHintsEarlyCycleBand,
  moldaviteRitualModeFromOwnerFit,
  MOLDAVITE_NATIVE_IDENTITY_CHANGE_ACCELERATION,
} from "../../src/moldavite/moldaviteEnergyTimingDerive.util.js";

test("moldaviteRitualModeFromOwnerFit: tiers", () => {
  assert.ok(moldaviteRitualModeFromOwnerFit(82).includes("ตั้งจิตสั้น"));
  assert.ok(moldaviteRitualModeFromOwnerFit(70).includes("ตั้งเจตนา 1 ประโยค"));
  assert.ok(moldaviteRitualModeFromOwnerFit(50).includes("ใจนิ่ง"));
});

test("deriveMoldaviteEnergyTimingV1: work-led + close secondary adds weekday line", () => {
  const r = deriveMoldaviteEnergyTimingV1({
    mv: {
      primaryLifeArea: "work",
      secondaryLifeArea: "money",
      lifeAreas: {
        work: { score: 80, labelThai: "งาน" },
        money: { score: 78, labelThai: "การเงิน" },
        relationship: { score: 50, labelThai: "ความสัมพันธ์" },
      },
    },
    ownerAxes: { identityLabel: "neutral", summaryLine: "neutral" },
    ownerFitScore: 82,
  });
  assert.equal(r.recommendedWeekday, "วันจันทร์");
  assert.equal(r.recommendedTimeBand, "08:00-10:59");
  assert.ok(r.ritualMode.includes("ตั้งจิตสั้น"));
  assert.ok(r.timingReason.includes("เด่นวันจันทร์"));
  assert.ok(r.timingReason.includes("เสริมได้ในวันพุธ"));
  assert.equal(r.nativeIdentity, MOLDAVITE_NATIVE_IDENTITY_CHANGE_ACCELERATION);
});

test("deriveMoldaviteEnergyTimingV1: relationship-led", () => {
  const r = deriveMoldaviteEnergyTimingV1({
    mv: {
      primaryLifeArea: "relationship",
      secondaryLifeArea: "work",
      lifeAreas: {
        work: { score: 60 },
        money: { score: 55 },
        relationship: { score: 90 },
      },
    },
    ownerAxes: { identityLabel: "neutral", summaryLine: "neutral" },
    ownerFitScore: 70,
  });
  assert.equal(r.recommendedWeekday, "วันศุกร์");
  assert.equal(r.recommendedTimeBand, "19:00-21:59");
  assert.ok(r.timingReason.includes("ความสัมพันธ์"));
});

test("moldaviteOwnerHintsEarlyCycleBand: morning band path", () => {
  assert.equal(moldaviteOwnerHintsEarlyCycleBand({ identityLabel: "คนอ่านจังหวะก่อนขยับ" }), true);
  const r = deriveMoldaviteEnergyTimingV1({
    mv: {
      primaryLifeArea: "money",
      secondaryLifeArea: "work",
      lifeAreas: { work: { score: 70 }, money: { score: 88 }, relationship: { score: 60 } },
    },
    ownerAxes: { identityLabel: "คนอ่านจังหวะก่อนขยับ", summaryLine: "" },
    ownerFitScore: 70,
  });
  assert.equal(r.recommendedTimeBand, "05:00-07:59");
});
