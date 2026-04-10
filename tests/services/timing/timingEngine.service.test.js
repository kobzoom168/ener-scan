import test from "node:test";
import assert from "node:assert/strict";
import { computeTimingV1 } from "../../../src/services/timing/timingEngine.service.js";
import { TIMING_REASON_CODES } from "../../../src/config/timing/timingEngine.config.js";
import { TIMING_INVALID_BIRTH_PRACTICAL } from "../../../src/services/timing/timingEngine.copy.th.js";
import { SACRED_AMULET_TIMING_FIXTURES } from "./fixtures/sacredAmuletTiming.fixture.js";
import { MOLDAVITE_TIMING_FIXTURES } from "./fixtures/moldaviteTiming.fixture.js";

/** @param {string} code */
function assertKnownReason(code) {
  assert.ok(
    TIMING_REASON_CODES.includes(code),
    `reasonCode must be standard: got ${code}`,
  );
}

/** @param {object} r */
function assertSlotInvariants(r) {
  const lists = [r.bestHours, r.bestWeekdays, r.bestDateRoots, r.avoidHours];
  for (const list of lists) {
    for (const s of list) {
      assertKnownReason(s.reasonCode);
      assert.ok(String(s.reasonText || "").length >= 4);
    }
  }
  const bestH = new Set(r.bestHours.map((h) => h.key));
  for (const a of r.avoidHours) {
    assert.ok(!bestH.has(a.key), "avoidHours must not repeat a top hour key");
  }
  const roots = r.bestDateRoots.map((x) => x.key);
  assert.equal(new Set(roots).size, roots.length, "bestDateRoots keys should be distinct");
  assert.ok(r.debug);
  assert.equal(r.debug.version, "timing_v1_1");
  assert.ok(r.debug.timingFingerprint && String(r.debug.timingFingerprint).startsWith("t"));
}

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
  assert.equal(a.engineVersion, "timing_v1_1");
  assert.equal(a.lane, "sacred_amulet");
  assert.ok(a.bestHours.length >= 1);
  assert.ok(a.summary.topWindowLabel.length > 2);
  assertSlotInvariants(a);
});

test("computeTimingV1: scannedAtIso jitter does not change output", () => {
  const base = {
    birthdateIso: "1990-06-15",
    lane: "sacred_amulet",
    primaryKey: "protection",
    compatibilityScore: 71,
    ownerFitScore: 69,
  };
  const j1 = computeTimingV1({
    ...base,
    scannedAtIso: "2026-01-01T00:00:00.000Z",
  });
  const j2 = computeTimingV1({
    ...base,
    scannedAtIso: "2030-12-31T23:59:59.999Z",
  });
  assert.deepEqual(j1, j2);
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
  assert.notDeepEqual(
    prot.bestHours.map((h) => h.key),
    luck.bestHours.map((h) => h.key),
    "top hour ordering should not be identical for protection vs luck on this birthdate",
  );
});

test("computeTimingV1: sacred_amulet luck vs protection — best hour windows differ (fixture birthdate)", () => {
  const p = computeTimingV1({
    birthdateIso: "1990-06-15",
    lane: "sacred_amulet",
    primaryKey: "protection",
    compatibilityScore: 72,
    ownerFitScore: 70,
  });
  const l = computeTimingV1({
    birthdateIso: "1990-06-15",
    lane: "sacred_amulet",
    primaryKey: "luck",
    compatibilityScore: 72,
    ownerFitScore: 70,
  });
  assert.notDeepEqual(
    p.bestHours.map((h) => h.key),
    l.bestHours.map((h) => h.key),
    "top hour key list should differ when primary power differs",
  );
});

test("computeTimingV1: moldavite work vs relationship — top window differs (shared birthdate)", () => {
  const w = computeTimingV1({
    birthdateIso: "1990-06-15",
    lane: "moldavite",
    primaryKey: "work",
    compatibilityScore: 72,
    ownerFitScore: 70,
  });
  const rel = computeTimingV1({
    birthdateIso: "1990-06-15",
    lane: "moldavite",
    primaryKey: "relationship",
    compatibilityScore: 72,
    ownerFitScore: 70,
  });
  assert.notEqual(w.bestHours[0].key, rel.bestHours[0].key);
  assert.ok(w.summary.practicalHint.includes("โฟกัส"));
  assert.ok(!w.summary.practicalHint.includes("หมุดพลัง"));
  assert.ok(rel.summary.practicalHint.includes("โฟกัส"));
});

test("computeTimingV1: same birthdate — sacred_amulet vs moldavite not identical pattern", () => {
  const sa = computeTimingV1({
    birthdateIso: "1988-03-21",
    lane: "sacred_amulet",
    primaryKey: "protection",
    compatibilityScore: 75,
    ownerFitScore: 75,
  });
  const mv = computeTimingV1({
    birthdateIso: "1988-03-21",
    lane: "moldavite",
    primaryKey: "work",
    compatibilityScore: 75,
    ownerFitScore: 75,
  });
  assert.notDeepEqual(
    sa.bestHours.map((h) => h.key),
    mv.bestHours.map((h) => h.key),
  );
  assert.notEqual(sa.debug.timingFingerprint, mv.debug.timingFingerprint);
  assert.ok(sa.summary.practicalHint.includes("หนุนพลัง"));
  assert.ok(!sa.summary.practicalHint.includes("เป็นกรอบ"));
  assert.ok(mv.summary.practicalHint.includes("โฟกัส"));
});

test("computeTimingV1: invalid birthdate → low confidence empty slots", () => {
  const r = computeTimingV1({
    birthdateIso: "",
    lane: "sacred_amulet",
    primaryKey: "metta",
  });
  assert.equal(r.confidence, "low");
  assert.equal(r.bestHours.length, 0);
  assert.equal(r.summary.practicalHint, TIMING_INVALID_BIRTH_PRACTICAL);
  assert.equal(r.debug.timingFingerprint, null);
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
  assertSlotInvariants(r);
});

test("fixtures: sacred_amulet + moldavite invariants", () => {
  for (const { id, input } of SACRED_AMULET_TIMING_FIXTURES) {
    const r = computeTimingV1(input);
    assert.equal(r.engineVersion, "timing_v1_1", id);
    assert.equal(r.lane, "sacred_amulet", id);
    assert.ok(["high", "medium", "low"].includes(r.confidence), id);
    assertSlotInvariants(r);
  }
  for (const { id, input } of MOLDAVITE_TIMING_FIXTURES) {
    const r = computeTimingV1(input);
    assert.equal(r.engineVersion, "timing_v1_1", id);
    assert.equal(r.lane, "moldavite", id);
    assert.ok(["high", "medium", "low"].includes(r.confidence), id);
    assertSlotInvariants(r);
  }
});
