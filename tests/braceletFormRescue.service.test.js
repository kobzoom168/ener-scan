import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyBraceletFormWithGemini,
} from "../src/integrations/gemini/braceletFormRescue.service.js";

const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * @param {string} mode
 */
function makeMockGenAi(mode) {
  return class MockGenAi {
    constructor() {
      this._mode = mode;
    }
    getGenerativeModel() {
      const m = this._mode;
      return {
        generateContent: async () => {
          if (m === "hang") {
            return new Promise(() => {});
          }
          if (m === "bad_json") {
            return {
              response: {
                text: () => "not valid json {{{",
              },
            };
          }
          const raw =
            process.env._TEST_BRACELET_JSON ||
            '{"formFactor":"bracelet","confidence":0.88,"reasoningShort":"bead loop on wrist"}';
          return {
            response: {
              text: () => raw,
            },
          };
        },
      };
    }
  };
}

test("classifyBraceletFormWithGemini: disabled when GEMINI_BRACELET_RESCUE_ENABLED is false", async () => {
  process.env.GEMINI_BRACELET_RESCUE_ENABLED = "false";
  const r = await classifyBraceletFormWithGemini({
    imageBuffer: tinyPng,
    scanResultIdPrefix: "pref0001",
  });
  assert.equal(r.mode, "disabled");
  process.env.GEMINI_BRACELET_RESCUE_ENABLED = "true";
});

test("classifyBraceletFormWithGemini: ok + bracelet when Gemini returns valid JSON", async () => {
  process.env.GEMINI_BRACELET_RESCUE_ENABLED = "true";
  if (!process.env.GEMINI_API_KEY) {
    process.env.GEMINI_API_KEY = "test-key-placeholder";
  }
  process.env._TEST_BRACELET_JSON = JSON.stringify({
    formFactor: "bracelet",
    confidence: 0.88,
    reasoningShort: "beads in loop",
  });
  const Mock = makeMockGenAi("json_ok");
  const r = await classifyBraceletFormWithGemini(
    {
      imageBuffer: tinyPng,
      scanResultIdPrefix: "pref0002",
    },
    { GoogleGenerativeAI: Mock },
  );
  assert.equal(r.mode, "ok");
  assert.equal(r.formFactor, "bracelet");
  assert.ok(r.confidence != null && r.confidence >= 0.85);
  assert.ok(String(r.reasoningShort || "").length > 0);
  assert.ok(typeof r.durationMs === "number");
  assert.ok(String(r.modelId || "").length > 0);
});

test("classifyBraceletFormWithGemini: error when JSON parse fails", async () => {
  const Mock = makeMockGenAi("bad_json");
  const r = await classifyBraceletFormWithGemini(
    {
      imageBuffer: tinyPng,
      scanResultIdPrefix: "pref0003",
    },
    { GoogleGenerativeAI: Mock },
  );
  assert.equal(r.mode, "error");
  assert.equal(r.reason, "parse_fail");
});

test("classifyBraceletFormWithGemini: timeout path", async () => {
  process.env.GEMINI_BRACELET_RESCUE_TIMEOUT_MS = "80";
  const Mock = makeMockGenAi("hang");
  const r = await classifyBraceletFormWithGemini(
    {
      imageBuffer: tinyPng,
      scanResultIdPrefix: "pref0004",
    },
    { GoogleGenerativeAI: Mock },
  );
  assert.equal(r.mode, "timeout");
  assert.equal(r.reason, "timeout");
  process.env.GEMINI_BRACELET_RESCUE_TIMEOUT_MS = "14000";
});
