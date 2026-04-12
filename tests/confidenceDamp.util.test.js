import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveConfidenceDampMultiplier,
  dampAndClampAxisScore,
} from "../src/utils/reports/confidenceDamp.util.js";
import { score10ToEnergyGrade } from "../src/utils/reports/energyLevelGrade.util.js";

test("resolveConfidenceDampMultiplier: tiers + undefined default", () => {
  assert.equal(resolveConfidenceDampMultiplier(0.9), 1.0);
  assert.equal(resolveConfidenceDampMultiplier(0.72), 0.75);
  assert.equal(resolveConfidenceDampMultiplier(0.5), 0.55);
  assert.equal(resolveConfidenceDampMultiplier(undefined), 1.0);
});

test("damp example: 0–100 axis score 80 × 0.75 clamps to 60", () => {
  assert.equal(dampAndClampAxisScore(80, 0.75), 60);
});

test("energy grade: high score damped into B band (not A)", () => {
  const damp = resolveConfidenceDampMultiplier(0.72);
  assert.equal(damp, 0.75);
  const score10 = 9 * damp;
  assert.equal(score10ToEnergyGrade(score10), "B");
  assert.notEqual(score10ToEnergyGrade(score10), "A");
});
