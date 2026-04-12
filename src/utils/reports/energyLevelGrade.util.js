/**
 * Shared S/A/B/D energy level grades from 0–10 score (reports: Moldavite, sacred_amulet, generic).
 * Thresholds are single source of truth — do not duplicate in templates.
 */

/** @typedef {"S"|"A"|"B"|"D"} EnergyGrade */

/**
 * @param {number|null|undefined} score10
 * @returns {EnergyGrade}
 */
export function score10ToEnergyGrade(score10) {
  if (score10 == null || score10 === "") return "";
  const n = Number(score10);
  if (!Number.isFinite(n)) return "";
  if (n >= 8.9) return "S";
  if (n >= 7.5) return "A";
  if (n >= 6.5) return "B";
  return "D";
}

/** Fallback when `energyLevelLabel` is legacy Thai and score is missing. */
const LEGACY_THAI_TO_GRADE = {
  สูงมาก: "S",
  สูง: "A",
  กลาง: "B",
  ต่ำ: "D",
  ปานกลาง: "B",
  อ่อน: "D",
};

/**
 * Grade for HTML strip: prefer numeric score when present; else letter label; else legacy Thai.
 * @param {string|null|undefined} energyLevelLabel
 * @param {number|null|undefined} energyScore10
 * @returns {EnergyGrade}
 */
export function resolveEnergyGradeFromLabelAndScore(energyLevelLabel, energyScore10) {
  const t = String(energyLevelLabel || "").trim();
  if (/^[sabd]$/i.test(t)) {
    return /** @type {EnergyGrade} */ (t.toUpperCase());
  }
  if (energyScore10 != null && Number.isFinite(Number(energyScore10))) {
    return score10ToEnergyGrade(Number(energyScore10));
  }
  const legacy = LEGACY_THAI_TO_GRADE[t];
  if (legacy) return /** @type {EnergyGrade} */ (legacy);
  return "D";
}

/**
 * Grade letter for report UI. Returns `""` when there is no score and no label (show "ไม่มี" in template).
 * Otherwise same resolution as {@link resolveEnergyGradeFromLabelAndScore}.
 * @param {string|null|undefined} energyLevelLabel
 * @param {number|null|undefined} energyScore10
 * @returns {EnergyGrade|""}
 */
export function resolveEnergyLevelDisplayGrade(energyLevelLabel, energyScore10) {
  const t = String(energyLevelLabel || "").trim();
  const hasScore =
    energyScore10 != null &&
    energyScore10 !== "" &&
    Number.isFinite(Number(energyScore10));
  if (!hasScore && !t) return "";
  return resolveEnergyGradeFromLabelAndScore(energyLevelLabel, energyScore10);
}

/**
 * CSS class for the level cell value (e.g. `level-grade--A`).
 * @param {EnergyGrade|string} grade
 * @returns {string}
 */
export function energyGradeToLevelGradeClass(grade) {
  const g = String(grade || "D").trim().toUpperCase();
  if (g === "S" || g === "A" || g === "B" || g === "D") {
    return `level-grade--${g}`;
  }
  return "level-grade--D";
}
