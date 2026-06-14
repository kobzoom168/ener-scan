import test from "node:test";
import assert from "node:assert/strict";
import {
  parseSameObjectVerdict,
  isSameObjectAccepted,
  mergeVerifierCandidates,
} from "../../src/services/scanV2/objectSameIdentityVerifier.util.js";

test("parseSameObjectVerdict: clean JSON same=true", () => {
  const v = parseSameObjectVerdict('{"same": true, "confidence": 0.93, "reason": "same casting"}');
  assert.equal(v.same, true);
  assert.equal(v.confidence, 0.93);
  assert.equal(v.reason, "same casting");
});

test("parseSameObjectVerdict: extracts JSON from surrounding prose", () => {
  const v = parseSameObjectVerdict('Here is my answer:\n{"same": false, "confidence": 0.2} thanks');
  assert.equal(v.same, false);
  assert.equal(v.confidence, 0.2);
});

test("parseSameObjectVerdict: clamps confidence to 0..1", () => {
  assert.equal(parseSameObjectVerdict('{"same": true, "confidence": 5}').confidence, 1);
  assert.equal(parseSameObjectVerdict('{"same": true, "confidence": -3}').confidence, 0);
});

test("parseSameObjectVerdict: string boolean tolerated", () => {
  const v = parseSameObjectVerdict('{"same": "true", "confidence": 0.8}');
  assert.equal(v.same, true);
});

test("parseSameObjectVerdict: missing confidence defaults by verdict", () => {
  assert.equal(parseSameObjectVerdict('{"same": true}').confidence, 0.5);
  assert.equal(parseSameObjectVerdict('{"same": false}').confidence, 0);
});

test("parseSameObjectVerdict: returns null on garbage / non-object", () => {
  assert.equal(parseSameObjectVerdict("no json here"), null);
  assert.equal(parseSameObjectVerdict(""), null);
  assert.equal(parseSameObjectVerdict("{bad json"), null);
  assert.equal(parseSameObjectVerdict("[1,2,3]"), null);
  assert.equal(parseSameObjectVerdict(null), null);
});

test("isSameObjectAccepted: requires same=true AND confidence >= min", () => {
  assert.equal(isSameObjectAccepted({ same: true, confidence: 0.85 }, 0.8), true);
  assert.equal(isSameObjectAccepted({ same: true, confidence: 0.8 }, 0.8), true);
  assert.equal(isSameObjectAccepted({ same: true, confidence: 0.79 }, 0.8), false);
  assert.equal(isSameObjectAccepted({ same: false, confidence: 0.99 }, 0.8), false);
  assert.equal(isSameObjectAccepted(null, 0.8), false);
  assert.equal(isSameObjectAccepted({ same: true }, 0.8), false);
});

test("mergeVerifierCandidates: embedding first, recency appended, deduped, capped", () => {
  const emb = [
    { id: "a", similarity: 0.9 },
    { id: "b", similarity: 0.8 },
  ];
  const recent = [{ id: "b" }, { id: "c" }, { id: "d" }];
  const out = mergeVerifierCandidates(emb, recent, 3);
  assert.deepEqual(out.map((c) => c.id), ["a", "b", "c"]);
  assert.equal(out[0].recallSource, "embedding");
  assert.equal(out[2].recallSource, "recent");
  assert.equal(out[2].similarity, 0); // recent-only has no similarity
});

test("mergeVerifierCandidates: handles empty embedding (recency-only)", () => {
  const out = mergeVerifierCandidates([], [{ id: "x" }, { id: "y" }], 5);
  assert.deepEqual(out.map((c) => c.id), ["x", "y"]);
  assert.equal(out[0].recallSource, "recent");
});

test("mergeVerifierCandidates: drops blank ids and dedups within a source", () => {
  const out = mergeVerifierCandidates([{ id: "a" }, { id: "" }, { id: "a" }], [], 5);
  assert.deepEqual(out.map((c) => c.id), ["a"]);
});
