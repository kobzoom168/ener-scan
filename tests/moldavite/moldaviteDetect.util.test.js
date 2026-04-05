import { test } from "node:test";
import assert from "node:assert/strict";
import { detectMoldaviteV1 } from "../../src/moldavite/moldaviteDetect.util.js";

test("detectMoldaviteV1: non-crystal family rejects", () => {
  const r = detectMoldaviteV1({
    objectFamily: "thai_amulet",
    pipelineObjectCategory: "moldavite",
    resultText: "moldavite crystal",
  });
  assert.equal(r.isMoldavite, false);
  assert.equal(r.reason, "not_crystal_family");
});

test("detectMoldaviteV1: crystal + English keyword in result text", () => {
  const r = detectMoldaviteV1({
    objectFamily: "crystal",
    pipelineObjectCategory: null,
    resultText: "พลังหลัก: Moldavite tektite",
  });
  assert.equal(r.isMoldavite, true);
  assert.equal(r.reason, "literal_moldavite_label");
  assert.ok(r.matchedSignals.includes("result_text_literal"));
});

test("detectMoldaviteV1: crystal + Thai synonym หินมอลดา in text", () => {
  const r = detectMoldaviteV1({
    objectFamily: "crystal",
    pipelineObjectCategory: null,
    resultText: "วัตถุนี้เป็นหินมอลดา เน้นพลังสมดุล",
  });
  assert.equal(r.isMoldavite, true);
  assert.equal(r.reason, "literal_moldavite_label");
  assert.ok(r.matchedSignals.includes("result_text_literal"));
});

test("detectMoldaviteV1: crystal + keyword in category", () => {
  const r = detectMoldaviteV1({
    objectFamily: "crystal",
    pipelineObjectCategory: "คริสตัล มอลดาไวต์",
    resultText: "overview line",
  });
  assert.equal(r.isMoldavite, true);
  assert.equal(r.reason, "literal_moldavite_label");
  assert.ok(r.matchedSignals.includes("pipeline_object_category_literal"));
});

test("detectMoldaviteV1: tektite + green in category, confidence prose only in text", () => {
  const r = detectMoldaviteV1({
    objectFamily: "crystal",
    pipelineObjectCategory: "คริสตัลเทคไทต์สีเขียว",
    resultText:
      "พลังหลัก: ความมั่นใจ\nเด่นเรื่องความมั่นใจและน้ำหนักในตัว",
    dominantColorNormalized: null,
  });
  assert.equal(r.isMoldavite, true);
  assert.equal(r.reason, "tektite_with_green_signal");
  assert.ok(r.matchedSignals.includes("pipeline_object_category_tektite"));
  assert.ok(r.matchedSignals.includes("category_green_hint"));
});

test("detectMoldaviteV1: tektite in text + vision green slug, no moldavite name", () => {
  const r = detectMoldaviteV1({
    objectFamily: "crystal",
    pipelineObjectCategory: "crystal",
    resultText: "พลังหลัก: พลังสมดุล (tektite specimen)",
    dominantColorNormalized: "green",
  });
  assert.equal(r.isMoldavite, true);
  assert.equal(r.reason, "tektite_with_green_signal");
  assert.ok(r.matchedSignals.includes("result_text_tektite"));
  assert.ok(r.matchedSignals.includes("dominant_color_green"));
});

test("detectMoldaviteV1: non-Moldavite crystal (quartz) stays false", () => {
  const r = detectMoldaviteV1({
    objectFamily: "crystal",
    pipelineObjectCategory: "quartz",
    resultText: "พลังหลัก: ควอตซ์",
    dominantColorNormalized: "green",
  });
  assert.equal(r.isMoldavite, false);
  assert.equal(r.reason, "no_moldavite_signal");
});

test("detectMoldaviteV1: tektite mention without green signal stays false", () => {
  const r = detectMoldaviteV1({
    objectFamily: "crystal",
    pipelineObjectCategory: "คริสตัล",
    resultText: "กล่าวถึง tektite ทั่วไป",
    dominantColorNormalized: null,
  });
  assert.equal(r.isMoldavite, false);
  assert.equal(r.reason, "no_moldavite_signal");
});
