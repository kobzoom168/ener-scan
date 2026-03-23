import test from "node:test";
import assert from "node:assert/strict";
import {
  generatePersonaReply,
  clearPersonaMemory,
} from "../src/utils/replyPersona.util.js";

test("generatePersonaReply returns 1–3 Thai lines for waiting_birthdate_initial", async () => {
  clearPersonaMemory();
  const uid = "U_test_pattern_1";
  const lines = await generatePersonaReply(uid, "waiting_birthdate_initial");
  assert.ok(lines.length >= 1 && lines.length <= 3, `got ${lines.length} lines`);
  for (const line of lines) {
    assert.ok(String(line || "").trim().length > 0, "non-empty line");
  }
});

test("persona varies across calls (same user+type)", async () => {
  clearPersonaMemory();
  const uid = "U_test_pattern_2";
  const sigs = new Set();
  for (let i = 0; i < 24; i += 1) {
    const lines = await generatePersonaReply(uid, "before_scan");
    sigs.add(lines.join("|"));
  }
  assert.ok(sigs.size > 1, "should vary across calls");
});
