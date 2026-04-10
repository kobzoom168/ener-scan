/**
 * Weekday affinity 0–1 by lane primary key (Sunday = 0 … Saturday = 6).
 * Config-driven; not embedded in template.
 */

/** @type {Record<string, Record<number, number>>} */
const SACRED_WD = {
  protection: { 0: 0.72, 1: 0.55, 2: 0.88, 3: 0.6, 4: 0.58, 5: 0.9, 6: 0.7 },
  metta: { 0: 0.65, 1: 0.58, 2: 0.55, 3: 0.62, 4: 0.55, 5: 0.92, 6: 0.68 },
  baramee: { 0: 0.9, 1: 0.62, 2: 0.58, 3: 0.6, 4: 0.88, 5: 0.72, 6: 0.65 },
  luck: { 0: 0.58, 1: 0.55, 2: 0.62, 3: 0.85, 4: 0.92, 5: 0.7, 6: 0.6 },
  fortune_anchor: { 0: 0.7, 1: 0.72, 2: 0.6, 3: 0.78, 4: 0.88, 5: 0.62, 6: 0.65 },
  specialty: { 0: 0.68, 1: 0.7, 2: 0.68, 3: 0.7, 4: 0.72, 5: 0.68, 6: 0.7 },
};

/** @type {Record<string, Record<number, number>>} */
const MOLDAVITE_WD = {
  work: { 0: 0.62, 1: 0.92, 2: 0.88, 3: 0.78, 4: 0.72, 5: 0.65, 6: 0.55 },
  money: { 0: 0.55, 1: 0.85, 2: 0.72, 3: 0.88, 4: 0.9, 5: 0.78, 6: 0.6 },
  relationship: { 0: 0.7, 1: 0.58, 2: 0.55, 3: 0.62, 4: 0.55, 5: 0.92, 6: 0.68 },
  life_rhythm: { 0: 0.72, 1: 0.7, 2: 0.68, 3: 0.72, 4: 0.74, 5: 0.7, 6: 0.68 },
  owner_fit: { 0: 0.68, 1: 0.7, 2: 0.66, 3: 0.7, 4: 0.72, 5: 0.74, 6: 0.66 },
};

/**
 * @param {"sacred_amulet"|"moldavite"} lane
 * @param {string} primaryKey
 * @param {number} weekday0Sun
 * @returns {number} 0–100
 */
export function weekdayAffinityScore(lane, primaryKey, weekday0Sun) {
  const pk = String(primaryKey || "").trim();
  const wd = ((weekday0Sun % 7) + 7) % 7;
  const table =
    lane === "moldavite"
      ? MOLDAVITE_WD[pk] || MOLDAVITE_WD.work
      : SACRED_WD[pk] || SACRED_WD.protection;
  const w = table[wd];
  const n = Number(w);
  if (!Number.isFinite(n)) return 70;
  return Math.round(Math.min(1, Math.max(0, n)) * 100);
}

/** Thai labels Sunday-first */
export const TIMING_WEEKDAY_LABEL_TH = Object.freeze([
  "วันอาทิตย์",
  "วันจันทร์",
  "วันอังคาร",
  "วันพุธ",
  "วันพฤหัสบดี",
  "วันศุกร์",
  "วันเสาร์",
]);
