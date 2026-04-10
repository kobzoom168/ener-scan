/**
 * Ritual mode resolver — lane × primary axis (deterministic labels, Thai).
 */

/** @typedef {"ตั้งจิต"|"สวดภาวนา"|"ขอพรสั้น"|"เสริมบารมี"} TimingRitualModeTh */

/** @type {Record<string, Record<string, TimingRitualModeTh>>} */
export const TIMING_RITUAL_MODE_BY_LANE = Object.freeze({
  sacred_amulet: Object.freeze(
    /** @type {Record<string, TimingRitualModeTh>} */ ({
      protection: "ตั้งจิต",
      metta: "ขอพรสั้น",
      baramee: "เสริมบารมี",
      luck: "สวดภาวนา",
      fortune_anchor: "ตั้งจิต",
      specialty: "ตั้งจิต",
    }),
  ),
  moldavite: Object.freeze(
    /** @type {Record<string, TimingRitualModeTh>} */ ({
      work: "ตั้งจิต",
      money: "สวดภาวนา",
      relationship: "ขอพรสั้น",
      life_rhythm: "ตั้งจิต",
      owner_fit: "ขอพรสั้น",
    }),
  ),
});

/**
 * @param {"sacred_amulet"|"moldavite"} lane
 * @param {string} primaryKey
 * @returns {TimingRitualModeTh}
 */
export function resolveRitualMode(lane, primaryKey) {
  const k = String(primaryKey || "").trim();
  const pack =
    lane === "moldavite"
      ? TIMING_RITUAL_MODE_BY_LANE.moldavite
      : TIMING_RITUAL_MODE_BY_LANE.sacred_amulet;
  return pack[k] || "ตั้งจิต";
}
