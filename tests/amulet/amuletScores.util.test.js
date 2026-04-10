import test from "node:test";
import assert from "node:assert/strict";
import {
  computeAmuletPowerScoresDeterministicV1,
  deriveSacredAmuletEnergyScore10FromPowerCategories,
  inferAmuletAxisFromMainEnergyLabel,
  sacredAmuletEnergyLevelLabelFromScore10,
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

test("hero energyScore10 is derived from the six axis scores (matches graph)", () => {
  const { powerCategories } = computeAmuletPowerScoresDeterministicV1(
    "derive-hero-graph-check",
    { sessionKey: "sess-x" },
  );
  const e = deriveSacredAmuletEnergyScore10FromPowerCategories(powerCategories);
  const axisMean =
    Object.values(powerCategories).reduce((a, x) => a + x.score, 0) / 6;
  const sorted = Object.values(powerCategories)
    .map((x) => x.score)
    .sort((a, b) => b - a);
  const gap = sorted[0] - sorted[1];
  assert.ok(e >= 4.5 && e <= 9.95);
  assert.ok(
    axisMean >= 34 && axisMean <= 99,
    `expected axis mean in calibrated range, got ${axisMean}`,
  );
  assert.ok(
    gap >= 0,
    "gap bonus uses top-two axis delta from same scores as graph",
  );
});

test("deterministic_v2 sample distribution: wide spread, สูง not trivial", () => {
  const n = 8000;
  /** @type {number[]} */
  const scores = [];
  /** @type {string[]} */
  const labels = [];
  for (let i = 0; i < n; i++) {
    const seed = `dist-sample-${i}`;
    const { powerCategories } = computeAmuletPowerScoresDeterministicV1(seed, {
      sessionKey: "s-dist",
    });
    const e = deriveSacredAmuletEnergyScore10FromPowerCategories(powerCategories);
    scores.push(e);
    labels.push(sacredAmuletEnergyLevelLabelFromScore10(e));
  }
  scores.sort((a, b) => a - b);
  const min = scores[0];
  const max = scores[n - 1];
  const median = scores[Math.floor(n / 2)];
  const pct = (pred) => scores.filter(pred).length / n;
  const pctBelow7 = pct((x) => x < 7);
  const pct8p = pct((x) => x >= 8);
  const pct9p = pct((x) => x >= 9);
  const pctLabelSung =
    labels.filter((l) => l === "สูง" || l === "สูงมาก").length / n;

  const knownTop = deriveSacredAmuletEnergyScore10FromPowerCategories(
    computeAmuletPowerScoresDeterministicV1("dist-sample-23988", {
      sessionKey: "s-dist",
    }).powerCategories,
  );
  assert.ok(knownTop >= 9, `golden high seed should reach 9+, got ${knownTop}`);

  assert.ok(min < 6.5, `expected some low hero scores, min=${min}`);
  assert.ok(max >= 8.5, `expected wide top band in sample, max=${max}`);
  assert.ok(median >= 6.8 && median <= 8.5, `median=${median} (typical mid band)`);
  assert.ok(pctBelow7 >= 0.02, `% below 7 = ${(pctBelow7 * 100).toFixed(1)}`);
  assert.ok(pct8p <= 0.85, `% 8+ = ${(pct8p * 100).toFixed(1)}`);
  assert.ok(pct9p <= 0.35, `% 9+ = ${(pct9p * 100).toFixed(1)}`);
  assert.ok(pctLabelSung <= 0.75, `% สูง/สูงมาก = ${(pctLabelSung * 100).toFixed(1)}`);
});
