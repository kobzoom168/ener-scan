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
 * v2 (กบ 15 ก.ค.): ผสม 4 ช่องอัตลักษณ์พิมพ์ (shapeOutline/mainMotif/figureCount/casing) เข้า seed
 * — 4 ช่องหยาบเดิมทำให้พระคนละองค์ที่เนื้อ/สี/ทรงใกล้กันได้ seed ชนกัน → คะแนน 6 แกนซ้ำเป๊ะ
 * (เคสคุณชิต: 5 องค์ seed เดียวกันหมด). ช่องใหม่นิ่งข้ามมุมเช่นกัน จึงไม่เสียความเสถียรของชิ้นเดิม.
 *
 * @param {null|undefined|{
 *   primaryColor?: string|null,
 *   materialType?: string|null,
 *   formFactor?: string|null,
 *   textureHint?: string|null,
 *   shapeOutline?: string|null,
 *   mainMotif?: string|null,
 *   figureCount?: string|null,
 *   casing?: string|null,
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
  const shapeOutline = normField(features.shapeOutline);
  const mainMotif = normField(features.mainMotif);
  const figureCount = normField(features.figureCount);
  const casing = normField(features.casing);

  if (
    primaryColor === "unknown" &&
    materialType === "unknown" &&
    formFactor === "unknown" &&
    textureHint === "unknown"
  ) {
    return null;
  }

  const concat = `${primaryColor}:${materialType}:${formFactor}:${textureHint}`;
  const identityConcat = `${shapeOutline}:${mainMotif}:${figureCount}:${casing}`;

  /** ช่องอัตลักษณ์ unknown หมด (เช่น extractor รุ่นเก่า/ตอบไม่ได้) → seed เท่าสูตรเดิมเป๊ะ ไม่รีโรลของเก่า */
  if (identityConcat === "unknown:unknown:unknown:unknown") {
    return String(fnv1a32(concat));
  }

  return String(fnv1a32(`${concat}|${identityConcat}`));
}
