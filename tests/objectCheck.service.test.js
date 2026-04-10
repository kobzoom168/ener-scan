import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mergeGateLabels,
  normalizeObjectCheckOutput,
  permissiveAllowsSingleSupportedUpgrade,
  permissiveLabelFromParsedJson,
} from "../src/services/objectCheck.service.js";

const strongAmulet = {
  label: "single_supported",
  objectCount: 1,
  confidence: 0.9,
  supportedFamilyGuess: "thai_amulet",
};

test("normalizeObjectCheckOutput: tarot / oracle / playing card / trading card -> unsupported", () => {
  assert.equal(normalizeObjectCheckOutput("unsupported"), "unsupported");
  assert.equal(
    normalizeObjectCheckOutput("single_supported — tarot card visible"),
    "unsupported",
  );
  assert.equal(
    normalizeObjectCheckOutput("oracle card on table"),
    "unsupported",
  );
  assert.equal(
    normalizeObjectCheckOutput("playing card artwork"),
    "unsupported",
  );
  assert.equal(
    normalizeObjectCheckOutput("trading card holographic"),
    "unsupported",
  );
  assert.equal(
    normalizeObjectCheckOutput("ภาพไพ่ทาโรต์ nine of pentacles"),
    "unsupported",
  );
  assert.equal(
    normalizeObjectCheckOutput("this is a card not an amulet"),
    "unsupported",
  );
});

test("normalizeObjectCheckOutput: document / screenshot / slip -> unsupported", () => {
  assert.equal(
    normalizeObjectCheckOutput("screenshot of a bank app"),
    "unsupported",
  );
  assert.equal(normalizeObjectCheckOutput("เอกสาร a4"), "unsupported");
  assert.equal(
    normalizeObjectCheckOutput("bank slip transfer proof"),
    "unsupported",
  );
  assert.equal(
    normalizeObjectCheckOutput("payment slip photo"),
    "unsupported",
  );
});

test("normalizeObjectCheckOutput: blurry / unclear -> unclear", () => {
  assert.equal(normalizeObjectCheckOutput("unclear"), "unclear");
  assert.equal(normalizeObjectCheckOutput("too blurry"), "unclear");
});

test("normalizeObjectCheckOutput: blurry / weak signal must not be single_supported", () => {
  assert.notEqual(normalizeObjectCheckOutput("too blurry"), "single_supported");
  assert.notEqual(normalizeObjectCheckOutput("very blur image"), "single_supported");
  assert.notEqual(normalizeObjectCheckOutput("unclear object"), "single_supported");
});

test("normalizeObjectCheckOutput: inconclusive echo -> inconclusive", () => {
  assert.equal(
    normalizeObjectCheckOutput("inconclusive — cannot decide"),
    "inconclusive",
  );
});

test("normalizeObjectCheckOutput: clear amulet wording stays single_supported", () => {
  assert.equal(normalizeObjectCheckOutput("single_supported"), "single_supported");
});

test("permissiveLabelFromParsedJson: parse error / null -> inconclusive", () => {
  assert.equal(permissiveLabelFromParsedJson(null), "inconclusive");
  assert.equal(permissiveLabelFromParsedJson(undefined), "inconclusive");
});

test("permissiveLabelFromParsedJson: valid JSON uses label", () => {
  assert.equal(
    permissiveLabelFromParsedJson({ label: "unsupported" }),
    "unsupported",
  );
  assert.equal(
    permissiveLabelFromParsedJson({ label: "single_supported" }),
    "single_supported",
  );
});

test("permissiveAllowsSingleSupportedUpgrade: requires family + confidence + objectCount 1", () => {
  assert.equal(permissiveAllowsSingleSupportedUpgrade(strongAmulet), true);
  assert.equal(
    permissiveAllowsSingleSupportedUpgrade({
      ...strongAmulet,
      confidence: 0.5,
    }),
    false,
  );
  assert.equal(
    permissiveAllowsSingleSupportedUpgrade({
      ...strongAmulet,
      supportedFamilyGuess: "other_unknown",
    }),
    false,
  );
  assert.equal(
    permissiveAllowsSingleSupportedUpgrade({
      ...strongAmulet,
      objectCount: 2,
    }),
    false,
  );
  assert.equal(permissiveAllowsSingleSupportedUpgrade(null), false);
  assert.equal(
    permissiveAllowsSingleSupportedUpgrade({
      ...strongAmulet,
      confidence: 0.71,
    }),
    false,
  );
  assert.equal(
    permissiveAllowsSingleSupportedUpgrade({
      ...strongAmulet,
      confidence: 0.72,
    }),
    true,
  );
});

test("mergeGateLabels: unsupported + permissive single_supported without strong evidence -> inconclusive", () => {
  assert.equal(
    mergeGateLabels("unsupported", "single_supported", {
      objectCount: 1,
      confidence: 0.5,
      supportedFamilyGuess: "thai_amulet",
    }),
    "inconclusive",
  );
  assert.equal(
    mergeGateLabels("unsupported", "single_supported", {
      objectCount: 1,
      confidence: 0.95,
      supportedFamilyGuess: "other_unknown",
    }),
    "inconclusive",
  );
});

test("mergeGateLabels: unsupported + strong permissive evidence -> single_supported", () => {
  assert.equal(
    mergeGateLabels("unsupported", "single_supported", strongAmulet),
    "single_supported",
  );
});

test("mergeGateLabels: unclear + weak permissive -> unclear", () => {
  assert.equal(
    mergeGateLabels("unclear", "single_supported", {
      objectCount: 1,
      confidence: 0.5,
      supportedFamilyGuess: "thai_amulet",
    }),
    "unclear",
  );
});

test("mergeGateLabels: unclear + strong permissive -> single_supported", () => {
  assert.equal(
    mergeGateLabels("unclear", "single_supported", strongAmulet),
    "single_supported",
  );
});

test("mergeGateLabels: inconclusive + permissive single_supported needs strong evidence", () => {
  assert.equal(
    mergeGateLabels("inconclusive", "single_supported", null),
    "inconclusive",
  );
  assert.equal(
    mergeGateLabels("inconclusive", "single_supported", strongAmulet),
    "single_supported",
  );
});

test("mergeGateLabels: preserved inconclusive vs unsupported merges", () => {
  assert.equal(mergeGateLabels("inconclusive", "unsupported"), "inconclusive");
  assert.equal(mergeGateLabels("unsupported", "inconclusive"), "inconclusive");
  assert.equal(mergeGateLabels("unclear", "inconclusive"), "unclear");
});
