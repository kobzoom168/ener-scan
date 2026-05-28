import test from "node:test";
import assert from "node:assert/strict";

import {
  buildScanLifecyclePayload,
  emitScanCompletedEvent,
  emitScanLifecycleEvents,
  sanitizeEventPayload,
} from "../src/services/enerAiLifecycleEvents.service.js";

test("buildScanLifecyclePayload includes safe fields", () => {
  const payload = buildScanLifecyclePayload({
    lineUserId: "U1",
    scanId: "job-1",
    reportId: "rep-1",
    publicToken: "tok-abc",
    reportUrl: "https://example.com/r/tok-abc",
    objectType: "amulet",
    score: 88,
    scanMode: "summary_link",
    durationMs: 1200,
  });
  assert.equal(payload.lineUserId, "U1");
  assert.equal(payload.scanId, "job-1");
  assert.equal(payload.reportId, "rep-1");
  assert.equal(payload.publicToken, "tok-abc");
  assert.equal(payload.score, 88);
  assert.equal(payload.scanMode, "summary_link");
});

test("sanitizeEventPayload strips image and slip fields", () => {
  const cleaned = sanitizeEventPayload({
    lineUserId: "U1",
    image_base64: "data:image/png;base64,abc",
    slip_image: "x",
    reportUrl: "https://example.com/r/x",
  });
  assert.equal(cleaned.lineUserId, "U1");
  assert.equal(cleaned.reportUrl, "https://example.com/r/x");
  assert.equal(cleaned.image_base64, undefined);
  assert.equal(cleaned.slip_image, undefined);
});

test("missing optional fields do not crash lifecycle emitters", () => {
  assert.doesNotThrow(() => emitScanLifecycleEvents({}));
  assert.doesNotThrow(() => emitScanCompletedEvent({ dedupHit: true }));
});

test("emitScanLifecycleEvents sends scan_completed and report_created", async () => {
  const calls = [];
  const original = global.fetch;
  global.fetch = async (_url, init) => {
    calls.push(JSON.parse(String(init?.body || "{}")));
    return { ok: true, status: 200, statusText: "OK" };
  };
  try {
    const { sendEnerAiEvent } = await import("../src/services/enerAiEvent.service.js");
    const envMod = await import("../src/config/env.js");
    const prevEnabled = envMod.env.ENER_AI_EVENT_ENABLED;
    const prevUrl = envMod.env.ENER_AI_EVENT_URL;
    envMod.env.ENER_AI_EVENT_ENABLED = "true";
    envMod.env.ENER_AI_EVENT_URL = "http://127.0.0.1:9/event";

    emitScanLifecycleEvents({
      lineUserId: "U-test",
      reportId: "report-xyz",
      objectType: "amulet",
      score: 90,
    });
    await new Promise((r) => setTimeout(r, 50));

    assert.equal(calls.length, 2);
    assert.equal(calls[0].event_type, "scan_completed");
    assert.equal(calls[1].event_type, "report_created");
    assert.equal(calls[0].payload.lineUserId, "U-test");
    assert.notEqual(calls[0].payload.image_base64, "secret");

    envMod.env.ENER_AI_EVENT_ENABLED = prevEnabled;
    envMod.env.ENER_AI_EVENT_URL = prevUrl;
    void sendEnerAiEvent;
  } finally {
    global.fetch = original;
  }
});

test("sendEnerAiEvent failure does not throw from lifecycle helper", async () => {
  const original = global.fetch;
  global.fetch = async () => {
    throw new Error("network down");
  };
  try {
    const envMod = await import("../src/config/env.js");
    envMod.env.ENER_AI_EVENT_ENABLED = "true";
    envMod.env.ENER_AI_EVENT_URL = "http://127.0.0.1:9/event";
    assert.doesNotThrow(() =>
      emitScanLifecycleEvents({ lineUserId: "U1", reportId: "r1" }),
    );
    await new Promise((r) => setTimeout(r, 30));
  } finally {
    global.fetch = original;
  }
});
