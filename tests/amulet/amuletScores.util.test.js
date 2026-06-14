import test from "node:test";
import assert from "node:assert/strict";
import {
  computeAmuletPowerScores,
  computeAmuletPowerScoresDeterministicV1,
  computeAmuletPowerScoresFromFeaturesV3,
  deriveSacredAmuletEnergyScore10FromPowerCategories,
  inferAmuletAxisFromMainEnergyLabel,
  sacredAmuletEnergyLevelLabelFromScore10,
} from "../../src/amulet/amuletScores.util.js";

const axisVec = (r) =>
  Object.fromEntries(Object.entries(r.powerCategories).map(([k, v]) => [k, v.score]));
const maxAxisDelta = (a, b) =>
  Math.max(...Object.keys(a).map((k) => Math.abs(a[k] - b[k])));

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

test("feature_blend_v3: same object across angles/lighting → identical scores", () => {
  // gold/polished vs yellow/smooth = same piece, different lighting + texture read.
  const angle1 = computeAmuletPowerScores({
    features: { primaryColor: "gold", materialType: "thai_amulet", formFactor: "amulet_coin", textureHint: "polished" },
    scanResultId: "scan-1",
  });
  const angle2 = computeAmuletPowerScores({
    features: { primaryColor: "yellow", materialType: "thai_amulet", formFactor: "amulet_coin", textureHint: "smooth" },
    scanResultId: "scan-2",
  });
  assert.equal(angle1.scoringMode, "feature_blend_v3");
  assert.deepEqual(axisVec(angle1), axisVec(angle2));
  assert.equal(angle1.primaryPower, angle2.primaryPower);
});

test("feature_blend_v3: a single real slug flip moves scores by a bounded amount (no avalanche)", () => {
  const base = computeAmuletPowerScoresFromFeaturesV3({
    primaryColor: "gold", materialType: "thai_amulet", formFactor: "amulet_coin",
  });
  const flippedForm = computeAmuletPowerScoresFromFeaturesV3({
    primaryColor: "gold", materialType: "thai_amulet", formFactor: "amulet_figure",
  });
  // Bounded: one layer change must not reroll the whole vector.
  assert.ok(
    maxAxisDelta(axisVec(base), axisVec(flippedForm)) <= 20,
    "single slug flip should be a bounded nudge, not a full reroll",
  );
});

test("computeAmuletPowerScores: falls back to legacy seed when features unusable", () => {
  const r = computeAmuletPowerScores({ features: null, seedKey: "legacy-seed", scanResultId: "x" });
  assert.equal(r.scoringMode, "deterministic_v2");
  const allUnknown = computeAmuletPowerScores({
    features: { primaryColor: "unknown", materialType: "unknown", formFactor: "unknown", textureHint: "unknown" },
    seedKey: "legacy-seed",
  });
  assert.equal(allUnknown.scoringMode, "deterministic_v2");
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

test("deterministic_v2 sample distribution: wide spread, A/S not trivial", () => {
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
  const pctLabelHigh =
    labels.filter((l) => l === "A" || l === "S").length / n;

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
  assert.ok(pctLabelHigh <= 0.75, `% A/S = ${(pctLabelHigh * 100).toFixed(1)}`);
});
