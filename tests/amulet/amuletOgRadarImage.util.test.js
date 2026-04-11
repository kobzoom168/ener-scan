import test from "node:test";
import assert from "node:assert/strict";
import {
  extractAmuletObjectScores0100,
  buildAmuletOgRadarSvgString,
  renderAmuletOgRadarPngBuffer,
} from "../../src/utils/reports/amuletOgRadarImage.util.js";

const samplePayload = {
  amuletV1: {
    powerCategories: {
      protection: { score: 88 },
      metta: { score: 70 },
      baramee: { score: 65 },
      luck: { score: 60 },
      fortune_anchor: { score: 55 },
      specialty: { score: 50 },
    },
  },
};

test("extractAmuletObjectScores0100 reads six axes", () => {
  const s = extractAmuletObjectScores0100(samplePayload);
  assert.equal(s?.protection, 88);
  assert.equal(s?.metta, 70);
  assert.equal(s?.specialty, 50);
});

test("buildAmuletOgRadarSvgString contains radar polygon", () => {
  const s = extractAmuletObjectScores0100(samplePayload);
  assert.ok(s);
  const svg = buildAmuletOgRadarSvgString(s);
  assert.ok(svg.includes("<svg"));
  assert.ok(svg.includes("polygon"));
  assert.ok(svg.includes("Ener Scan"));
});

test("renderAmuletOgRadarPngBuffer returns PNG bytes", async () => {
  const buf = await renderAmuletOgRadarPngBuffer(samplePayload);
  assert.ok(Buffer.isBuffer(buf));
  assert.ok(buf.length > 500);
  assert.equal(buf[0], 0x89);
  assert.equal(buf[1], 0x50);
});
