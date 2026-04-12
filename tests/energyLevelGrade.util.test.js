import test from "node:test";
import assert from "node:assert/strict";
import {
  energyGradeToLevelGradeClass,
  resolveEnergyLevelDisplayGrade,
  score10ToEnergyGrade,
} from "../src/utils/reports/energyLevelGrade.util.js";

test("score10ToEnergyGrade: unified thresholds", () => {
  assert.equal(score10ToEnergyGrade(9), "S");
  assert.equal(score10ToEnergyGrade(8.9), "S");
  assert.equal(score10ToEnergyGrade(8.89), "A");
  assert.equal(score10ToEnergyGrade(7.5), "A");
  assert.equal(score10ToEnergyGrade(7.49), "B");
  assert.equal(score10ToEnergyGrade(6.5), "B");
  assert.equal(score10ToEnergyGrade(6.49), "D");
  assert.equal(score10ToEnergyGrade(null), "");
  assert.equal(score10ToEnergyGrade(undefined), "");
});

test("resolveEnergyLevelDisplayGrade: score beats legacy Thai when present", () => {
  assert.equal(resolveEnergyLevelDisplayGrade("สูง", 7.5), "A");
  assert.equal(resolveEnergyLevelDisplayGrade("ปานกลาง", 8.95), "S");
});

test("resolveEnergyLevelDisplayGrade: empty when no score and no label", () => {
  assert.equal(resolveEnergyLevelDisplayGrade("", null), "");
});

test("energyGradeToLevelGradeClass", () => {
  assert.equal(energyGradeToLevelGradeClass("A"), "level-grade--A");
  assert.equal(energyGradeToLevelGradeClass("d"), "level-grade--D");
});
