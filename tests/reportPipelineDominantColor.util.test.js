import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import {
  classifyRgbaBufferToDominantSlugV1,
  mapRgbPixelToDominantSlugV1,
  rgbToHsv,
  extractDominantColorSlugFromBuffer,
} from "../src/utils/reports/reportPipelineDominantColor.util.js";

test("rgbToHsv: red channel", () => {
  const { h, s, v } = rgbToHsv(255, 0, 0);
  assert.ok(h < 20 || h > 340);
  assert.ok(s > 0.9);
  assert.ok(v > 0.95);
});

test("mapRgbPixelToDominantSlugV1: near-black", () => {
  assert.equal(mapRgbPixelToDominantSlugV1(10, 10, 10), "black");
});

test("mapRgbPixelToDominantSlugV1: near-white", () => {
  assert.equal(mapRgbPixelToDominantSlugV1(250, 250, 248), "white");
});

test("mapRgbPixelToDominantSlugV1: saturated red", () => {
  assert.equal(mapRgbPixelToDominantSlugV1(240, 20, 20), "red");
});

test("classifyRgbaBufferToDominantSlugV1: solid red field", () => {
  const w = 16;
  const h = 16;
  const buf = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i += 1) {
    const o = i * 4;
    buf[o] = 230;
    buf[o + 1] = 25;
    buf[o + 2] = 25;
    buf[o + 3] = 255;
  }
  const r = classifyRgbaBufferToDominantSlugV1(
    new Uint8Array(buf),
    w,
    h,
    4,
  );
  assert.equal(r.slug, "red");
  assert.ok(r.confidence >= 0.34);
});

test("classifyRgbaBufferToDominantSlugV1: solid black field", () => {
  const w = 12;
  const h = 12;
  const buf = Buffer.alloc(w * h * 4);
  buf.fill(0);
  for (let i = 3; i < buf.length; i += 4) buf[i] = 255;
  const r = classifyRgbaBufferToDominantSlugV1(
    new Uint8Array(buf),
    w,
    h,
    4,
  );
  assert.equal(r.slug, "black");
});

test("extractDominantColorSlugFromBuffer: png red via sharp", async () => {
  const png = await sharp({
    create: {
      width: 32,
      height: 32,
      channels: 3,
      background: { r: 220, g: 30, b: 30 },
    },
  })
    .png()
    .toBuffer();
  const out = await extractDominantColorSlugFromBuffer(png);
  assert.equal(out.source, "vision_v1");
  assert.equal(out.slug, "red");
});

test("extractDominantColorSlugFromBuffer: invalid buffer -> none", async () => {
  const out = await extractDominantColorSlugFromBuffer(Buffer.alloc(8));
  assert.equal(out.source, "none");
  assert.equal(out.slug, undefined);
});
