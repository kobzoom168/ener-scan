import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isTrueUnsupportedEvidence,
  resolveObjectGateReplyRouting,
} from "../src/utils/objectGateReplyResolve.util.js";
import { mergeGateLabels } from "../src/services/objectCheck.service.js";

test("isTrueUnsupportedEvidence: both passes agree unsupported -> hard reject", () => {
  assert.equal(
    isTrueUnsupportedEvidence({
      firstPass: "unsupported",
      secondPass: "unsupported",
      structured: { objectCount: 0, supportedFamilyGuess: "other_unknown" },
      secondPassDisabled: false,
    }),
    true,
  );
  assert.equal(
    isTrueUnsupportedEvidence({
      firstPass: "unsupported",
      secondPass: "unsupported",
      structured: { objectCount: 1, supportedFamilyGuess: "other_unknown" },
      secondPassDisabled: false,
    }),
    true,
  );
});

test("isTrueUnsupportedEvidence: both unsupported without structured row still hard reject", () => {
  assert.equal(
    isTrueUnsupportedEvidence({
      firstPass: "unsupported",
      secondPass: "unsupported",
      structured: null,
      secondPassDisabled: false,
    }),
    true,
  );
});

test("isTrueUnsupportedEvidence: second pass disabled -> false", () => {
  assert.equal(
    isTrueUnsupportedEvidence({
      firstPass: "unsupported",
      secondPass: "unsupported",
      structured: { objectCount: 0, supportedFamilyGuess: "other_unknown" },
      secondPassDisabled: true,
    }),
    false,
  );
});

test("resolveObjectGateReplyRouting maps gate strings", () => {
  assert.equal(
    resolveObjectGateReplyRouting({ result: "single_supported" }).kind,
    "allow_scan",
  );
  assert.equal(
    resolveObjectGateReplyRouting({ result: "inconclusive" }).kind,
    "object_inconclusive",
  );
  assert.equal(
    resolveObjectGateReplyRouting({ result: "unclear" }).kind,
    "image_retake_required",
  );
  assert.equal(
    resolveObjectGateReplyRouting({ result: "unsupported" }).kind,
    "unsupported_object",
  );
});

test("mergeGateLabels: inconclusive vs unsupported", () => {
  assert.equal(mergeGateLabels("inconclusive", "unsupported"), "inconclusive");
  assert.equal(mergeGateLabels("unsupported", "inconclusive"), "inconclusive");
  assert.equal(mergeGateLabels("unclear", "inconclusive"), "unclear");
});
