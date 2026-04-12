/**
 * Maps real pipeline outputs into report payload / object-energy slugs.
 * Heuristic only — do not treat as ground truth for fine-grained amulet subtype.
 *
 * Visual signals (see `reportPipelineVisualSignals.util.js`):
 * - dominantColor — no CV/palette pipeline in repo yet; do **not** use LLM `tone` (โทนพลัง) as
 *   deterministic input. Future: pixel/vision stage or persisted column → pass slug via builder opts.
 * - conditionClass — no physical-condition or quality-class model; `objectCheck` `unclear` is a
 *   gate, not `excellent|good|…|damaged`. Future: dedicated assessment or human label → builder opts.
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
      objectFamily: "sacred_amulet",
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
