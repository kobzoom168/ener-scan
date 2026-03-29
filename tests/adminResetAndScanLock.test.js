import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_FREE_RESET_CONFIRM_TEXT,
  buildAdminFreeResetConfirmationPayload,
} from "../src/utils/adminResetNotify.util.js";
import {
  sendScanLockReply,
  SCAN_LOCKED_SOFT_PRIMARY,
  SCAN_LOCKED_HARD_PRIMARY,
  SCAN_LOCKED_SOFT_ALTERNATES,
} from "../src/utils/scanLockReply.util.js";
import { decideScanGate } from "../src/services/scanOfferAccess.resolver.js";
import { sendNonScanReply } from "../src/services/nonScanReply.gateway.js";

test("admin free reset confirmation: deterministic user text + numeric freeQuotaPerDay from offer", () => {
  const p = buildAdminFreeResetConfirmationPayload();
  assert.equal(p.text, ADMIN_FREE_RESET_CONFIRM_TEXT);
  assert.equal(typeof p.freeQuotaPerDay, "number");
  assert.ok(p.freeQuotaPerDay >= 1);
});

test("access: within free quota scans allowed; exhausted hits payment_required", () => {
  const now = new Date();
  assert.equal(
    decideScanGate({
      freeUsedToday: 0,
      freeQuotaPerDay: 2,
      paidUntil: null,
      paidRemainingScans: 0,
      now,
    }).allowed,
    true,
  );
  assert.equal(
    decideScanGate({
      freeUsedToday: 1,
      freeQuotaPerDay: 2,
      paidUntil: null,
      paidRemainingScans: 0,
      now,
    }).allowed,
    true,
  );
  assert.equal(
    decideScanGate({
      freeUsedToday: 2,
      freeQuotaPerDay: 2,
      paidUntil: null,
      paidRemainingScans: 0,
      now,
    }).allowed,
    false,
  );
});

test("sendScanLockReply: soft -> scan_locked_soft + SCAN_LOCK_REPLY_ROUTED", async () => {
  const payloads = [];
  const client = {
    replyMessage: async (_tok, msg) => {
      payloads.push(msg);
    },
  };
  const uid = `u_sl_soft_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const logs = [];
  const orig = console.log;
  console.log = (...a) => logs.push(a.map(String).join(" "));
  try {
    const r = await sendScanLockReply(client, {
      userId: uid,
      replyToken: "tok1",
      lockType: "soft",
      semanticKey: "scan_locked_soft:test",
    });
    assert.equal(r.sent, true);
  } finally {
    console.log = orig;
  }
  assert.ok(logs.some((l) => l.includes("SCAN_LOCK_REPLY_ROUTED")));
  assert.ok(logs.some((l) => l.includes('"replyType":"scan_locked_soft"')));
  assert.equal(payloads[0]?.text, SCAN_LOCKED_SOFT_PRIMARY);
});

test("sendScanLockReply: hard -> scan_locked_hard primary", async () => {
  const payloads = [];
  const client = {
    replyMessage: async (_tok, msg) => {
      payloads.push(msg);
    },
  };
  const uid = `u_sl_hard_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  await sendScanLockReply(client, {
    userId: uid,
    replyToken: "tok2",
    lockType: "hard",
    semanticKey: "scan_locked_hard:test",
  });
  assert.equal(payloads[0]?.text, SCAN_LOCKED_HARD_PRIMARY);
});

test("scan_locked_soft uses gateway alternates on duplicate primary", async () => {
  const payloads = [];
  const client = {
    replyMessage: async (_tok, msg) => {
      payloads.push(msg);
    },
  };
  const uid = `u_sl_dup_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const alt = SCAN_LOCKED_SOFT_ALTERNATES[0];
  const r1 = await sendNonScanReply({
    client,
    userId: uid,
    replyToken: "a",
    replyType: "scan_locked_soft",
    semanticKey: "scan_locked_soft:gateway_dup_test",
    text: SCAN_LOCKED_SOFT_PRIMARY,
    alternateTexts: [alt],
  });
  const r2 = await sendNonScanReply({
    client,
    userId: uid,
    replyToken: "b",
    replyType: "scan_locked_soft",
    semanticKey: "scan_locked_soft:gateway_dup_test",
    text: SCAN_LOCKED_SOFT_PRIMARY,
    alternateTexts: [alt],
  });
  assert.equal(r1.sent, true);
  assert.equal(r2.sent, true);
  assert.equal(r2.retryCount, 2);
  assert.equal(payloads[1]?.text, alt);
});

test("lock copy is scan-specific (not generic ใช้งานไม่ได้)", () => {
  assert.ok(SCAN_LOCKED_SOFT_PRIMARY.includes("รับสแกน"));
  assert.ok(SCAN_LOCKED_HARD_PRIMARY.includes("รับสแกน"));
  assert.equal(SCAN_LOCKED_SOFT_PRIMARY.includes("ใช้งานไม่ได้"), false);
});
