import test from "node:test";
import assert from "node:assert/strict";
import { extractBirthdateCandidate } from "../src/utils/extractBirthdateCandidate.util.js";

test("extractBirthdateCandidate: mixed text with slash format", () => {
  const r = extractBirthdateCandidate("เกิด 14/10/2519 ครับ");
  assert.equal(r.candidate, "14/10/2519");
  assert.equal(r.ambiguous, false);
});

test("extractBirthdateCandidate: mixed text with dash format", () => {
  const r = extractBirthdateCandidate("วันเกิดผม 14-10-1976");
  assert.equal(r.candidate, "14-10-1976");
  assert.equal(r.ambiguous, false);
});

test("extractBirthdateCandidate: compact 8 digits", () => {
  const r = extractBirthdateCandidate("ผมเกิด 14102519");
  assert.equal(r.candidate, "14102519");
  assert.equal(r.ambiguous, false);
});

test("extractBirthdateCandidate: spaced date", () => {
  const r = extractBirthdateCandidate("ใช้วันเกิด 14 10 2519 นะ");
  assert.equal(r.candidate, "14 10 2519");
  assert.equal(r.ambiguous, false);
});

test("extractBirthdateCandidate: multiple candidates are ambiguous", () => {
  const r = extractBirthdateCandidate(
    "ของผม 14/10/2519 ของแฟน 12/03/2522",
  );
  assert.equal(r.candidate, null);
  assert.equal(r.ambiguous, true);
  assert.equal(r.candidates.length, 2);
});

