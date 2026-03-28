import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateCompatibility,
  calculateCompatibilityScore,
  calculateUserAgeFromBirthdate,
} from "../src/utils/scanCompatibility.util.js";

test("calculateCompatibility: 19/08/1985 → Monday, even month → 83%", () => {
  assert.equal(calculateCompatibility("19/08/1985"), "83%");
  assert.equal(calculateCompatibilityScore("19/08/1985"), 83);
});

test("calculateUserAgeFromBirthdate: uses Bangkok calendar", () => {
  const asOf = new Date("2026-03-28T12:00:00+07:00");
  assert.equal(calculateUserAgeFromBirthdate("19/08/1985", asOf), 40);
});
