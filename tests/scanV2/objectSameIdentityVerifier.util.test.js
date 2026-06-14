import test from "node:test";
import assert from "node:assert/strict";
import {
  parseSameObjectVerdict,
  isSameObjectAccepted,
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
