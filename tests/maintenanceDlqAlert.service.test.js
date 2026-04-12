import { test } from "node:test";
import assert from "node:assert/strict";
import { maybeSendDlqAlert } from "../src/services/maintenanceDlqAlert.service.js";

const baseEnv = {
  ADMIN_LINE_USER_ID: "Uadminuser123456789",
  CANARY_DLQ_DEAD_ALERT_THRESHOLD: 1,
  CHANNEL_ACCESS_TOKEN: "test-token",
  CHANNEL_SECRET: "test-secret",
};

test("maybeSendDlqAlert: below threshold → no push", async () => {
  let pushes = 0;
  const lineClient = {
    async pushMessage() {
      pushes += 1;
    },
  };
  await maybeSendDlqAlert(
    { outDead: 0, outFailed: 0 },
    {
      env: { ...baseEnv, CANARY_DLQ_DEAD_ALERT_THRESHOLD: 1 },
      lineClient,
    },
  );
  assert.equal(pushes, 0);
});

test("maybeSendDlqAlert: dead below custom threshold → no push", async () => {
  let pushes = 0;
  const lineClient = {
    async pushMessage() {
      pushes += 1;
    },
  };
  await maybeSendDlqAlert(
    { outDead: 1, outFailed: 0 },
    {
      env: { ...baseEnv, CANARY_DLQ_DEAD_ALERT_THRESHOLD: 2 },
      lineClient,
    },
  );
  assert.equal(pushes, 0);
});

test("maybeSendDlqAlert: threshold met + adminId → single push, text mentions dead", async () => {
  let pushes = 0;
  let lastText = "";
  const lineClient = {
    async pushMessage(_uid, msg) {
      pushes += 1;
      lastText = msg?.text ?? "";
    },
  };
  await maybeSendDlqAlert(
    { outDead: 2, outFailed: 3 },
    {
      env: { ...baseEnv, CANARY_DLQ_DEAD_ALERT_THRESHOLD: 2 },
      lineClient,
    },
  );
  assert.equal(pushes, 1);
  assert.match(lastText, /dead/i);
  assert.ok(lastText.includes("2"));
  assert.ok(lastText.includes("3"));
});

test("maybeSendDlqAlert: empty adminId → no push", async () => {
  let pushes = 0;
  const lineClient = {
    async pushMessage() {
      pushes += 1;
    },
  };
  await maybeSendDlqAlert(
    { outDead: 5, outFailed: 0 },
    {
      env: { ...baseEnv, ADMIN_LINE_USER_ID: "" },
      lineClient,
    },
  );
  assert.equal(pushes, 0);
});

test("maybeSendDlqAlert: push failure does not throw", async () => {
  const lineClient = {
    async pushMessage() {
      throw new Error("LINE down");
    },
  };
  await assert.doesNotReject(() =>
    maybeSendDlqAlert(
      { outDead: 1, outFailed: 0 },
      { env: baseEnv, lineClient },
    ),
  );
});
