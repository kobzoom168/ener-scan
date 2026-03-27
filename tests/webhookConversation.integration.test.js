/**
 * Webhook-level conversation context: same snapshot builder used by lineWebhook text turns.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeWebhookTextActiveState,
  toGeminiConversationOwner,
} from "../src/utils/webhookTextActiveState.util.js";
import { isGenericAckText } from "../src/utils/stateMicroIntent.util.js";
import { isMainMenuAlias } from "../src/utils/webhookText.util.js";
import {
  shouldEmitPayNotNeededForPaymentIntent,
} from "../src/utils/paymentConversationRouting.util.js";

const uid = "U_integration_test_user";

function baseSession(overrides = {}) {
  return { pendingImage: null, flowVersion: 1, ...overrides };
}

test("free exhausted + pending image paywall → paywall_selecting_package (not idle)", () => {
  const r = computeWebhookTextActiveState({
    userId: uid,
    session: baseSession({ pendingImage: { imageBuffer: Buffer.from("x") } }),
    text: "ครับ",
    lowerText: "ครับ",
    activeAccessDecision: { allowed: false, reason: "payment_required" },
    activePendingPaymentRow: null,
    paymentMemoryState: "none",
    scanAbuseStatus: { isLocked: false },
  });
  assert.equal(r.resolved.stateOwner, "paywall_selecting_package");
  assert.equal(r.paymentState, "paywall_offer_single");
});

test("free exhausted → short ack “ครับ” still paywall owner", () => {
  const r = computeWebhookTextActiveState({
    userId: uid,
    session: baseSession({ pendingImage: {} }),
    text: "ครับ",
    lowerText: "ครับ",
    activeAccessDecision: { allowed: false, reason: "payment_required" },
    activePendingPaymentRow: null,
    paymentMemoryState: "",
    scanAbuseStatus: { isLocked: false },
  });
  assert.equal(r.resolved.stateOwner, "paywall_selecting_package");
});

test("free exhausted → “โอเคครับ” is generic ack token (polite strip)", () => {
  assert.equal(isGenericAckText("โอเคครับ"), true);
});

test("free exhausted → “จ่าย” does not change owner to idle (paywall package selected edge)", () => {
  const r = computeWebhookTextActiveState({
    userId: uid,
    session: baseSession({ pendingImage: {} }),
    text: "จ่าย",
    lowerText: "จ่าย",
    activeAccessDecision: { allowed: false, reason: "payment_required" },
    activePendingPaymentRow: null,
    paymentMemoryState: "",
    scanAbuseStatus: { isLocked: false },
  });
  assert.equal(r.resolved.stateOwner, "paywall_selecting_package");
});

test("paywall_selecting_package → “อันถูก” text does not change state owner (still paywall)", () => {
  const r = computeWebhookTextActiveState({
    userId: uid,
    session: baseSession({ pendingImage: {} }),
    text: "อันถูก",
    lowerText: "อันถูก",
    activeAccessDecision: { allowed: false, reason: "payment_required" },
    activePendingPaymentRow: null,
    paymentMemoryState: "",
    scanAbuseStatus: { isLocked: false },
  });
  assert.equal(r.resolved.stateOwner, "paywall_selecting_package");
});

test("pending_verify beats idle / generic", () => {
  const r = computeWebhookTextActiveState({
    userId: uid,
    session: baseSession(),
    text: "ยังไงต่อ",
    lowerText: "ยังไงต่อ",
    activeAccessDecision: { allowed: false, reason: "payment_required" },
    activePendingPaymentRow: { status: "pending_verify" },
    paymentMemoryState: "",
    scanAbuseStatus: { isLocked: false },
  });
  assert.equal(r.resolved.stateOwner, "pending_verify");
});

test("awaiting_slip owner", () => {
  const r = computeWebhookTextActiveState({
    userId: uid,
    session: baseSession(),
    text: "ครับ",
    lowerText: "ครับ",
    activeAccessDecision: { allowed: false, reason: "payment_required" },
    activePendingPaymentRow: { status: "awaiting_payment" },
    paymentMemoryState: "",
    scanAbuseStatus: { isLocked: false },
  });
  assert.equal(r.resolved.stateOwner, "awaiting_slip");
});

test("waiting_birthdate + free quota (no paywall)", () => {
  const r = computeWebhookTextActiveState({
    userId: uid,
    session: baseSession({ pendingImage: {} }),
    text: "จ่ายเงิน",
    lowerText: "จ่ายเงิน",
    activeAccessDecision: { allowed: true, reason: "free" },
    activePendingPaymentRow: null,
    paymentMemoryState: "",
    scanAbuseStatus: { isLocked: false },
  });
  assert.equal(r.resolved.stateOwner, "waiting_birthdate");
});

test("wrong-state date on paywall: still paywall (not waiting_birthdate)", () => {
  const r = computeWebhookTextActiveState({
    userId: uid,
    session: baseSession({ pendingImage: {} }),
    text: "14/09/1995",
    lowerText: "14/09/1995",
    activeAccessDecision: { allowed: false, reason: "payment_required" },
    activePendingPaymentRow: null,
    paymentMemoryState: "",
    scanAbuseStatus: { isLocked: false },
  });
  assert.equal(r.resolved.stateOwner, "paywall_selecting_package");
});

test("soft scan lock → soft_locked", () => {
  const r = computeWebhookTextActiveState({
    userId: uid,
    session: baseSession(),
    text: "hi",
    lowerText: "hi",
    activeAccessDecision: { allowed: true, reason: "free" },
    activePendingPaymentRow: null,
    paymentMemoryState: "",
    scanAbuseStatus: { isLocked: true },
  });
  assert.equal(r.resolved.stateOwner, "soft_locked");
});

test("toGeminiConversationOwner maps paywall canonical to legacy string", () => {
  assert.equal(toGeminiConversationOwner("paywall_selecting_package"), "paywall_offer_single");
  assert.equal(toGeminiConversationOwner("payment_package_selected"), "paywall_offer_single");
});

test("R1: free quota + waiting_birthdate + stale awaiting_payment row → waiting_birthdate owner", () => {
  const r = computeWebhookTextActiveState({
    userId: uid,
    session: baseSession({ pendingImage: {} }),
    text: "01/01/2540",
    lowerText: "01/01/2540",
    activeAccessDecision: { allowed: true, reason: "free" },
    activePendingPaymentRow: {
      status: "awaiting_payment",
      id: "p1",
      created_at: new Date().toISOString(),
    },
    paymentMemoryState: "",
    scanAbuseStatus: { isLocked: false },
  });
  assert.equal(r.resolved.stateOwner, "waiting_birthdate");
  assert.equal(r.paymentState, "none");
});

test("R2: access allowed + stale awaiting_payment + pay intent uses pay-not-needed path", () => {
  assert.equal(
    shouldEmitPayNotNeededForPaymentIntent(
      { allowed: true, reason: "free" },
      { status: "awaiting_payment" },
    ),
    true,
  );
});

test("R3: กลับเมนู is main menu alias (explicit utility)", () => {
  assert.equal(isMainMenuAlias("กลับเมนู", "กลับเมนู"), true);
  const r = computeWebhookTextActiveState({
    userId: uid,
    session: baseSession(),
    text: "กลับเมนู",
    lowerText: "กลับเมนู",
    activeAccessDecision: { allowed: true, reason: "free" },
    activePendingPaymentRow: { status: "awaiting_payment" },
    paymentMemoryState: "",
    scanAbuseStatus: { isLocked: false },
  });
  assert.equal(r.resolved.stateOwner, "idle");
  assert.equal(r.resolved.resolutionReason, "explicit_command");
});

test("R4: access denied + awaiting_payment → awaiting_slip owner", () => {
  const r = computeWebhookTextActiveState({
    userId: uid,
    session: baseSession(),
    text: "ครับ",
    lowerText: "ครับ",
    activeAccessDecision: { allowed: false, reason: "payment_required" },
    activePendingPaymentRow: { status: "awaiting_payment" },
    paymentMemoryState: "",
    scanAbuseStatus: { isLocked: false },
  });
  assert.equal(r.resolved.stateOwner, "awaiting_slip");
});

test("R5: pending_verify + access allowed + menu text → still pending_verify owner", () => {
  const r = computeWebhookTextActiveState({
    userId: uid,
    session: baseSession(),
    text: "กลับเมนู",
    lowerText: "กลับเมนู",
    activeAccessDecision: { allowed: true, reason: "free" },
    activePendingPaymentRow: { status: "pending_verify" },
    paymentMemoryState: "",
    scanAbuseStatus: { isLocked: false },
  });
  assert.equal(r.resolved.stateOwner, "pending_verify");
});

test("R6: scan idle + access allowed + no actionable payment → paid_active_scan_ready not slip", () => {
  const r = computeWebhookTextActiveState({
    userId: uid,
    session: baseSession(),
    text: "สวัสดี",
    lowerText: "สวัสดี",
    activeAccessDecision: { allowed: true, reason: "free", paidRemainingScans: 0 },
    activePendingPaymentRow: null,
    paymentMemoryState: "none",
    scanAbuseStatus: { isLocked: false },
  });
  assert.equal(r.resolved.stateOwner, "paid_active_scan_ready");
  assert.equal(r.paymentState, "none");
});
