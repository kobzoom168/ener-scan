import { test } from "node:test";
import assert from "node:assert/strict";
import { sendScanResultPushWith429Retry } from "../src/utils/linePush429Retry.util.js";

/** Minimal flex payload for pushMessage mocks. */
const sampleFlex = {
  type: "flex",
  altText: "scan",
  contents: {
    type: "bubble",
    body: { type: "box", layout: "vertical", contents: [] },
  },
};

/** @returns {Error & { status: number }} */
function err429() {
  const e = /** @type {Error & { status: number }} */ (new Error("too many requests"));
  e.status = 429;
  return e;
}

/** @returns {Error & { status: number }} */
function err400() {
  const e = /** @type {Error & { status: number }} */ (new Error("bad flex"));
  e.status = 400;
  return e;
}

test("sendScanResultPushWith429Retry: flex two 429s then success", async (t) => {
  t.mock.method(Math, "random", () => 0);

  let pushes = 0;
  const client = {
    async pushMessage(_uid, payload) {
      pushes += 1;
      assert.equal(payload?.type, "flex");
      if (pushes <= 2) throw err429();
    },
  };

  const result = await sendScanResultPushWith429Retry({
    client,
    userId: "Udeadbeefcafe",
    flexMessage: sampleFlex,
    text: "fallback body",
    logPrefix: "[TEST_SCAN_PUSH]",
  });

  assert.equal(pushes, 3);
  assert.equal(result.sent, true);
  assert.equal(result.method, "push_flex");
  assert.equal(result.attempts, 3);
  assert.equal(result.is429, false);
  assert.equal(result.finalStatus, null);
  assert.equal(result.finalMessage, null);
});

test("sendScanResultPushWith429Retry: flex exhausted then text success", async (t) => {
  t.mock.method(Math, "random", () => 0);

  let pushes = 0;
  const client = {
    async pushMessage(_uid, payload) {
      pushes += 1;
      if (payload?.type === "flex") {
        throw err429();
      }
      assert.equal(payload?.type, "text");
      assert.ok(String(payload?.text || "").includes("fallback"));
    },
  };

  const result = await sendScanResultPushWith429Retry({
    client,
    userId: "Udeadbeefcafe",
    flexMessage: sampleFlex,
    text: "fallback body",
    logPrefix: "[TEST_SCAN_PUSH]",
  });

  assert.equal(pushes, 4);
  assert.equal(result.sent, true);
  assert.equal(result.method, "push_text");
  assert.equal(result.attempts, 4);
  assert.equal(result.is429, false);
});

test("sendScanResultPushWith429Retry: flex exhausted then text exhausted", async (t) => {
  t.mock.method(Math, "random", () => 0);

  let pushes = 0;
  const client = {
    async pushMessage() {
      pushes += 1;
      throw err429();
    },
  };

  const result = await sendScanResultPushWith429Retry({
    client,
    userId: "Udeadbeefcafe",
    flexMessage: sampleFlex,
    text: "fallback body",
    logPrefix: "[TEST_SCAN_PUSH]",
  });

  assert.equal(pushes, 6);
  assert.equal(result.sent, false);
  assert.equal(result.method, "push_text");
  assert.equal(result.is429, true);
  assert.equal(result.finalStatus, 429);
});

test("sendScanResultPushWith429Retry: non-429 flex failure then text success", async (t) => {
  t.mock.method(Math, "random", () => 0);

  let pushes = 0;
  const client = {
    async pushMessage(_uid, payload) {
      pushes += 1;
      if (payload?.type === "flex") {
        throw err400();
      }
      assert.equal(payload?.type, "text");
    },
  };

  const result = await sendScanResultPushWith429Retry({
    client,
    userId: "Udeadbeefcafe",
    flexMessage: sampleFlex,
    text: "plain result",
    logPrefix: "[TEST_SCAN_PUSH]",
  });

  assert.equal(pushes, 2);
  assert.equal(result.sent, true);
  assert.equal(result.method, "push_text");
  assert.equal(result.attempts, 2);
  assert.equal(result.is429, false);
  assert.equal(result.finalStatus, null);
});
