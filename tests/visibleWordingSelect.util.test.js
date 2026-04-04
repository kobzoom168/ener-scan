import { test } from "node:test";
import assert from "node:assert/strict";
import {
  inferSemanticKeyFromThaiText,
  isUsableVisibleSurface,
  selectVisibleSurfaceFromTemplates,
  semanticKeyFromTemplateRow,
} from "../src/utils/visibleWordingSelect.util.js";

const baseRow = (over) => ({
  id: over.id ?? 1,
  object_family: "crystal",
  copy_type: over.copy_type,
  tone: "hard",
  text_th: over.text_th,
  weight: over.weight ?? 10,
  is_active: true,
  presentation_angle: over.presentation_angle ?? null,
  cluster_tag: over.cluster_tag ?? null,
  fallback_level: over.fallback_level ?? 0,
  visible_tone: over.visible_tone ?? "plain_th",
});

test("selectVisibleSurfaceFromTemplates: angle-specific beats generic fallback_level", () => {
  const rows = [
    baseRow({
      id: 1,
      copy_type: "headline",
      text_th: "generic",
      presentation_angle: null,
      fallback_level: 10,
    }),
    baseRow({
      id: 2,
      copy_type: "headline",
      text_th: "angle shield",
      presentation_angle: "shield",
      cluster_tag: "sem:barrier",
    }),
    baseRow({
      id: 3,
      copy_type: "fit_line",
      text_th: "fit shield",
      presentation_angle: "shield",
      cluster_tag: "sem:calm",
    }),
    baseRow({
      id: 4,
      copy_type: "bullet",
      text_th: "b1",
      presentation_angle: "shield",
      cluster_tag: "sem:barrier",
    }),
    baseRow({
      id: 5,
      copy_type: "bullet",
      text_th: "b2",
      presentation_angle: "shield",
      cluster_tag: "sem:neutral",
    }),
  ];
  const v = selectVisibleSurfaceFromTemplates(rows, {
    preferredFamily: "crystal",
    presentationAngle: "shield",
    visibleTone: "plain_th",
  });
  assert.equal(v.headline, "angle shield");
  assert.ok(isUsableVisibleSurface(v));
});

test("selectVisibleSurfaceFromTemplates: anti-repeat prefers distinct cluster for bullets", () => {
  const rows = [
    baseRow({
      id: 1,
      copy_type: "headline",
      text_th: "h",
      presentation_angle: "shield",
      cluster_tag: "sem:barrier",
    }),
    baseRow({
      id: 2,
      copy_type: "fit_line",
      text_th: "f",
      presentation_angle: "shield",
      cluster_tag: "sem:calm",
    }),
    baseRow({
      id: 3,
      copy_type: "bullet",
      text_th: "same cluster",
      presentation_angle: "shield",
      cluster_tag: "sem:x",
    }),
    baseRow({
      id: 4,
      copy_type: "bullet",
      text_th: "other cluster",
      presentation_angle: "shield",
      cluster_tag: "sem:y",
    }),
    baseRow({
      id: 5,
      copy_type: "bullet",
      text_th: "third",
      presentation_angle: "shield",
      cluster_tag: "sem:x",
    }),
  ];
  const v = selectVisibleSurfaceFromTemplates(rows, {
    preferredFamily: "crystal",
    presentationAngle: "shield",
    visibleTone: "plain_th",
  });
  assert.equal(v.bullets.length, 2);
  assert.ok(v.bullets.includes("same cluster"));
  assert.ok(v.bullets.includes("other cluster"));
});

test("semanticKeyFromTemplateRow prefers cluster_tag over text inference", () => {
  assert.equal(
    semanticKeyFromTemplateRow(
      baseRow({
        copy_type: "headline",
        text_th: "เด่นเรื่องบารมี",
        cluster_tag: "custom:tag",
      }),
    ),
    "custom:tag",
  );
});

test("inferSemanticKeyFromThaiText maps protection-ish phrases", () => {
  assert.match(inferSemanticKeyFromThaiText("ช่วยกันแรงปะทะ"), /protection/);
});
