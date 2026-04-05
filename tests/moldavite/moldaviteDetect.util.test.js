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

test("detectMoldaviteV1: crystal + keyword in result text", () => {
  const r = detectMoldaviteV1({
    objectFamily: "crystal",
    pipelineObjectCategory: null,
    resultText: "พลังหลัก: Moldavite tektite",
  });
  assert.equal(r.isMoldavite, true);
  assert.equal(r.reason, "keyword_match");
  assert.ok(r.matchedSignals.includes("result_text"));
});

test("detectMoldaviteV1: crystal + keyword in category", () => {
  const r = detectMoldaviteV1({
    objectFamily: "crystal",
    pipelineObjectCategory: "คริสตัล มอลดาไวต์",
    resultText: "overview line",
  });
  assert.equal(r.isMoldavite, true);
  assert.ok(r.matchedSignals.includes("pipeline_object_category"));
});

test("detectMoldaviteV1: crystal without moldavite keyword", () => {
  const r = detectMoldaviteV1({
    objectFamily: "crystal",
    pipelineObjectCategory: "quartz",
    resultText: "พลังหลัก: ควอตซ์",
  });
  assert.equal(r.isMoldavite, false);
  assert.equal(r.reason, "no_moldavite_keyword");
});
