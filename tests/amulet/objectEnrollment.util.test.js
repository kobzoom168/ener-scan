import test from "node:test";
import assert from "node:assert/strict";
import {
  ENROLLMENT_LOCK_MIN_VIEWS,
  consolidateEnrolledAxisScores,
  peakKeyFromAxisScores,
  planEnrollmentUpdate,
  shouldLockEnrollment,
} from "../../src/amulet/objectEnrollment.util.js";

const A = { protection: 80, metta: 40, baramee: 60, luck: 50, fortune_anchor: 45, specialty: 35 };
const B = { protection: 70, metta: 50, baramee: 60, luck: 40, fortune_anchor: 55, specialty: 45 };

test("consolidateEnrolledAxisScores: per-axis mean, order-independent", () => {
  const ab = consolidateEnrolledAxisScores([A, B]);
  const ba = consolidateEnrolledAxisScores([B, A]);
  assert.deepEqual(ab, ba);
  assert.equal(ab.protection, 75);
  assert.equal(ab.baramee, 60);
});

test("consolidateEnrolledAxisScores: empty → all zero", () => {
  const z = consolidateEnrolledAxisScores([]);
  assert.equal(Object.values(z).every((x) => x === 0), true);
});

test("shouldLockEnrollment: locks at the configured min views", () => {
  assert.equal(shouldLockEnrollment(ENROLLMENT_LOCK_MIN_VIEWS - 1), false);
  assert.equal(shouldLockEnrollment(ENROLLMENT_LOCK_MIN_VIEWS), true);
});

test("peakKeyFromAxisScores: argmax with POWER_ORDER tie-break", () => {
  assert.equal(peakKeyFromAxisScores(A), "protection");
});

test("planEnrollmentUpdate: second angle enrolls + locks consolidated scores", () => {
  const plan = planEnrollmentUpdate({ priorViewCount: 1, existingViews: [A], newView: B });
  assert.equal(plan.viewCount, 2);
  assert.equal(plan.isEnrolled, true);
  assert.equal(plan.lockedAxisScores.protection, 75);
  assert.equal(plan.peakPowerKey, "protection");
});

test("planEnrollmentUpdate: first view alone does not lock", () => {
  const plan = planEnrollmentUpdate({ priorViewCount: 0, existingViews: [], newView: A });
  assert.equal(plan.viewCount, 1);
  assert.equal(plan.isEnrolled, false);
});
