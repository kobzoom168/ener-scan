import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRadarOgImagePng,
  buildRadarStandaloneSvg,
} from "../src/utils/reports/radarOgImage.util.js";

test("buildRadarStandaloneSvg returns SVG with polygon and labels", () => {
  const svg = buildRadarStandaloneSvg({
    axisOrder: ["work", "money", "relationship"],
    axisLabels: { work: "งาน", money: "การเงิน", relationship: "ความสัมพันธ์" },
    axisScores: { work: 70, money: 55, relationship: 80 },
    colors: {
      bg: "#0a1a0f",
      ringOuterFill: "rgba(34,197,94,0.06)",
      ringOuterStroke: "rgba(74,222,128,0.45)",
      ringMid: "rgba(74,222,128,0.2)",
      ringInner: "rgba(74,222,128,0.12)",
      spoke: "rgba(74,222,128,0.18)",
      polyFill: "rgba(34,197,94,0.28)",
      polyStroke: "#22c55e",
      label: "#4ade80",
      peakFill: "#4ade80",
    },
  });
  assert.ok(svg.includes("<svg"));
  assert.ok(svg.includes("polygon"));
  assert.ok(svg.includes("งาน"));
});

test("buildRadarOgImagePng: crystal_bracelet produces PNG buffer", async () => {
  const buf = await buildRadarOgImagePng("crystal_bracelet", {
    crystalBraceletV1: {
      axes: {
        protection: { score: 72 },
        charm: { score: 81 },
        aura: { score: 60 },
        opportunity: { score: 55 },
        work: { score: 48 },
        grounding: { score: 63 },
        third_eye: { score: 58 },
      },
    },
  });
  assert.ok(Buffer.isBuffer(buf));
  assert.ok(buf && buf.length > 500);
  assert.equal(buf[0], 0x89);
  assert.equal(buf[1], 0x50);
});

test("buildRadarOgImagePng: sacred_amulet produces PNG", async () => {
  const buf = await buildRadarOgImagePng("sacred_amulet", {
    amuletV1: {
      powerCategories: {
        protection: { score: 70 },
        metta: { score: 60 },
        baramee: { score: 50 },
        luck: { score: 40 },
        fortune_anchor: { score: 55 },
        specialty: { score: 45 },
      },
    },
  });
  assert.ok(buf && buf.length > 500);
});

test("buildRadarOgImagePng: moldavite uses lifeAreas when power.object absent", async () => {
  const buf = await buildRadarOgImagePng("moldavite", {
    moldaviteV1: {
      lifeAreas: {
        work: { score: 77 },
        money: { score: 66 },
        relationship: { score: 88 },
      },
    },
  });
  assert.ok(buf && buf.length > 500);
});

test("buildRadarOgImagePng: unsupported lane returns null", async () => {
  const buf = await buildRadarOgImagePng("generic_crystal", {});
  assert.equal(buf, null);
});
