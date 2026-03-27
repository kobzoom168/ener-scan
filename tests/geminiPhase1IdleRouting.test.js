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

test("allowedActions + shadow: idle and scan_ready_idle are phrase-only noop", () => {
  assert.deepEqual(allowedActionsForPhase1State("idle"), ["noop_phrase_only"]);
  assert.deepEqual(allowedActionsForPhase1State("scan_ready_idle"), [
    "noop_phrase_only",
  ]);
  assert.equal(isShadowPhase1Eligible("idle"), true);
  assert.equal(isShadowPhase1Eligible("scan_ready_idle"), true);
});

test("lineWebhook: idle/menu + true-idle paths call Phase-1 Gemini before replyIdleTextNoDuplicate", () => {
  const src = fs.readFileSync(lineWebhookPath, "utf8");
  const re =
    /const gfIdle = await invokePhase1GeminiOrchestrator\(\);[\s\S]*?replyIdleTextNoDuplicate/g;
  const matches = src.match(re);
  assert.ok(matches && matches.length >= 2, "expected ≥2 gfIdle blocks before replyIdleTextNoDuplicate");
});

test("lineWebhook: scan-ready guidance calls Phase-1 Gemini before buildPaidActiveScanReadyHumanText", () => {
  const src = fs.readFileSync(lineWebhookPath, "utf8");
  const iOrc = src.indexOf("const gfScanReady = await invokePhase1GeminiOrchestrator()");
  const iBuild = src.indexOf("buildPaidActiveScanReadyHumanText(userId)");
  assert.ok(iOrc > 0 && iBuild > iOrc);
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
