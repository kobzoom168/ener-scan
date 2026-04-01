import { test } from "node:test";
import assert from "node:assert/strict";
import {
  VISUAL_SIGNAL_SOURCE,
  resolveConditionClassPipelineSource,
  resolveDominantColorPipelineSource,
} from "../src/utils/reports/reportPipelineVisualSignals.util.js";

test("resolveDominantColorPipelineSource: empty -> none", () => {
  const r = resolveDominantColorPipelineSource("");
  assert.equal(r.source, VISUAL_SIGNAL_SOURCE.NONE);
  assert.equal(r.normalized, undefined);
});

test("resolveDominantColorPipelineSource: explicit slug -> pipeline_opts + lowercased", () => {
  const r = resolveDominantColorPipelineSource("Gold");
  assert.equal(r.source, VISUAL_SIGNAL_SOURCE.PIPELINE_OPTS);
  assert.equal(r.normalized, "gold");
});

test("resolveDominantColorPipelineSource: vision_v1 hint", () => {
  const r = resolveDominantColorPipelineSource("Red", "vision_v1");
  assert.equal(r.source, VISUAL_SIGNAL_SOURCE.VISION_V1);
  assert.equal(r.normalized, "red");
});

test("resolveConditionClassPipelineSource: empty -> none", () => {
  const r = resolveConditionClassPipelineSource(null);
  assert.equal(r.source, VISUAL_SIGNAL_SOURCE.NONE);
  assert.equal(r.normalized, undefined);
});

test("resolveConditionClassPipelineSource: explicit -> pipeline_opts", () => {
  const r = resolveConditionClassPipelineSource("good");
  assert.equal(r.source, VISUAL_SIGNAL_SOURCE.PIPELINE_OPTS);
  assert.equal(r.normalized, "good");
});
