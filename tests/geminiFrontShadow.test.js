import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  computePhase1ShadowWouldHandle,
  computeShadowDisagrees,
  isShadowPhase1Eligible,
  mapResolvedActionToSpecFinalAction,
  resolvedActionFamily,
  runPhase1GeminiShadowPipeline,
  SHADOW_BRANCH_EXPECTED_FAMILIES,
} from "../src/core/conversation/geminiFront/geminiFrontShadow.service.js";
import { validateProposedAction } from "../src/core/conversation/geminiFront/geminiActionValidator.js";
import { TelemetryEvents } from "../src/core/telemetry/telemetryEvents.js";

function baseCtx() {
  return {
    userId: "u_shadow_test",
    text: "สวัสดี",
    deterministicBranch: "awaiting_slip_default",
    phase1State: "awaiting_slip",
    conversationOwner: "awaiting_slip",
    paymentState: "awaiting_slip",
    flowState: "idle",
    accessState: "payment_required",
    pendingPaymentStatus: "awaiting_payment",
    selectedPackageKey: null,
  };
}

test("isShadowPhase1Eligible: includes waiting_birthdate", () => {
  assert.equal(isShadowPhase1Eligible("awaiting_slip"), true);
  assert.equal(isShadowPhase1Eligible("pending_verify"), true);
  assert.equal(isShadowPhase1Eligible("paywall_selecting_package"), true);
  assert.equal(isShadowPhase1Eligible("payment_package_selected"), true);
  assert.equal(isShadowPhase1Eligible("waiting_birthdate"), true);
  assert.equal(isShadowPhase1Eligible(null), false);
});

test("mode off: no planner telemetry (shadow pipeline skipped)", async () => {
  const logs = [];
  const r = await runPhase1GeminiShadowPipeline(baseCtx(), {
    getGeminiFrontMode: () => "off",
    logTelemetryEvent: (ev, p) => logs.push({ ev, p }),
    bypassEnabledGate: true,
    bypassModeGate: false,
  });
  assert.equal(r.skipped, true);
  assert.equal(r.reason, "not_shadow_mode");
  assert.equal(logs.length, 0);
});

test("shadow + waiting_birthdate: planner runs (now eligible)", async () => {
  const logs = [];
  let plannerCalls = 0;
  const r = await runPhase1GeminiShadowPipeline(
    {
      ...baseCtx(),
      phase1State: "waiting_birthdate",
      conversationOwner: "waiting_birthdate",
      paymentState: "none",
      flowState: "waiting_birthdate",
      deterministicBranch: "waiting_birthdate_guidance",
    },
    {
      getGeminiFrontMode: () => "shadow",
      logTelemetryEvent: (ev, p) => logs.push({ ev, p }),
      bypassEnabledGate: true,
      bypassModeGate: true,
      runGeminiPlannerWithMeta: async () => {
        plannerCalls += 1;
        return {
          plan: {
            intent: "unknown",
            state_guess: "waiting_birthdate",
            proposed_action: "noop_phrase_only",
            confidence: 0.99,
            reply_style: "neutral_help",
          },
          outcome: "ok",
        };
      },
    },
  );
  assert.equal(r.skipped, undefined);
  assert.equal(plannerCalls, 1);
  assert.ok(logs.some((l) => l.ev === TelemetryEvents.GEMINI_FRONT_SHADOW_REQUESTED));
  assert.ok(logs.some((l) => l.ev === TelemetryEvents.GEMINI_FRONT_SHADOW_RESULT));
});

test("shadow + eligible: planner + validator, no side effects", async () => {
  const logs = [];
  let plannerCalls = 0;
  await runPhase1GeminiShadowPipeline(baseCtx(), {
    getGeminiFrontMode: () => "shadow",
    bypassEnabledGate: true,
    bypassModeGate: true,
    logTelemetryEvent: (ev, p) => logs.push({ ev, p }),
    runGeminiPlannerWithMeta: async () => {
      plannerCalls += 1;
      return {
        plan: {
          intent: "unknown",
          state_guess: "x",
          proposed_action: "not_a_real_action",
          confidence: 0.99,
          reply_style: "neutral_help",
        },
        outcome: "ok",
      };
    },
  });
  assert.equal(plannerCalls, 1);
  const evs = logs.map((l) => l.ev);
  assert.ok(evs.includes(TelemetryEvents.GEMINI_FRONT_SHADOW_REQUESTED));
  assert.ok(evs.includes(TelemetryEvents.GEMINI_FRONT_SHADOW_RESULT));
  const res = logs.find((l) => l.ev === TelemetryEvents.GEMINI_FRONT_SHADOW_RESULT);
  assert.equal(res.p.validatorAccepted, false);
  assert.equal(res.p.wouldHandle, false);
});

test("validator reject: wouldHandle false", () => {
  const plan = {
    intent: "pay",
    state_guess: "pv",
    proposed_action: "send_qr_bundle",
    confidence: 0.99,
    reply_style: "n",
  };
  const v = validateProposedAction({
    phase1State: "pending_verify",
    proposed_action: "send_qr_bundle",
    confidence: 0.99,
  });
  assert.equal(v.ok, false);
  assert.equal(computePhase1ShadowWouldHandle(plan, v), false);
});

test("spec finalAction: noop / reply_same_state / clarify_same_state exclude wouldHandle", () => {
  assert.equal(mapResolvedActionToSpecFinalAction("noop_phrase_only"), "noop");
  assert.equal(mapResolvedActionToSpecFinalAction("get_conversation_context"), "clarify_same_state");
  assert.equal(mapResolvedActionToSpecFinalAction("send_help_reply"), "reply_same_state");
  const noopPlan = {
    intent: "x",
    state_guess: "y",
    proposed_action: "noop_phrase_only",
    confidence: 0.99,
    reply_style: "n",
  };
  const noopV = validateProposedAction({
    phase1State: "awaiting_slip",
    proposed_action: "noop_phrase_only",
    confidence: 0.99,
  });
  assert.equal(noopV.ok, true);
  assert.equal(computePhase1ShadowWouldHandle(noopPlan, noopV), false);
  const helpPlan = {
    intent: "help",
    state_guess: "y",
    proposed_action: "send_help_reply",
    confidence: 0.99,
    reply_style: "n",
  };
  const helpV = validateProposedAction({
    phase1State: "awaiting_slip",
    proposed_action: "send_help_reply",
    confidence: 0.99,
  });
  assert.equal(helpV.ok, true);
  assert.equal(computePhase1ShadowWouldHandle(helpPlan, helpV), false);
});

test("meaningful action: wouldHandle true and shadowDisagrees on recovery branch", async () => {
  const logs = [];
  const paySelectedCtx = {
    ...baseCtx(),
    phase1State: "payment_package_selected",
    deterministicBranch: "payment_package_selected_unclear",
    paymentState: "paywall_offer_single",
    selectedPackageKey: "49baht_4scans_24h",
  };
  await runPhase1GeminiShadowPipeline(paySelectedCtx, {
    getGeminiFrontMode: () => "shadow",
    bypassEnabledGate: true,
    bypassModeGate: true,
    logTelemetryEvent: (ev, p) => logs.push({ ev, p }),
    runGeminiPlannerWithMeta: async () => ({
      plan: {
        intent: "request_qr",
        state_guess: "payment_package_selected",
        proposed_action: "send_qr_bundle",
        confidence: 0.99,
        reply_style: "short_warm_operator",
      },
      outcome: "ok",
    }),
  });
  const res = logs.find((l) => l.ev === TelemetryEvents.GEMINI_FRONT_SHADOW_RESULT);
  assert.equal(res.p.wouldHandle, true);
  assert.equal(res.p.shadowDisagrees, true);
});

test("noop_phrase_only: wouldHandle false, no disagreement", async () => {
  const logs = [];
  await runPhase1GeminiShadowPipeline(baseCtx(), {
    getGeminiFrontMode: () => "shadow",
    bypassEnabledGate: true,
    bypassModeGate: true,
    logTelemetryEvent: (ev, p) => logs.push({ ev, p }),
    runGeminiPlannerWithMeta: async () => ({
      plan: {
        intent: "ack",
        state_guess: "s",
        proposed_action: "noop_phrase_only",
        confidence: 0.99,
        reply_style: "n",
      },
      outcome: "ok",
    }),
  });
  const res = logs.find((l) => l.ev === TelemetryEvents.GEMINI_FRONT_SHADOW_RESULT);
  assert.equal(res.p.wouldHandle, false);
  assert.equal(res.p.shadowDisagrees, false);
});

test("planner outcome error: GEMINI_FRONT_SHADOW_FAILED", async () => {
  const logs = [];
  const r = await runPhase1GeminiShadowPipeline(baseCtx(), {
    getGeminiFrontMode: () => "shadow",
    bypassEnabledGate: true,
    bypassModeGate: true,
    logTelemetryEvent: (ev, p) => logs.push({ ev, p }),
    runGeminiPlannerWithMeta: async () => ({
      plan: null,
      outcome: "error",
      errorMessage: "simulated_failure",
    }),
  });
  assert.equal(r.ok, false);
  const failed = logs.filter((l) => l.ev === TelemetryEvents.GEMINI_FRONT_SHADOW_FAILED);
  assert.equal(failed.length, 1);
  assert.equal(failed[0].p.message, "simulated_failure");
});

test("planner null (parse_fail): RESULT without FAILED", async () => {
  const logs = [];
  await runPhase1GeminiShadowPipeline(baseCtx(), {
    getGeminiFrontMode: () => "shadow",
    bypassEnabledGate: true,
    bypassModeGate: true,
    logTelemetryEvent: (ev, p) => logs.push({ ev, p }),
    runGeminiPlannerWithMeta: async () => ({
      plan: null,
      outcome: "parse_fail",
    }),
  });
  const result = logs.find((l) => l.ev === TelemetryEvents.GEMINI_FRONT_SHADOW_RESULT);
  assert.ok(result);
  assert.equal(result.p.wouldHandle, false);
  assert.equal(result.p.plannerOutcome, "parse_fail");
  assert.equal(
    logs.filter((l) => l.ev === TelemetryEvents.GEMINI_FRONT_SHADOW_FAILED).length,
    0,
  );
});

test("computeShadowDisagrees: branch table vs action family", () => {
  assert.equal(
    computeShadowDisagrees("awaiting_slip_default", "send_qr_bundle", ""),
    true,
  );
  assert.equal(
    computeShadowDisagrees("paywall_selecting_unclear", "noop_phrase_only", ""),
    false,
  );
  assert.equal(
    computeShadowDisagrees("payment_package_selected_date_wrong", "send_qr_bundle", ""),
    true,
  );
  assert.equal(computeShadowDisagrees("unknown_branch_xyz", "send_qr_bundle", ""), false);
});

test("SHADOW_BRANCH_EXPECTED_FAMILIES covers paywall + slip + pending_verify recovery labels", () => {
  assert.ok("paywall_selecting_unclear" in SHADOW_BRANCH_EXPECTED_FAMILIES);
  assert.ok("payment_package_selected_unclear" in SHADOW_BRANCH_EXPECTED_FAMILIES);
  assert.ok("paywall_selecting_date_wrong" in SHADOW_BRANCH_EXPECTED_FAMILIES);
  assert.ok("payment_package_selected_date_wrong" in SHADOW_BRANCH_EXPECTED_FAMILIES);
  assert.ok("awaiting_slip_default" in SHADOW_BRANCH_EXPECTED_FAMILIES);
  assert.ok("pending_verify_default" in SHADOW_BRANCH_EXPECTED_FAMILIES);
});

test("resolvedActionFamily maps tools for telemetry", () => {
  assert.equal(resolvedActionFamily("noop_phrase_only"), "guidance_recovery");
  assert.equal(resolvedActionFamily("send_qr_bundle"), "payment_qr");
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const shadowSrcPath = path.join(
  __dirname,
  "../src/core/conversation/geminiFront/geminiFrontShadow.service.js",
);

test("shadow module stays telemetry-only (no gateway / phrasing / action execution)", () => {
  const src = fs.readFileSync(shadowSrcPath, "utf8");
  for (const bad of [
    "sendNonScanReply",
    "nonScanReply.gateway",
    "executeConversationAction",
    "runGeminiPhrasing",
    "conversationActions",
  ]) {
    assert.ok(!src.includes(bad), `forbidden reference: ${bad}`);
  }
});

test("runPhase1GeminiShadowPipeline does not mutate ctx", async () => {
  const ctx = { ...baseCtx() };
  const snap = { ...ctx };
  await runPhase1GeminiShadowPipeline(ctx, {
    getGeminiFrontMode: () => "shadow",
    bypassEnabledGate: true,
    bypassModeGate: true,
    logTelemetryEvent: () => {},
    runGeminiPlannerWithMeta: async () => ({
      plan: {
        intent: "x",
        state_guess: "y",
        proposed_action: "noop_phrase_only",
        confidence: 0.99,
        reply_style: "neutral_help",
      },
      outcome: "ok",
    }),
  });
  assert.deepEqual(ctx, snap);
});

test("lineWebhook: paywall recovery primaryText block does not reference shadow / geminiFront", () => {
  const lineWebhookPath = path.join(__dirname, "../src/routes/lineWebhook.js");
  const raw = fs.readFileSync(lineWebhookPath, "utf8");
  const src = raw.replace(/\r\n/g, "\n");
  const marker = '    const primaryText =\n      branch === "date_wrong"';
  const i = src.indexOf(marker);
  assert.ok(i >= 0, "paywall recovery primaryText anchor");
  const j = src.indexOf(
    "const chosenReplyType = resolvePaywallPromptReplyType",
    i,
  );
  const block = src.slice(i, j);
  assert.ok(!block.includes("geminiFront"));
  assert.ok(!block.includes("invokePhase1GeminiShadow"));
  assert.ok(!block.includes("getGeminiFrontMode"));
});
