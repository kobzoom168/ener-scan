import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isLine429Error,
  notifyLineUserTextAfterAdminAction,
} from "../src/utils/lineNotify429Retry.util.js";

/** @returns {Error & { status: number }} */
function err429() {
  const e = /** @type {Error & { status: number }} */ (new Error("too many requests"));
  e.status = 429;
  return e;
}

test("notifyLineUserTextAfterAdminAction: first push attempt succeeds", async (t) => {
  t.mock.method(Math, "random", () => 0);

  let pushes = 0;
  const client = {
    async pushMessage() {
      pushes += 1;
    },
    async replyMessage() {
      assert.fail("reply should not be used");
    },
  };

  const result = await notifyLineUserTextAfterAdminAction({
    client,
    lineUserId: "Udeadbeefcafe",
    text: "ยืนยัน",
    replyToken: null,
    logPrefix: "[TEST_LINE_NOTIFY]",
  });

  assert.equal(pushes, 1);
  assert.deepEqual(result, {
    userNotified: true,
    channel: "push",
    attempts: 1,
    notifyError: null,
    sent: true,
    method: "push",
    finalStatus: null,
    finalMessage: null,
    is429: false,
  });
});

test("notifyLineUserTextAfterAdminAction: two 429s on push then success", async (t) => {
  t.mock.method(Math, "random", () => 0);

  let pushes = 0;
  const client = {
    async pushMessage() {
      pushes += 1;
      if (pushes <= 2) throw err429();
    },
    async replyMessage() {
      assert.fail("reply should not be used");
    },
  };

  const result = await notifyLineUserTextAfterAdminAction({
    client,
    lineUserId: "Udeadbeefcafe",
    text: "ยืนยัน",
    replyToken: null,
    logPrefix: "[TEST_LINE_NOTIFY]",
  });

  assert.equal(pushes, 3);
  assert.equal(result.userNotified, true);
  assert.equal(result.channel, "push");
  assert.equal(result.attempts, 3);
  assert.equal(result.notifyError, null);
});

test("notifyLineUserTextAfterAdminAction: three push 429s exhausted notifyError line_429", async (t) => {
  t.mock.method(Math, "random", () => 0);

  let pushes = 0;
  const client = {
    async pushMessage() {
      pushes += 1;
      throw err429();
    },
    async replyMessage() {
      assert.fail("reply should not be used");
    },
  };

  const result = await notifyLineUserTextAfterAdminAction({
    client,
    lineUserId: "Udeadbeefcafe",
    text: "ยืนยัน",
    replyToken: null,
    logPrefix: "[TEST_LINE_NOTIFY]",
  });

  assert.equal(pushes, 3);
  assert.equal(result.userNotified, false);
  assert.equal(result.channel, "push");
  assert.equal(result.attempts, 3);
  assert.equal(result.notifyError, "line_429");
  assert.ok(isLine429Error(result.lastError));
});

test("notifyLineUserTextAfterAdminAction: reply failure falls back to push", async (t) => {
  t.mock.method(Math, "random", () => 0);

  const client = {
    async replyMessage() {
      throw err429();
    },
    async pushMessage() {},
  };

  const result = await notifyLineUserTextAfterAdminAction({
    client,
    lineUserId: "Udeadbeefcafe",
    text: "ยืนยัน",
    replyToken: "onetimetoken",
    logPrefix: "[TEST_LINE_NOTIFY]",
  });

  assert.deepEqual(result, {
    userNotified: true,
    channel: "push",
    attempts: 1,
    notifyError: null,
    sent: true,
    method: "push",
    finalStatus: null,
    finalMessage: null,
    is429: false,
  });
});
