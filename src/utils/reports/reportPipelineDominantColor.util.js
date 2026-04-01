/**
 * Deterministic dominant-color extraction v1 from raw image bytes (no LLM).
 * Resize → RGBA samples → HSV bucketing → slug aligned with {@link DOMINANT_COLOR_PROFILE} keys.
 */

import sharp from "sharp";

/** Slugs that {@link ../config/objectEnergyFormula.config.js} must define (plus `unknown`, `mixed`). */
export const DOMINANT_COLOR_SLUGS_V1 = [
  "gold",
  "silver",
  "bronze",
  "black",
  "white",
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "brown",
  "pink",
  "gray",
  "mixed",
  "unknown",
];

const MIXED_MAX_SHARE = 0.34;
const MIN_PIXELS = 24;

/**
 * RGB 0–255 → H 0–360, S/V 0–1
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {{ h: number, s: number, v: number }}
 */
export function rgbToHsv(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  const s = max < 1e-8 ? 0 : d / max;
  const v = max;

  if (d > 1e-8) {
    if (max === rn) {
      h = 60 * (((gn - bn) / d) % 6);
    } else if (max === gn) {
      h = 60 * ((bn - rn) / d + 2);
    } else {
      h = 60 * ((rn - gn) / d + 4);
    }
    if (h < 0) h += 360;
  }
  return { h, s, v };
}

/**
 * Map one pixel to a coarse slug (deterministic rule order).
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {string}
 */
export function mapRgbPixelToDominantSlugV1(r, g, b) {
  const { h, s, v } = rgbToHsv(r, g, b);

  if (v < 0.09) return "black";
  if (s < 0.09 && v > 0.92) return "white";

  if (s < 0.13) {
    if (v >= 0.15 && v <= 0.92) {
      if (v >= 0.45 && v <= 0.88 && s >= 0.05 && s < 0.13) return "silver";
      return "gray";
    }
    return v > 0.92 ? "white" : "gray";
  }

  if (s < 0.18 && v >= 0.42 && v <= 0.88 && s >= 0.05) {
    if (h >= 35 && h <= 220) return "silver";
  }

  if (v >= 0.12 && v <= 0.52 && s >= 0.18 && s <= 0.55) {
    if (h >= 18 && h <= 42) return "bronze";
    if (h >= 8 && h <= 48 && v < 0.48) return "brown";
  }

  if (h >= 38 && h <= 52 && s >= 0.28 && v >= 0.32) return "gold";
  if (h > 50 && h < 72 && s >= 0.22 && v >= 0.28) return "yellow";
  if ((h <= 16 || h >= 345) && s >= 0.28) return "red";
  if (h > 16 && h < 38 && s >= 0.26) return "orange";
  if (h >= 72 && h < 165 && s >= 0.2) return "green";
  if (h >= 165 && h < 245 && s >= 0.2) return "blue";
  if (h >= 265 && h < 310 && s >= 0.22) return "purple";
  if (h >= 310 && h < 345 && s >= 0.22) return "pink";

  if (h >= 245 && h < 265 && s >= 0.18) return "blue";

  if (v < 0.55 && s >= 0.15 && s < 0.45 && h < 55 && h > 5) return "brown";

  return "unknown";
}

/**
 * Aggregate RGBA buffer → dominant slug + confidence (winner share).
 * @param {Uint8Array|Buffer} data
 * @param {number} width
 * @param {number} height
 * @param {number} channels — 3 or 4
 * @returns {{ slug: string, confidence: number, pixelCount: number }}
 */
export function classifyRgbaBufferToDominantSlugV1(data, width, height, channels) {
  const ch = channels >= 4 ? 4 : 3;
  const counts = /** @type {Record<string, number>} */ ({});
  let n = 0;
  const stride = width * ch;
  for (let y = 0; y < height; y += 1) {
    const row = y * stride;
    for (let x = 0; x < width; x += 1) {
      const i = row + x * ch;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const slug = mapRgbPixelToDominantSlugV1(r, g, b);
      counts[slug] = (counts[slug] || 0) + 1;
      n += 1;
    }
  }

  if (n < MIN_PIXELS) {
    return { slug: "unknown", confidence: 0, pixelCount: n };
  }

  let bestSlug = "unknown";
  let best = 0;
  for (const [k, c] of Object.entries(counts)) {
    if (c > best) {
      best = c;
      bestSlug = k;
    }
  }
  const share = best / n;

  if (share < MIXED_MAX_SHARE) {
    return { slug: "mixed", confidence: share, pixelCount: n };
  }

  return { slug: bestSlug, confidence: share, pixelCount: n };
}

/**
 * Extract dominant color slug from image buffer (JPEG/PNG/WebP, etc.).
 * @param {Buffer} imageBuffer
 * @returns {Promise<{ slug: string, source: "vision_v1"|"none", confidence: number, pixelCount?: number }>}
 */
export async function extractDominantColorSlugFromBuffer(imageBuffer) {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length < 32) {
    return { slug: undefined, source: "none", confidence: 0 };
  }

  try {
    const { data, info } = await sharp(imageBuffer)
      .resize(48, 48, { fit: "inside", withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height, channels } = info;
    const u8 = new Uint8Array(data);
    const { slug, confidence, pixelCount } = classifyRgbaBufferToDominantSlugV1(
      u8,
      width,
      height,
      channels,
    );

    return {
      slug,
      source: "vision_v1",
      confidence,
      pixelCount,
    };
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "SCAN_DOMINANT_COLOR_V1_FAIL",
        message: err instanceof Error ? err.message : String(err),
      }),
    );
    return { slug: undefined, source: "none", confidence: 0 };
  }
}
