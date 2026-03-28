/**
 * Phase-1 Gemini resolver + phrase-only actions for idle / scan-ready owners.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../src/config/env.js";
import { resolveGeminiPhase1StateKey } from "../src/core/conversation/geminiFront/geminiFront.featureFlags.js";
import { isShadowPhase1Eligible } from "../src/core/conversation/geminiFront/geminiFrontShadow.service.js";
import {
  allowedActionsForPhase1State,
  validateProposedAction,
} from "../src/core/conversation/geminiFront/geminiActionValidator.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const lineWebhookPath = path.join(__dirname, "../src/routes/lineWebhook.js");

function baseS(overrides = {}) {
  return {
    session: {},
    paymentState: "none",
    flowState: "idle",
    hasPendingVerify: false,
    hasAwaitingSlip: false,
    paymentMemoryState: "none",
    selectedPackageKey: null,
    canonicalStateOwner: "idle",
    ...overrides,
  };
}

test("resolveGeminiPhase1StateKey: idle owner → idle (phase1-only on)", () => {
  if (!env.GEMINI_FRONT_PHASE1_ONLY) return;
  const k = resolveGeminiPhase1StateKey(baseS());
  assert.equal(k, "idle");
});

test("resolveGeminiPhase1StateKey: paid_active_scan_ready → scan_ready_idle", () => {
  if (!env.GEMINI_FRONT_PHASE1_ONLY) return;
  const k = resolveGeminiPhase1StateKey(
    baseS({ canonicalStateOwner: "paid_active_scan_ready" }),
  );
  assert.equal(k, "scan_ready_idle");
});

test("resolveGeminiPhase1StateKey: pending_verify beats idle canonical", () => {
  if (!env.GEMINI_FRONT_PHASE1_ONLY) return;
  const k = resolveGeminiPhase1StateKey(
    baseS({
      hasPendingVerify: true,
      canonicalStateOwner: "idle",
    }),
  );
  assert.equal(k, "pending_verify");
});

test("resolveGeminiPhase1StateKey: hard_blocked + soft_locked canonical", () => {
  if (!env.GEMINI_FRONT_PHASE1_ONLY) return;
  assert.equal(
    resolveGeminiPhase1StateKey(baseS({ canonicalStateOwner: "hard_blocked" })),
    "hard_blocked",
  );
  assert.equal(
    resolveGeminiPhase1StateKey(baseS({ canonicalStateOwner: "soft_locked" })),
    "soft_locked",
  );
});

test("allowedActions + shadow: idle and scan_ready_idle are phrase-only noop", () => {
  assert.deepEqual(allowedActionsForPhase1State("idle"), ["noop_phrase_only"]);
  assert.deepEqual(allowedActionsForPhase1State("scan_ready_idle"), [
    "noop_phrase_only",
  ]);
  assert.deepEqual(allowedActionsForPhase1State("hard_blocked"), [
    "noop_phrase_only",
  ]);
  assert.deepEqual(allowedActionsForPhase1State("soft_locked"), [
    "noop_phrase_only",
  ]);
  assert.equal(isShadowPhase1Eligible("idle"), true);
  assert.equal(isShadowPhase1Eligible("scan_ready_idle"), true);
  assert.equal(isShadowPhase1Eligible("hard_blocked"), true);
  assert.equal(isShadowPhase1Eligible("soft_locked"), true);
});

test("lineWebhook: replyIdleTextNoDuplicate invokes Phase-1 Gemini before sendNonScanReply", () => {
  const src = fs.readFileSync(lineWebhookPath, "utf8");
  const fnStart = src.indexOf("async function replyIdleTextNoDuplicate");
  assert.ok(fnStart > 0, "replyIdleTextNoDuplicate not found");
  const nextAsync = src.indexOf("\nasync function ", fnStart + 10);
  const body = src.slice(
    fnStart,
    nextAsync > 0 ? nextAsync : fnStart + 1200,
  );
  const iInvoke = body.indexOf("invokePhase1GeminiOrchestrator");
  const iSend = body.indexOf("await sendNonScanReply");
  assert.ok(iInvoke > 0 && iSend > iInvoke, "Phase-1 must run before idle send");
});

test("lineWebhook: scan-ready guidance calls Phase-1 Gemini before buildPaidActiveScanReadyHumanText", () => {
  const src = fs.readFileSync(lineWebhookPath, "utf8");
  const anchor = 'routeReason: "paid_active_scan_ready_guidance"';
  const iAnchor = src.indexOf(anchor);
  assert.ok(iAnchor > 0, "expected paid_active_scan_ready_guidance anchor");
  const windowStart = src.lastIndexOf('if (paymentState === "approved_intro")', iAnchor);
  assert.ok(windowStart > 0);
  const window = src.slice(windowStart, iAnchor + anchor.length);
  const iGuard = window.indexOf(
    "if ((await invokePhase1GeminiOrchestrator()).handled) return;",
  );
  const iBuild = window.indexOf("buildPaidActiveScanReadyHumanText(userId)");
  assert.ok(iGuard > 0 && iBuild > iGuard);
});

test("idle + สวัสดี path: noop_phrase_only validates (orchestrator→runGeminiPhrasing branch)", () => {
  const v = validateProposedAction({
    phase1State: "idle",
    proposed_action: "noop_phrase_only",
    confidence: 0.99,
  });
  assert.equal(v.ok, true);
  assert.equal(v.resolved_action, "noop_phrase_only");
});

test("scan_ready_idle: noop_phrase_only validates for phrasing branch", () => {
  const v = validateProposedAction({
    phase1State: "scan_ready_idle",
    proposed_action: "noop_phrase_only",
    confidence: 0.99,
  });
  assert.equal(v.ok, true);
  assert.equal(v.resolved_action, "noop_phrase_only");
});
