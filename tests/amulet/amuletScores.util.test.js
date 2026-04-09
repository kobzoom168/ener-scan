import test from "node:test";
import assert from "node:assert/strict";
import {
  computeAmuletPowerScoresDeterministicV1,
  inferAmuletAxisFromMainEnergyLabel,
} from "../../src/amulet/amuletScores.util.js";

test("deterministic_v2: same object identity keeps primary/secondary stable across sessions", () => {
  const a = computeAmuletPowerScoresDeterministicV1("object-stable-key", {
    sessionKey: "scan-a",
  });
  const b = computeAmuletPowerScoresDeterministicV1("object-stable-key", {
    sessionKey: "scan-b",
  });
  assert.equal(a.primaryPower, b.primaryPower);
  assert.equal(a.secondaryPower, b.secondaryPower);
  assert.equal(a.scoringMode, "deterministic_v2");
});

test("deterministic_v2: mainEnergyLabel nudges matching axis upward", () => {
  const base = computeAmuletPowerScoresDeterministicV1("nudge-test-seed", {
    sessionKey: "s1",
    mainEnergyLabel: "",
  });
  const luck = computeAmuletPowerScoresDeterministicV1("nudge-test-seed", {
    sessionKey: "s1",
    mainEnergyLabel: "โชคลาภและการเปิดทาง",
  });
  assert.ok(
    luck.powerCategories.luck.score >= base.powerCategories.luck.score,
  );
});

test("inferAmuletAxisFromMainEnergyLabel: maps hero wording to axis", () => {
  assert.equal(inferAmuletAxisFromMainEnergyLabel("คุ้มครอง"), "protection");
  assert.equal(inferAmuletAxisFromMainEnergyLabel("บารมีและอำนาจนำ"), "baramee");
  assert.equal(inferAmuletAxisFromMainEnergyLabel(""), null);
});
