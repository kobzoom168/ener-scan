import assert from "node:assert/strict";
import { test, afterEach } from "node:test";
import {
  evaluateTextEdgeGate,
  resetEdgeGateStatsForTests,
} from "../src/stores/edgeGate.store.js";

afterEach(() => {
  resetEdgeGateStatsForTests();
});

test("edge gate: first message ok, duplicate LINE message id dropped", () => {
  const uid = "u_edge_1";
  const mid = "msg_dup_1";
  const r1 = evaluateTextEdgeGate({
    userId: uid,
    messageId: mid,
    text: "hello",
    now: 1000,
  });
  assert.equal(r1.action, "ok");
  const r2 = evaluateTextEdgeGate({
    userId: uid,
    messageId: mid,
    text: "hello",
    now: 1001,
  });
  assert.equal(r2.action, "drop_duplicate_event");
});

test("edge gate: identical text within window suppressed", () => {
  const uid = "u_edge_2";
  const t0 = 10_000;
  const a = evaluateTextEdgeGate({
    userId: uid,
    messageId: "m1",
    text: "จ่ายเงิน",
    now: t0,
  });
  assert.equal(a.action, "ok");
  const b = evaluateTextEdgeGate({
    userId: uid,
    messageId: "m2",
    text: "จ่ายเงิน",
    now: t0 + 2000,
  });
  assert.equal(b.action, "suppress_identical_inbound");
});

test("edge gate: empty text ignored", () => {
  const r = evaluateTextEdgeGate({
    userId: "u",
    messageId: "m",
    text: "   ",
    now: 1,
  });
  assert.equal(r.action, "ignore_empty");
});
