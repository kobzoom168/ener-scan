import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRollingDayWeightsNormalized,
  recomputeWeights,
} from "../src/utils/personaAbOptimize.util.js";

test("buildRollingDayWeightsNormalized sums to 1", () => {
  for (const mode of ["uniform", "linear", "exp"]) {
    const w = buildRollingDayWeightsNormalized(7, mode, 0.35);
    assert.equal(w.length, 7);
    const s = w.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(s - 1) < 1e-9, mode);
  }
});

test("recomputeWeights uses Bayesian smoothing and min floor", () => {
  const stats = [
    { variant: "A", paywallShown: 100, paymentIntent: 10, paymentSuccess: 5 },
    { variant: "B", paywallShown: 100, paymentIntent: 20, paymentSuccess: 12 },
    { variant: "C", paywallShown: 100, paymentIntent: 15, paymentSuccess: 8 },
  ];
  const w = recomputeWeights(stats, {
    variantLabels: ["A", "B", "C"],
    minWeight: 0.15,
    minTotalPaywall: 1,
    defaultWeights: { A: 0.34, B: 0.33, C: 0.33 },
    bayesAlpha: 1,
    bayesBeta: 1,
    totalPaywallRawForThreshold: 300,
  });
  assert.ok(w.A >= 0.15 && w.B >= 0.15 && w.C >= 0.15);
  const sum = w.A + w.B + w.C;
  assert.ok(Math.abs(sum - 1) < 1e-6);
  assert.ok(w.B > w.A, "B should beat A on smoothed success rate");
});
