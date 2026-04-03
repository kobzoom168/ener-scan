/**
 * Maps scan "main energy" wording → energy_categories.code (sync, no DB).
 * Master labels (v2):
 * - Thai amulet / talisman: โชคลาภ, เมตตา, คุ้มครอง, บารมี
 * - Crystal: เงินงาน, เสน่ห์, คุ้มครอง, บารมี, โชคลาภ
 * Keep in sync with Supabase seed / migrations.
 */
import { ENERGY_TYPES } from "../services/flex/scanCopy.config.js";
import { resolveEnergyType } from "../services/flex/scanCopy.utils.js";

/**
 * Mirror of `energy_categories` display fields (fallback when DB unreadable).
 */
export const ENERGY_CATEGORY_DISPLAY_SYNC = {
  money_work: {
    display_name_th: "เงินงาน",
    short_name_th: "เงินงาน",
    description_th: "เด่นเรื่องเงิน งาน และโอกาส",
  },
  charm: {
    display_name_th: "เสน่ห์",
    short_name_th: "เสน่ห์",
    description_th: "เด่นเรื่องเสน่ห์และแรงดึงดูด",
  },
  confidence: {
    display_name_th: "บารมี",
    short_name_th: "บารมี",
    description_th: "เด่นเรื่องบารมีและน้ำหนักในตัว",
  },
  protection: {
    display_name_th: "คุ้มครอง",
    short_name_th: "คุ้มครอง",
    description_th: "เด่นเรื่องคุ้มครองและกันเรื่องไม่ดี",
  },
  luck_fortune: {
    display_name_th: "โชคลาภ",
    short_name_th: "โชคลาภ",
    description_th: "เด่นเรื่องโชคและจังหวะดี",
  },
  metta: {
    display_name_th: "เมตตา",
    short_name_th: "เมตตา",
    description_th: "เด่นเรื่องเมตตาและคนเปิดรับ",
  },
};

/**
 * Accent hex for Flex / legacy carousel.
 */
export const ACCENT_COLOR_BY_CATEGORY_CODE = {
  money_work: "#2E7D32",
  charm: "#AD1457",
  confidence: "#C62828",
  protection: "#D4AF37",
  luck_fortune: "#2E7D32",
  metta: "#8E24AA",
};

/**
 * @param {string} mainEnergy
 * @param {string} [objectFamilyRaw] — pipeline slug; drives Thai vs crystal master set
 * @returns {string}
 */
export function inferEnergyCategoryCodeFromMainEnergy(mainEnergy, objectFamilyRaw) {
  const fam = normalizeObjectFamilyForEnergyCopy(objectFamilyRaw || "");
  const isCrystal = fam === "crystal";
  const raw = String(mainEnergy || "").replace(/\s+/g, " ").trim();

  if (isCrystal) {
    const hasLuckWord = raw.includes("โชคลาภ") || raw.includes("โชค");
    const hasMoneyWorkWord =
      /เงิน|งาน|ทรัพย์|รายได้|ดูดเงิน|การงาน/.test(raw);
    if (hasMoneyWorkWord && !hasLuckWord) {
      return "money_work";
    }
    if (hasLuckWord) {
      return "luck_fortune";
    }
  }

  const t = resolveEnergyType(raw);

  if (isCrystal) {
    switch (t) {
      case ENERGY_TYPES.PROTECT:
        return "protection";
      case ENERGY_TYPES.POWER:
      case ENERGY_TYPES.BALANCE:
        return "confidence";
      case ENERGY_TYPES.KINDNESS:
      case ENERGY_TYPES.ATTRACT:
        return "charm";
      case ENERGY_TYPES.LUCK:
        return "luck_fortune";
      case ENERGY_TYPES.BOOST:
        return "luck_fortune";
      default:
        return "luck_fortune";
    }
  }

  switch (t) {
    case ENERGY_TYPES.PROTECT:
      return "protection";
    case ENERGY_TYPES.POWER:
    case ENERGY_TYPES.BALANCE:
      return "confidence";
    case ENERGY_TYPES.KINDNESS:
    case ENERGY_TYPES.ATTRACT:
      return "metta";
    case ENERGY_TYPES.LUCK:
      return "luck_fortune";
    case ENERGY_TYPES.BOOST:
      return "luck_fortune";
    default:
      return "luck_fortune";
  }
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
