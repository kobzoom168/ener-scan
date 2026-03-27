import { test } from "node:test";
import assert from "node:assert/strict";
import { trimHistoryForGemini } from "../src/utils/conversationHistory.util.js";

test("trimHistoryForGemini: empty → []", () => {
  assert.deepEqual(trimHistoryForGemini([], 2000), []);
  assert.deepEqual(trimHistoryForGemini(null, 2000), []);
});

test("trimHistoryForGemini: drops empty text", () => {
  const r = trimHistoryForGemini(
    [
      { role: "user", text: "  " },
      { role: "bot", text: "hi" },
    ],
    2000,
  );
  assert.equal(r.length, 1);
  assert.equal(r[0].role, "bot");
  assert.equal(r[0].text, "hi");
});

test("trimHistoryForGemini: coerces role to user/bot", () => {
  const r = trimHistoryForGemini([{ role: "other", text: "x" }], 2000);
  assert.equal(r[0].role, "user");
});

test("trimHistoryForGemini: drops oldest until under cap", () => {
  const long = "a".repeat(500);
  const items = [
    { role: "user", text: long },
    { role: "bot", text: long },
    { role: "user", text: "last" },
  ];
  const r = trimHistoryForGemini(items, 200);
  assert.ok(r.length >= 1);
  assert.equal(r[r.length - 1].text, "last");
  let total = 0;
  for (const m of r) total += m.role.length + m.text.length + 4;
  assert.ok(total <= 200);
});
