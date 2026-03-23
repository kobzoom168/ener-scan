import test from "node:test";
import assert from "node:assert/strict";
import { validateHybridPersonaOutput } from "../src/chat/hybridPersona.validator.js";

test("hybrid validator accepts valid strict json", () => {
  const raw = JSON.stringify({
    messages: ["ตอนนี้ขอวันเกิดก่อนนะ", "14/09/1995 หรือ 14/09/2538"],
  });
  const out = validateHybridPersonaOutput(raw, {
    requiredPhrases: ["14/09/1995", "14/09/2538"],
    forbiddenPhrases: ["payment"],
    maxMessages: 3,
    maxCharsPerMessage: 90,
  });
  assert.equal(out.ok, true);
  if (out.ok) assert.equal(out.messages.length, 2);
});

test("hybrid validator rejects forbidden phrase", () => {
  const raw = JSON.stringify({
    messages: ["ตอนนี้ขอวันเกิดก่อนนะ", "พิมพ์ payment ได้เลย"],
  });
  const out = validateHybridPersonaOutput(raw, {
    forbiddenPhrases: ["payment"],
    maxMessages: 3,
    maxCharsPerMessage: 90,
  });
  assert.equal(out.ok, false);
});

test("hybrid validator rejects missing required phrase", () => {
  const raw = JSON.stringify({
    messages: ["ตอนนี้ขอวันเกิดก่อนนะ", "พิมพ์มาได้เลย"],
  });
  const out = validateHybridPersonaOutput(raw, {
    requiredPhrases: ["14/09/1995", "14/09/2538"],
    maxMessages: 3,
    maxCharsPerMessage: 90,
  });
  assert.equal(out.ok, false);
});

