import { test } from "node:test";
import assert from "node:assert/strict";
import { waitForGracefulDrain } from "../src/workers/workerGracefulShutdown.util.js";
import {
  getScanWorkerShutdownSnapshot,
  resetScanWorkerShutdownStateForTests,
  setScanWorkerShuttingDownForTests,
  adjustScanWorkerActiveJobsForTests,
} from "../src/workers/scanWorker.js";

test("waitForGracefulDrain: resolves clean when active count reaches 0", async () => {
  let active = 2;
  const done = waitForGracefulDrain({
    getActiveCount: () => active,
    timeoutMs: 10_000,
    pollMs: 30,
  });
  await new Promise((r) => setTimeout(r, 120));
  active = 0;
  const outcome = await done;
  assert.equal(outcome, "clean");
});

test("waitForGracefulDrain: timeout when active never reaches 0", async () => {
  const outcome = await waitForGracefulDrain({
    getActiveCount: () => 1,
    timeoutMs: 250,
    pollMs: 50,
  });
  assert.equal(outcome, "timeout");
});

test("waitForGracefulDrain: immediate clean when already 0", async () => {
  const outcome = await waitForGracefulDrain({
    getActiveCount: () => 0,
    timeoutMs: 1000,
    pollMs: 50,
  });
  assert.equal(outcome, "clean");
});

test("waitForGracefulDrain: drain tied to scanWorker activeJobs snapshot", async () => {
  resetScanWorkerShutdownStateForTests();
  adjustScanWorkerActiveJobsForTests(1);
  const p = waitForGracefulDrain({
    getActiveCount: () => getScanWorkerShutdownSnapshot().activeJobs,
    timeoutMs: 5000,
    pollMs: 30,
  });
  await new Promise((r) => setTimeout(r, 80));
  adjustScanWorkerActiveJobsForTests(-1);
  const outcome = await p;
  assert.equal(outcome, "clean");
  assert.equal(getScanWorkerShutdownSnapshot().activeJobs, 0);
});

test("scanWorker shutdown snapshot: reset leaves counters at rest", () => {
  resetScanWorkerShutdownStateForTests();
  const s = getScanWorkerShutdownSnapshot();
  assert.equal(s.isShuttingDown, false);
  assert.equal(s.activeJobs, 0);
});

test("scanWorker: isShuttingDown flag is observable (loop stops claiming when true)", () => {
  resetScanWorkerShutdownStateForTests();
  setScanWorkerShuttingDownForTests(true);
  assert.equal(getScanWorkerShutdownSnapshot().isShuttingDown, true);
  resetScanWorkerShutdownStateForTests();
  assert.equal(getScanWorkerShutdownSnapshot().isShuttingDown, false);
});

test("scanWorker: activeJobs counter increments and decrements", () => {
  resetScanWorkerShutdownStateForTests();
  adjustScanWorkerActiveJobsForTests(1);
  adjustScanWorkerActiveJobsForTests(1);
  assert.equal(getScanWorkerShutdownSnapshot().activeJobs, 2);
  adjustScanWorkerActiveJobsForTests(-1);
  assert.equal(getScanWorkerShutdownSnapshot().activeJobs, 1);
  adjustScanWorkerActiveJobsForTests(-1);
  assert.equal(getScanWorkerShutdownSnapshot().activeJobs, 0);
});
