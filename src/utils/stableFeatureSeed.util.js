import { fnv1a32 } from "../moldavite/moldaviteScores.util.js";

/**
 * @param {unknown} v
 * @returns {string}
 */
function normField(v) {
  const s = String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  return s || "unknown";
}

/**
 * Deterministic seed from stable visual slugs (same object → same seed across angles).
 *
 * @param {null|undefined|{
 *   primaryColor?: string|null,
 *   materialType?: string|null,
 *   formFactor?: string|null,
 *   textureHint?: string|null,
 * }} features
 * @returns {string|null}
 */
export function buildStableFeatureSeed(features) {
  if (!features || typeof features !== "object") {
    return null;
  }
  const primaryColor = normField(features.primaryColor);
  const materialType = normField(features.materialType);
  const formFactor = normField(features.formFactor);
  const textureHint = normField(features.textureHint);

  const concat = `${primaryColor}:${materialType}:${formFactor}:${textureHint}`;

  if (
    primaryColor === "unknown" &&
    materialType === "unknown" &&
    formFactor === "unknown" &&
    textureHint === "unknown"
  ) {
    return null;
  }

  return String(fnv1a32(concat));
}
