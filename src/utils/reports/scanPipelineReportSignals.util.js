/**
 * Maps real pipeline outputs into report payload / object-energy slugs.
 * Heuristic only — do not treat as ground truth for fine-grained amulet subtype.
 *
 * NOT sourced here (still undefined until upstream exists):
 * - dominantColor — TODO: wire from vision / color extraction stage
 * - conditionClass — TODO: wire from image quality or conservator pipeline
 * - objectCheckConfidence — only pass when a real numeric confidence exists (never fabricate)
 */

/**
 * @typedef {Object} PipelineObjectSignals
 * @property {string} objectFamily
 * @property {string|undefined} materialFamily
 * @property {string|undefined} shapeFamily — omit to let builder default `unknown`
 */

/**
 * Thai category from {@link classifyObjectCategory} / `runDeepScan().objectCategory`.
 * @param {string|null|undefined} objectCategoryThai
 * @returns {PipelineObjectSignals}
 */
export function mapObjectCategoryToPipelineSignals(objectCategoryThai) {
  const t = String(objectCategoryThai ?? "").trim();

  if (!t) {
    return { objectFamily: "generic", materialFamily: undefined, shapeFamily: undefined };
  }

  if (t.includes("คริสตัล") || t.includes("หิน")) {
    return {
      objectFamily: "crystal",
      materialFamily: "crystal",
      shapeFamily: undefined,
    };
  }

  if (t.includes("เครื่องราง")) {
    return {
      objectFamily: "takrud",
      materialFamily: "metal",
      shapeFamily: undefined,
    };
  }

  if (t.includes("พระบูชา")) {
    return {
      objectFamily: "somdej",
      materialFamily: undefined,
      shapeFamily: "seated",
    };
  }

  if (t.includes("พระเครื่อง")) {
    return {
      objectFamily: "generic",
      materialFamily: undefined,
      shapeFamily: undefined,
    };
  }

  return { objectFamily: "generic", materialFamily: undefined, shapeFamily: undefined };
}

/**
 * Counts how many optional threading fields are present (for light telemetry).
 * @param {Record<string, unknown>} fields
 * @returns {number}
 */
export function countThreadedReportSignalFields(fields) {
  let n = 0;
  const dc = fields.dominantColor;
  const cc = fields.conditionClass;
  const mat = fields.materialFamily;
  const fam = fields.objectFamily;
  const sh = fields.shapeFamily;
  const ocr = fields.objectCheckResult;
  const occ = fields.objectCheckConfidence;
  const cat = fields.objectCategory;

  if (dc != null && String(dc).trim()) n += 1;
  if (cc != null && String(cc).trim()) n += 1;
  if (mat != null && String(mat).trim()) n += 1;
  if (fam && String(fam).trim() && String(fam) !== "generic") n += 1;
  if (sh && String(sh).trim() && String(sh) !== "unknown") n += 1;
  if (ocr != null && String(ocr).trim()) n += 1;
  if (occ != null && Number.isFinite(Number(occ))) n += 1;
  if (cat != null && String(cat).trim()) n += 1;
  return n;
}
