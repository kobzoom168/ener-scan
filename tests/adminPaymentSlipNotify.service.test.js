import { test } from "node:test";
import assert from "node:assert/strict";
import { maybeNotifyAdminSlipPendingVerify } from "../src/services/adminPaymentSlipNotify.service.js";

const baseEnv = {
  ADMIN_LINE_USER_ID: "Uadminuser123456789012",
  ADMIN_PAYMENT_SLIP_NOTIFY: true,
  APP_BASE_URL: "https://app.example.com",
  CHANNEL_ACCESS_TOKEN: "t",
  CHANNEL_SECRET: "s",
};

test("maybeNotifyAdminSlipPendingVerify: no admin id → no push", async () => {
  let pushes = 0;
  const client = {
    async pushMessage() {
      pushes += 1;
    },
  };
  await maybeNotifyAdminSlipPendingVerify({
    client,
    lineUserId: "Uuser",
    paymentId: "pid-1",
    paymentRef: "ref-a",
    env: { ...baseEnv, ADMIN_LINE_USER_ID: "" },
  });
  assert.equal(pushes, 0);
});

test("maybeNotifyAdminSlipPendingVerify: ADMIN_PAYMENT_SLIP_NOTIFY false → no push", async () => {
  let pushes = 0;
  const client = {
    async pushMessage() {
      pushes += 1;
    },
  };
  await maybeNotifyAdminSlipPendingVerify({
    client,
    lineUserId: "Uuser",
    paymentId: "pid-1",
    env: { ...baseEnv, ADMIN_PAYMENT_SLIP_NOTIFY: false },
  });
  assert.equal(pushes, 0);
});

test("maybeNotifyAdminSlipPendingVerify: ok → push with pending_verify and link", async () => {
  let to = "";
  let lastMsg = null;
  const client = {
    async pushMessage(uid, msg) {
      to = uid;
      lastMsg = msg;
    },
  };
  await maybeNotifyAdminSlipPendingVerify({
    client,
    lineUserId: "Uaaaaaaaaaaaaaaaaaaa",
    paymentId: "pay-uuid-1",
    paymentRef: "ref-99",
    packageKey: "promo_99",
    slipUrl: "https://storage.example/slip.jpg",
    env: baseEnv,
  });
  assert.equal(to, baseEnv.ADMIN_LINE_USER_ID);
  assert.equal(lastMsg?.type, "text");
  assert.ok(String(lastMsg?.text || "").includes("pending_verify"));
  assert.ok(String(lastMsg?.text || "").includes("pay-uuid-1"));
  assert.ok(String(lastMsg?.text || "").includes("ref-99"));
  assert.ok(String(lastMsg?.text || "").includes("/admin/payments/"));
  assert.ok(String(lastMsg?.text || "").includes("promo_99"));
});

test("maybeNotifyAdminSlipPendingVerify: push failure does not throw", async () => {
  const client = {
    async pushMessage() {
      throw new Error("LINE down");
    },
  };
  await assert.doesNotReject(() =>
    maybeNotifyAdminSlipPendingVerify({
      client,
      lineUserId: "Ux",
      paymentId: "p2",
      env: baseEnv,
    }),
  );
});
