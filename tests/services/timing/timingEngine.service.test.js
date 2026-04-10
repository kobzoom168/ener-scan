import test from "node:test";
import assert from "node:assert/strict";
import { computeTimingV1 } from "../../../src/services/timing/timingEngine.service.js";

test("computeTimingV1: stable output for same inputs (sacred_amulet)", () => {
  const a = computeTimingV1({
    birthdateIso: "1990-06-15",
    lane: "sacred_amulet",
    primaryKey: "protection",
    compatibilityScore: 78,
    ownerFitScore: 78,
  });
  const b = computeTimingV1({
    birthdateIso: "1990-06-15",
    lane: "sacred_amulet",
    primaryKey: "protection",
    compatibilityScore: 78,
    ownerFitScore: 78,
  });
  assert.deepEqual(a, b);
  assert.equal(a.engineVersion, "timing_v1");
  assert.equal(a.lane, "sacred_amulet");
  assert.ok(a.bestHours.length >= 1);
  assert.ok(a.summary.topWindowLabel.length > 2);
});

test("computeTimingV1: primaryKey changes hour scores (sacred_amulet)", () => {
  const prot = computeTimingV1({
    birthdateIso: "1988-03-21",
    lane: "sacred_amulet",
    primaryKey: "protection",
    compatibilityScore: 70,
    ownerFitScore: 70,
  });
  const luck = computeTimingV1({
    birthdateIso: "1988-03-21",
    lane: "sacred_amulet",
    primaryKey: "luck",
    compatibilityScore: 70,
    ownerFitScore: 70,
  });
  assert.notEqual(
    prot.ritualMode,
    luck.ritualMode,
    "ritual mode mapping differs by primary power",
  );
  const byKey = (slots) => Object.fromEntries(slots.map((s) => [s.key, s.score]));
  const sp = byKey(prot.bestHours);
  const sl = byKey(luck.bestHours);
  assert.ok(
    Object.keys(sp).some((k) => sl[k] !== undefined && sp[k] !== sl[k]),
    "at least one shared top-window score differs when primary power differs",
  );
});

test("computeTimingV1: invalid birthdate → low confidence empty slots", () => {
  const r = computeTimingV1({
    birthdateIso: "",
    lane: "sacred_amulet",
    primaryKey: "metta",
  });
  assert.equal(r.confidence, "low");
  assert.equal(r.bestHours.length, 0);
  assert.ok(r.summary.practicalHint.includes("วันเดือนปีเกิด"));
});

test("computeTimingV1: moldavite lane uses moldavite rule pack", () => {
  const r = computeTimingV1({
    birthdateIso: "1992-11-08",
    lane: "moldavite",
    primaryKey: "work",
    compatibilityScore: 65,
    ownerFitScore: 65,
  });
  assert.equal(r.lane, "moldavite");
  assert.ok(r.bestWeekdays.length >= 1);
  assert.equal(r.ritualMode, "ตั้งจิต");
});
