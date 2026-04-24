import test from "node:test";
import assert from "node:assert/strict";
import {
  comparePossibleSameObjectWithAi,
  normalizeObjectPairCompareResult,
  toPossibleDuplicateLevel,
} from "../src/services/imageDedup/objectPairCompareAgent.service.js";

test("normalizeObjectPairCompareResult: clamps and sanitizes", () => {
  const out = normalizeObjectPairCompareResult({
    same_object: "yes",
    confidence: 1.4,
    reason_th: "ทดสอบ",
    matching_signals: ["A", "", "B"],
    different_signals: ["X"],
  });
  assert.equal(out.same_object, "yes");
  assert.equal(out.confidence, 1);
  assert.deepEqual(out.matching_signals, ["A", "B"]);
  assert.deepEqual(out.different_signals, ["X"]);
});

test("toPossibleDuplicateLevel: maps confidence bands", () => {
  assert.equal(
    toPossibleDuplicateLevel({ same_object: "yes", confidence: 0.91 }),
    "possible_duplicate_high",
  );
  assert.equal(
    toPossibleDuplicateLevel({ same_object: "yes", confidence: 0.8 }),
    "possible_duplicate_medium",
  );
  assert.equal(toPossibleDuplicateLevel({ same_object: "yes", confidence: 0.6 }), null);
  assert.equal(toPossibleDuplicateLevel({ same_object: "unsure", confidence: 0.99 }), null);
});

test("comparePossibleSameObjectWithAi: parses JSON from model output", async () => {
  const fake = async () => ({
    output_text:
      '```json\n{"same_object":"yes","confidence":0.92,"reason_th":"รูปใกล้กัน","matching_signals":["กรอบ"],"different_signals":["มุม"]}\n```',
  });
  const out = await comparePossibleSameObjectWithAi({
    imageABase64: "aaa",
    imageBBase64: "bbb",
    objectFamily: "sacred_amulet",
    createResponses: fake,
  });
  assert.equal(out.same_object, "yes");
  assert.equal(out.confidence, 0.92);
  assert.equal(out.reason_th, "รูปใกล้กัน");
});
