/**
 * Maps scan "main energy" wording → energy_categories.code (sync, no DB).
 * Keep labels in sync with `energy_categories` seed / Supabase migration.
 */
import { ENERGY_TYPES } from "../services/flex/scanCopy.config.js";
import { resolveEnergyType } from "../services/flex/scanCopy.utils.js";

/** @type {Record<string, string>} */
const ENERGY_TYPE_TO_CATEGORY_CODE = {
  [ENERGY_TYPES.PROTECT]: "protection",
  [ENERGY_TYPES.BALANCE]: "focus",
  [ENERGY_TYPES.POWER]: "confidence",
  [ENERGY_TYPES.KINDNESS]: "charm",
  [ENERGY_TYPES.ATTRACT]: "charm",
  [ENERGY_TYPES.LUCK]: "money_work",
  [ENERGY_TYPES.BOOST]: "relief",
};

/**
 * Mirror of `energy_categories` display fields (fallback when DB unreadable).
 * Update when migration seed changes.
 */
export const ENERGY_CATEGORY_DISPLAY_SYNC = {
  money_work: {
    display_name_th: "เปิดเงินงาน",
    short_name_th: "เงินงาน",
  },
  charm: {
    display_name_th: "ดึงคนเข้าหา",
    short_name_th: "เสน่ห์",
  },
  confidence: {
    display_name_th: "ดันความมั่นใจ",
    short_name_th: "มั่นใจ",
  },
  protection: {
    display_name_th: "กันแรงลบ",
    short_name_th: "คุ้มครอง",
  },
  focus: {
    display_name_th: "ตั้งหลักไว",
    short_name_th: "คุมใจ",
  },
  relief: {
    display_name_th: "ลดความหนัก",
    short_name_th: "เบาชีวิต",
  },
};

/**
 * Accent hex for Flex (summary-first uses gold elsewhere; legacy carousel uses this on bubbles).
 */
export const ACCENT_COLOR_BY_CATEGORY_CODE = {
  money_work: "#2E7D32",
  charm: "#AD1457",
  confidence: "#C62828",
  protection: "#D4AF37",
  focus: "#1565C0",
  relief: "#78909C",
};

/**
 * @param {string} mainEnergy
 * @returns {string}
 */
export function inferEnergyCategoryCodeFromMainEnergy(mainEnergy) {
  const t = resolveEnergyType(String(mainEnergy || "").trim());
  return ENERGY_TYPE_TO_CATEGORY_CODE[t] || "relief";
}

/**
 * Maps pipeline objectFamily slugs → energy_copy_templates.object_family values.
 * Unknown / generic defaults to thai_amulet (seed has copy rows).
 *
 * @param {string} raw
 * @returns {string}
 */
export function normalizeObjectFamilyForEnergyCopy(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if (!s || s === "generic") return "thai_amulet";
  if (s === "crystal") return "crystal";
  if (s === "thai_amulet") return "thai_amulet";
  if (s === "thai_talisman" || s === "takrud") return "thai_talisman";
  if (s === "global_symbol") return "global_symbol";
  if (s === "somdej") return "thai_amulet";
  return "thai_amulet";
}

/**
 * @param {string} categoryCode
 * @returns {string|null}
 */
export function pickAccentColorFromCategoryCode(categoryCode) {
  const c = String(categoryCode || "").trim();
  return ACCENT_COLOR_BY_CATEGORY_CODE[c] || null;
}
