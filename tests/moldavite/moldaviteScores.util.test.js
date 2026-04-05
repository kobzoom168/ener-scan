import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MOLDAVITE_SCORING_MODE,
  computeMoldaviteLifeAreaScoresDeterministicV1,
  fnv1a32,
} from "../../src/moldavite/moldaviteScores.util.js";

test("fnv1a32 is deterministic", () => {
  assert.equal(fnv1a32("a"), fnv1a32("a"));
  assert.notEqual(fnv1a32("a"), fnv1a32("b"));
});

test("computeMoldaviteLifeAreaScoresDeterministicV1: stable across calls", () => {
  const seed = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const a = computeMoldaviteLifeAreaScoresDeterministicV1(seed);
  const b = computeMoldaviteLifeAreaScoresDeterministicV1(seed);
  assert.equal(a.scoringMode, MOLDAVITE_SCORING_MODE);
  assert.equal(a.scoringMode, "deterministic_v1");
  assert.deepEqual(a.lifeAreas, b.lifeAreas);
  assert.equal(a.primaryLifeArea, b.primaryLifeArea);
  assert.equal(a.secondaryLifeArea, b.secondaryLifeArea);
});

test("computeMoldaviteLifeAreaScoresDeterministicV1: scores in 55–94", () => {
  const s = computeMoldaviteLifeAreaScoresDeterministicV1("seed-x");
  for (const k of ["work", "money", "relationship"]) {
    const sc = s.lifeAreas[k].score;
    assert.ok(sc >= 55 && sc <= 94);
  }
});
