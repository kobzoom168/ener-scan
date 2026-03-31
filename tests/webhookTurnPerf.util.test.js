import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ENER_SCAN_PERF_PREFIX,
  createTurnPerf,
  logScanPipelinePerf,
} from "../src/utils/webhookTurnPerf.util.js";

test("createTurnPerf: single-line [ENER_SCAN_PERF] JSON with core fields", () => {
  const lines = [];
  const orig = console.log;
  console.log = (...args) => {
    lines.push(args.join(" "));
  };
  try {
    const p = createTurnPerf("Uxxxxxxxxxxxx-1234567890", "text", {
      messageId: "mid-abc",
    });
    p.log("TURN_START", { phase: "test" });
  } finally {
    console.log = orig;
  }
  assert.equal(lines.length, 1);
  assert.ok(lines[0].startsWith(`${ENER_SCAN_PERF_PREFIX} {`));
  const jsonPart = lines[0].slice(ENER_SCAN_PERF_PREFIX.length + 1);
  const o = JSON.parse(jsonPart);
  assert.equal(o.event, "TURN_START");
  assert.equal(o.kind, "text");
  assert.equal(o.messageId, "mid-abc");
  assert.equal(o.lineUserIdPrefix, "Uxxxxxxx");
  assert.equal(o.phase, "test");
  assert.ok(typeof o.elapsedMs === "number");
});

test("logScanPipelinePerf: worker-style event", () => {
  const lines = [];
  const orig = console.log;
  console.log = (...args) => {
    lines.push(args.join(" "));
  };
  try {
    logScanPipelinePerf("SCAN_AI_STARTED", {
      path: "worker-scan",
      jobIdPrefix: "ab12cd34",
      elapsedMs: 42,
    });
  } finally {
    console.log = orig;
  }
  assert.equal(lines.length, 1);
  const o = JSON.parse(lines[0].slice(ENER_SCAN_PERF_PREFIX.length + 1));
  assert.equal(o.event, "SCAN_AI_STARTED");
  assert.equal(o.jobIdPrefix, "ab12cd34");
});
