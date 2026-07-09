/**
 * HTTP client for the vision sidecar (vision-sidecar/): DINOv2 embedding +
 * SuperPoint/LightGlue geometric matching. All calls are best-effort — callers
 * treat null as "sidecar unavailable" and fall through to older reuse paths.
 */
import { env } from "../../config/env.js";

function baseUrl() {
  return String(env.VISION_SIDECAR_URL || "").replace(/\/+$/, "");
}

async function post(path, body, timeoutMs) {
  const url = baseUrl();
  if (!url) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${url}${path}`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {string} imageB64
 * @returns {Promise<{ embedding: number[], dim: number, cropped: boolean, model: string } | null>}
 */
export async function visionEmbedImage(imageB64) {
  const j = await post("/embed", { image_b64: imageB64 }, env.VISION_REID_TIMEOUT_MS);
  if (!j || !Array.isArray(j.embedding) || j.embedding.length !== 384) return null;
  return j;
}

/**
 * @param {string} imageAB64
 * @param {string} imageBB64
 * @returns {Promise<{ inliers: number, raw_matches: number } | null>}
 */
export async function visionMatchPair(imageAB64, imageBB64) {
  const j = await post(
    "/match",
    { image_a_b64: imageAB64, image_b_b64: imageBB64 },
    env.VISION_REID_TIMEOUT_MS,
  );
  if (!j || !Number.isFinite(Number(j.inliers))) return null;
  return { inliers: Number(j.inliers), raw_matches: Number(j.raw_matches) || 0 };
}

/** @returns {Promise<boolean>} */
export async function visionSidecarHealthy() {
  const url = baseUrl();
  if (!url) return false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${url}/healthz`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}
