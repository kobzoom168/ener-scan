import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveMoldaviteLikelyFromGeminiJson } from "../../../src/integrations/gemini/crystalSubtypeClassifier.service.js";

test("deriveMoldaviteLikelyFromGeminiJson: crystalSubtype moldavite", () => {
  assert.equal(
    deriveMoldaviteLikelyFromGeminiJson({ crystalSubtype: "moldavite" }),
    true,
  );
});

test("deriveMoldaviteLikelyFromGeminiJson: candidates", () => {
  assert.equal(
    deriveMoldaviteLikelyFromGeminiJson({
      crystalSubtype: "unknown",
      subtypeCandidates: ["quartz", "green_tektite"],
    }),
    true,
  );
});

test("deriveMoldaviteLikelyFromGeminiJson: quartz only", () => {
  assert.equal(
    deriveMoldaviteLikelyFromGeminiJson({
      crystalSubtype: "quartz",
      subtypeCandidates: ["quartz"],
    }),
    false,
  );
});
