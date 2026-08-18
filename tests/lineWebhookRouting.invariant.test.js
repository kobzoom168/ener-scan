/**
 * Source-order invariant tests (Codex 14 ส.ค. รอบ 2): ล็อกลำดับ routing ใน
 * handleTextMessage โดยไม่ต้องรอ webhook DI refactor —
 * registration gate → exact utility (terminal, เจ้าของเดียว) → payment/states/LLM
 * ถ้าใครย้าย block แล้วลำดับผิด เทสต์นี้ต้องแดงทันที
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const SRC = fs.readFileSync(
  path.join(process.cwd(), "src", "routes", "lineWebhook.js"),
  "utf8",
);

const textLaneStart = SRC.indexOf("async function handleTextMessage");
assert.ok(textLaneStart > 0, "หา handleTextMessage ไม่เจอ");
const lane = SRC.slice(textLaneStart);

test("invariant: registration gate มาก่อน resume/exact utility ใน text lane", () => {
  const regIdx = lane.indexOf("handleUnregisteredText({");
  const resumeIdx = lane.indexOf("maybeHandlePreRegResume({ client");
  const utilIdx = lane.indexOf("runExactUtilityCommandTerminal({");
  assert.ok(regIdx > 0, "หา registration gate (handleUnregisteredText) ใน text lane ไม่เจอ");
  assert.ok(utilIdx > 0, "หา exact utility call site ไม่เจอ");
  assert.ok(regIdx < utilIdx, "exact utility ต้องอยู่หลัง registration gate");
  assert.ok(regIdx < resumeIdx && resumeIdx < utilIdx, "resume ต้องอยู่หลัง gate และก่อน utility");
});

test("invariant: exact utility อยู่ก่อน orchestrator/payment routing ตัวแรกของ lane", () => {
  const utilIdx = lane.indexOf("runExactUtilityCommandTerminal({");
  const firstLlmIdx = lane.indexOf("invokePhase1GeminiOrchestrator");
  const firstPaymentRouteIdx = lane.indexOf("handlePaymentCommandTextRoute({");
  assert.ok(firstLlmIdx > 0 && firstPaymentRouteIdx > 0);
  assert.ok(utilIdx < firstLlmIdx, "exact utility ต้องมาก่อน LLM orchestrator ทุกจุดใน lane");
  assert.ok(utilIdx < firstPaymentRouteIdx, "exact utility ต้องมาก่อน payment text route");
});

test("invariant: เจ้าของเดียว — referral/synergy call site เดียว ผ่าน terminal block เท่านั้น", () => {
  // นับเฉพาะ call sites (ตัด definition ที่ขึ้นต้น async function ออก)
  const countCalls = (name) =>
    (SRC.match(new RegExp(`(?<!async function )${name}\\(\\{`, "g")) || []).length;
  assert.equal(countCalls("maybeHandleReferralInvite"), 1);
  assert.equal(countCalls("maybeHandleSynergyRequest"), 1);
  assert.equal((SRC.match(/runExactUtilityCommandTerminal\(\{/g) || []).length, 1);
});

test("invariant: terminal block ส่ง unavailable ผ่าน reply + push fallback + alert ครบ", () => {
  const utilIdx = lane.indexOf("runExactUtilityCommandTerminal({");
  const block = lane.slice(utilIdx, utilIdx + 2500);
  assert.match(block, /sendUnavailable/);
  assert.match(block, /pushUnavailable/);
  assert.match(block, /onDeliveryFailure/);
  assert.match(block, /sendTelegramText/);
});

test("invariant: paywall แซงผลชิ้นแรกไม่ได้ — defer check อยู่ก่อน sendFreeQuotaExhaustedPaywall (เคส 18 ส.ค.)", () => {
  const fin = SRC.slice(SRC.indexOf("async function finalizeAcceptedImage"));
  const deferIdx = fin.indexOf("PAYWALL_DEFERRED_FIRST_REPORT_PENDING");
  const paywallIdx = fin.indexOf("sendFreeQuotaExhaustedPaywallViaGateway({");
  assert.ok(deferIdx > 0, "หา defer check ไม่เจอ");
  assert.ok(paywallIdx > 0);
  assert.ok(deferIdx < paywallIdx, "defer check ต้องมาก่อนยิง paywall");
  // ข้อความ defer ต้องไม่มีเรื่องเงิน/ราคา
  const block = fin.slice(deferIdx, deferIdx + 1200);
  assert.doesNotMatch(block.slice(0, 900), /บาท|จ่าย|ค่าครู|แพ็ก/);
});
