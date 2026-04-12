import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyObjectCategory } from "../src/services/scan.service.js";

test("classifyObjectCategory: OpenAI throws → อื่นๆ (not พระเครื่อง)", async () => {
  const label = await classifyObjectCategory("Zm9vYmFy", {
    invokeClassifier: async () => {
      throw new Error("openai down");
    },
  });
  assert.equal(label, "อื่นๆ");
});

test("classifyObjectCategory: empty imageBase64 → อื่นๆ", async () => {
  const label = await classifyObjectCategory("", {});
  assert.equal(label, "อื่นๆ");
  const label2 = await classifyObjectCategory("   ", {});
  assert.equal(label2, "อื่นๆ");
});

test("classifyObjectCategory: OpenAI returns พระเครื่อง → พระเครื่อง", async () => {
  const label = await classifyObjectCategory("Zm9vYmFy", {
    invokeClassifier: async () => ({ output_text: "พระเครื่อง" }),
  });
  assert.equal(label, "พระเครื่อง");
});

test("classifyObjectCategory: unrecognized GPT text → normalizer fallback พระเครื่อง", async () => {
  const label = await classifyObjectCategory("Zm9vYmFy", {
    invokeClassifier: async () => ({ output_text: "totally unknown label xyz" }),
  });
  assert.equal(label, "พระเครื่อง");
});
