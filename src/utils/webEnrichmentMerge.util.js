/**
 * Merge external web hints into report wording only (deterministic truth wins).
 * @module
 */

import { normalizeObjectFamilyForEnergyCopy } from "./energyCategoryResolve.util.js";

/**
 * @typedef {import("../services/webEnrichment/webEnrichment.types.js").ExternalObjectHints} ExternalObjectHints
 */

const DEFAULT_OBJECT_LABEL_TH = "วัตถุจากการสแกน";

const CRYSTAL_HINT = /คริสตัล|crystal|quartz|ควอตซ์|หิน|แร่/i;
const AMULET_HINT =
  /พระเครื่อง|พระบูชา|เหรียญ|ปิดตา|สมเด็จ|หลวงพ่อ|วัด|รุ่น|เนื้อดิน|เนื้อผง/i;

/**
 * @param {string} label
 * @param {string} energyCopyFamily
 * @returns {"ok"|"weak_conflict"|"hard_conflict"}
 */
export function classifyHintVsObjectFamily(label, energyCopyFamily) {
  const s = String(label || "").trim();
  if (!s) return "ok";
  const fam = normalizeObjectFamilyForEnergyCopy(energyCopyFamily || "");

  if (fam === "crystal") {
    if (AMULET_HINT.test(s) && !CRYSTAL_HINT.test(s)) return "hard_conflict";
    return "ok";
  }
  if (
    fam === "sacred_amulet" ||
    fam === "thai_amulet" ||
    fam === "thai_talisman"
  ) {
    if (CRYSTAL_HINT.test(s) && !AMULET_HINT.test(s)) return "hard_conflict";
    if (CRYSTAL_HINT.test(s) && AMULET_HINT.test(s)) return "weak_conflict";
    return "ok";
  }
  return "ok";
}

/**
 * @param {import("../services/reports/reportPayload.types.js").ReportPayload} payload
 * @param {ExternalObjectHints|null|undefined} hints
 * @returns {{ payload: import("../services/reports/reportPayload.types.js").ReportPayload, mergeMode: string, appliedFields: string[], ignoredConflict: boolean }}
 */
export function mergeExternalHintsIntoWordingContext(payload, hints) {
  if (!hints || !payload || typeof payload !== "object") {
    return {
      payload,
      mergeMode: "none",
      appliedFields: [],
      ignoredConflict: false,
    };
  }

  const famForConflict = String(
    payload.summary?.energyCopyObjectFamily || "sacred_amulet",
  ).trim();

  let ignoredConflict = false;
  let mergeMode = "conservative";
  /** @type {string[]} */
  const appliedFields = [];

  const next = structuredClone(payload);
  const label =
    hints.probableObjectLabel != null
      ? String(hints.probableObjectLabel).trim()
      : "";
  const labelKind = label
    ? classifyHintVsObjectFamily(label, famForConflict)
    : "ok";

  if (label && labelKind === "hard_conflict") {
    ignoredConflict = true;
    mergeMode = "labels_blocked_conflict";
  } else if (label && labelKind === "weak_conflict") {
    mergeMode = "conservative_weak_label_skipped";
    ignoredConflict = true;
  } else if (
    label &&
    (next.object?.objectLabel === DEFAULT_OBJECT_LABEL_TH ||
      !String(next.object?.objectLabel || "").trim())
  ) {
    next.object = { ...next.object, objectLabel: label.slice(0, 120) };
    next.wording = { ...next.wording, objectLabel: label.slice(0, 120) };
    appliedFields.push("object.objectLabel", "wording.objectLabel");
  }

  const spiritual =
    Array.isArray(hints.spiritualContextHints) &&
    hints.spiritualContextHints.length
      ? String(hints.spiritualContextHints[0] || "")
          .replace(/\s+/g, " ")
          .trim()
      : "";
  const cultural =
    Array.isArray(hints.culturalDescriptors) &&
    hints.culturalDescriptors.length
      ? String(hints.culturalDescriptors[0] || "")
          .replace(/\s+/g, " ")
          .trim()
      : "";
  const softPara = spiritual || cultural;
  if (softPara && next.wording) {
    const open = String(next.wording.htmlOpeningLine || "").trim();
    const addition = softPara.length > 320 ? `${softPara.slice(0, 317)}…` : softPara;
    if (!open) {
      next.wording.htmlOpeningLine = addition;
      appliedFields.push("wording.htmlOpeningLine");
    } else if (!open.includes(addition.slice(0, Math.min(24, addition.length)))) {
      const combined = `${open} ${addition}`.trim();
      next.wording.htmlOpeningLine =
        combined.length > 520 ? `${combined.slice(0, 517)}…` : combined;
      appliedFields.push("wording.htmlOpeningLine");
    }
  }

  const headlineSoft =
    hints.marketNames && hints.marketNames.length
      ? String(hints.marketNames[0] || "").trim()
      : "";
  if (
    headlineSoft &&
    next.summary &&
    !ignoredConflict &&
    classifyHintVsObjectFamily(headlineSoft, famForConflict) === "ok"
  ) {
    const hs = String(next.summary.headlineShort || "").trim();
    if (!hs || hs.length < 12) {
      next.summary.headlineShort = headlineSoft.slice(0, 80);
      appliedFields.push("summary.headlineShort");
    }
  }

  next.enrichment = {
    hints: {
      probableObjectLabel: hints.probableObjectLabel ?? null,
      marketNames: hints.marketNames || [],
      culturalDescriptors: hints.culturalDescriptors || [],
      spiritualContextHints: hints.spiritualContextHints || [],
      sourceUrls: hints.sourceUrls || [],
      confidenceBand: hints.confidenceBand || "low",
      provider: hints.provider || "unknown",
      fetchedAt: hints.fetchedAt || new Date().toISOString(),
    },
    mergeMode,
    appliedFields: [...appliedFields],
  };

  return {
    payload: next,
    mergeMode,
    appliedFields,
    ignoredConflict,
  };
}
