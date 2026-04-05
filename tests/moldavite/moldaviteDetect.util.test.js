import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildGptCrystalSubtypeInferenceText,
  detectMoldaviteV1,
} from "../../src/moldavite/moldaviteDetect.util.js";

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
  assert.equal(r.reason, "tektite_with_color_signal");
  assert.ok(r.matchedSignals.includes("pipeline_object_category_tektite"));
  assert.ok(r.matchedSignals.includes("category_green_hint"));
});

test("detectMoldaviteV1: green + tektite in text (no moldavite name)", () => {
  const r = detectMoldaviteV1({
    objectFamily: "crystal",
    pipelineObjectCategory: "crystal",
    resultText: "พลังหลัก: พลังสมดุล (tektite specimen)",
    dominantColorNormalized: "green",
  });
  assert.equal(r.isMoldavite, true);
  assert.equal(r.reason, "tektite_with_color_signal");
  assert.ok(r.matchedSignals.includes("result_text_tektite"));
  assert.ok(r.matchedSignals.includes("dominant_color_green"));
});

test("detectMoldaviteV1: mixed + tektite in text as strong signal (production-style color slug)", () => {
  const r = detectMoldaviteV1({
    objectFamily: "crystal",
    pipelineObjectCategory: "crystal_scan",
    resultText: "พลังหลัก: ความมั่นใจ (specimen: tektite)",
    dominantColorNormalized: "mixed",
  });
  assert.equal(r.isMoldavite, true);
  assert.equal(r.reason, "tektite_with_color_signal");
  assert.ok(r.matchedSignals.includes("dominant_color_mixed"));
  assert.ok(r.matchedSignals.includes("result_text_tektite"));
});

test("detectMoldaviteV1: mixed dominant alone — no tektite, no literal, no category green", () => {
  const r = detectMoldaviteV1({
    objectFamily: "crystal",
    pipelineObjectCategory: "คริสตัล",
    resultText: "พลังหลัก: ความมั่นใจ\nบทสรุปยาว",
    dominantColorNormalized: "mixed",
  });
  assert.equal(r.isMoldavite, false);
  assert.equal(r.reason, "no_moldavite_signal");
});

test("detectMoldaviteV1: quartz + mixed without moldavite/tektite signals", () => {
  const r = detectMoldaviteV1({
    objectFamily: "crystal",
    pipelineObjectCategory: "quartz",
    resultText: "พลังหลัก: ควอตซ์ใส",
    dominantColorNormalized: "mixed",
  });
  assert.equal(r.isMoldavite, false);
  assert.equal(r.reason, "no_moldavite_signal");
});

test("detectMoldaviteV1: non-Moldavite crystal (quartz) stays false with green slug", () => {
  const r = detectMoldaviteV1({
    objectFamily: "crystal",
    pipelineObjectCategory: "quartz",
    resultText: "พลังหลัก: ควอตซ์",
    dominantColorNormalized: "green",
  });
  assert.equal(r.isMoldavite, false);
  assert.equal(r.reason, "no_moldavite_signal");
});

test("detectMoldaviteV1: tektite mention without green or mixed slug stays false", () => {
  const r = detectMoldaviteV1({
    objectFamily: "crystal",
    pipelineObjectCategory: "คริสตัล",
    resultText: "กล่าวถึง tektite ทั่วไป",
    dominantColorNormalized: null,
  });
  assert.equal(r.isMoldavite, false);
  assert.equal(r.reason, "no_moldavite_signal");
});

test("buildGptCrystalSubtypeInferenceText: joins vision category, main energy, overview", () => {
  const t = buildGptCrystalSubtypeInferenceText({
    pipelineObjectCategory: "คริสตัล โทนเขียว",
    mainEnergy: "พลังสมดุล",
    overview: "หินแก้วจากอุกกาบาต",
    fitReason: "เหมาะกับช่วงปรับจังหวะ",
  });
  assert.ok(t.includes("คริสตัล โทนเขียว"));
  assert.ok(t.includes("พลังสมดุล"));
  assert.ok(t.includes("หินแก้วจากอุกกาบาต"));
});

test("detectMoldaviteV1: crystal + GPT inference descriptive prose (no tektite token in full text)", () => {
  const r = detectMoldaviteV1({
    objectFamily: "crystal",
    pipelineObjectCategory: "คริสตัล",
    resultText: "พลังหลัก: ความมั่นใจ\nปิดท้าย: ขอบคุณที่ใช้บริการ",
    dominantColorNormalized: "mixed",
    gptSubtypeInferenceText:
      "คริสตัล\nหินแก้วจากอุกกาบาต โทนสีเขียวอมเขียว",
    pipelineObjectCategorySource: "deep_scan",
  });
  assert.equal(r.isMoldavite, true);
  assert.equal(r.reason, "gpt_subtype_inference_descriptive_prose");
  assert.ok(r.matchedSignals.includes("gpt_inference_descriptive_prose"));
  assert.ok(r.matchedSignals.includes("gpt_inference_category_source_deep_scan"));
});

test("detectMoldaviteV1: crystal + GPT strong subtype line (green tektite) in inference only", () => {
  const r = detectMoldaviteV1({
    objectFamily: "crystal",
    pipelineObjectCategory: "crystal_scan",
    resultText: "พลังหลัก: ความมั่นใจ",
    dominantColorNormalized: "green",
    gptSubtypeInferenceText: "เทคไทต์สีเขียว เนื้อแก้วใส",
  });
  assert.equal(r.isMoldavite, true);
  assert.equal(r.reason, "gpt_subtype_inference_strong_line");
  assert.ok(r.matchedSignals.includes("gpt_inference_strong_subtype_line"));
});

test("detectMoldaviteV1: non-crystal + Moldavite-like GPT inference => false", () => {
  const r = detectMoldaviteV1({
    objectFamily: "thai_amulet",
    pipelineObjectCategory: "พระเครื่อง",
    resultText: "x",
    dominantColorNormalized: "green",
    gptSubtypeInferenceText: "หินแก้วจากอุกกาบาต สีเขียว",
  });
  assert.equal(r.isMoldavite, false);
  assert.equal(r.reason, "not_crystal_family");
});

test("detectMoldaviteV1: descriptive Moldavite-like prose without color support => false", () => {
  const r = detectMoldaviteV1({
    objectFamily: "crystal",
    pipelineObjectCategory: "คริสตัล",
    resultText: "สั้น",
    dominantColorNormalized: null,
    gptSubtypeInferenceText: "หินแก้วจากอุกกาบาต ไม่ระบุโทนสี",
  });
  assert.equal(r.isMoldavite, false);
  assert.equal(r.reason, "no_moldavite_signal");
});

test("detectMoldaviteV1: weak hint only in inference (no color, no slug) => false", () => {
  const r = detectMoldaviteV1({
    objectFamily: "crystal",
    pipelineObjectCategory: "คริสตัล",
    resultText: "ยาว",
    dominantColorNormalized: null,
    gptSubtypeInferenceText: "คริสตัลทั่วไป",
  });
  assert.equal(r.isMoldavite, false);
  assert.equal(r.reason, "no_moldavite_signal");
});
