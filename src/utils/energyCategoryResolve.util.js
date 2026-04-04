/**
 * Maps scan "main energy" wording → energy_categories.code (sync, no DB).
 * Master labels (v2):
 * - Thai amulet / talisman: โชคลาภ, เมตตา, คุ้มครอง, บารมี
 * - Crystal: เงินงาน, เสน่ห์, คุ้มครอง, บารมี, โชคลาภ, พลังงานสูง (spiritual_growth)
 * Keep in sync with Supabase seed / migrations.
 */
import { ENERGY_TYPES } from "../services/flex/scanCopy.config.js";
import {
  resolveEnergyTypeMetaForFamily,
} from "../services/flex/scanCopy.utils.js";

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
  spiritual_growth: {
    display_name_th: "พลังงานสูง",
    short_name_th: "พลังงานสูง",
    description_th: "เด่นเรื่องพลังงานสูงและการยกระดับตัวเอง",
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
  /** Indigo — spiritual / upper chakra; distinct from metta purple & luck green */
  spiritual_growth: "#3949AB",
};

/**
 * Crystal-only: Moldavite / quartz (strict) / chakra 6–7 / spiritual transformation signals.
 * Must not be used for thai_amulet / thai_talisman (non-crystal families never hit this).
 *
 * When `strictQuartz` is true (default), plain "quartz" without clear/spiritual context does **not** match
 * (avoids dragging rose quartz / shop stones into spiritual_growth).
 *
 * @param {string} raw — normalized main energy text
 * @param {{ strictQuartz?: boolean }} [options]
 * @returns {boolean}
 */
export function matchesCrystalSpiritualGrowthSignals(raw, options = {}) {
  const strictQuartz = options.strictQuartz !== false;
  const s = String(raw || "").replace(/\s+/g, " ").trim();
  if (!s) return false;
  const lower = s.toLowerCase();

  if (lower.includes("moldavite") || /โมลดา|มอลดา|moldav/i.test(s)) return true;

  if (/third\s*eye|crown\s*chakra|chakra\s*[67]/i.test(lower)) return true;
  if (/จักระ(ที่)?\s*[67]|จักระ\s*(หก|เจ็ด)/.test(s)) return true;

  if (lower.includes("spiritual") || lower.includes("intuition")) return true;

  if (s.includes("หยั่งรู้")) return true;
  if (
    s.includes("ญาณ") &&
    (s.includes("หยั่ง") || s.includes("ทัสนะ") || s.includes("สัมผัส"))
  )
    return true;
  if (s.includes("จิตวิญญาณ")) return true;
  if (s.includes("ญาณทัสนะ") || s.includes("สัมผัสที่หก") || s.includes("สัมผัสที่เจ็ด"))
    return true;

  if (s.includes("ยกระดับตัวเอง")) return true;
  if (s.includes("เร่งการเปลี่ยนแปลง") || s.includes("เปลี่ยนแปลงครั้งใหญ่")) return true;

  if (
    s.includes("พลังงานสูง") &&
    /หิน|คริสตัล|crystal|quartz|จักระ|หยั่ง|จิตวิญญาณ/i.test(s)
  )
    return true;

  if (lower.includes("quartz") || s.includes("ควอตซ์")) {
    if (!strictQuartz) return true;
    if (/clear\s*quartz|ควอตซ์\s*ใส|ควอตซ์ขาว|clear\s*crystal/i.test(s)) return true;
    if (
      /chakra|จักระ|third\s*eye|crown|หยั่ง|จิตวิญญาณ|spiritual|intuition|ญาณ|ยกระดับ|เปลี่ยนแปลง|พลังงานสูง|โมลดา|moldav/i.test(
        s,
      )
    )
      return true;
    return false;
  }

  return false;
}

/**
 * Tags for crystal-path debug logs (which signals fired).
 *
 * @param {string} raw
 * @returns {string[]}
 */
export function extractCrystalSpiritualSignalTags(raw) {
  const s = String(raw || "").replace(/\s+/g, " ").trim();
  if (!s) return [];
  const lower = s.toLowerCase();
  /** @type {string[]} */
  const tags = [];
  if (lower.includes("moldavite") || /โมลดา|มอลดา|moldav/i.test(s)) tags.push("moldavite");
  if (/clear\s*quartz|ควอตซ์\s*ใส|ควอตซ์ขาว/i.test(s)) tags.push("quartz_clear");
  else if (/quartz|ควอตซ์/i.test(s)) tags.push("quartz");
  if (/third\s*eye|crown\s*chakra|chakra\s*[67]/i.test(lower)) tags.push("chakra_en");
  if (/จักระ(ที่)?\s*[67]|จักระ\s*(หก|เจ็ด)/.test(s)) tags.push("chakra_th");
  if (s.includes("หยั่งรู้")) tags.push("intuition_th");
  if (s.includes("จิตวิญญาณ")) tags.push("spirit_th");
  if (lower.includes("spiritual")) tags.push("spiritual_en");
  if (lower.includes("intuition")) tags.push("intuition_en");
  if (s.includes("ยกระดับตัวเอง")) tags.push("self_elevation");
  if (s.includes("เร่งการเปลี่ยนแปลง") || s.includes("เปลี่ยนแปลงครั้งใหญ่"))
    tags.push("transformation");
  if (s.includes("พลังงานสูง")) tags.push("high_energy_phrase");
  return [...new Set(tags)];
}

/**
 * Crystal sub-mode for telemetry / copy hints (orthogonal to {@link inferEnergyCategoryCodeFromMainEnergy}).
 *
 * @param {string} objectFamilyRaw — pipeline slug
 * @param {string} mainEnergyText — wording / parsed main energy line
 * @returns {"general"|"spiritual_growth"|null}
 */
export function resolveCrystalMode(objectFamilyRaw, mainEnergyText) {
  const fam = normalizeObjectFamilyForEnergyCopy(objectFamilyRaw || "");
  if (fam !== "crystal") return null;
  const raw = String(mainEnergyText || "").replace(/\s+/g, " ").trim();
  if (matchesCrystalSpiritualGrowthSignals(raw, { strictQuartz: true }))
    return "spiritual_growth";
  return "general";
}

/**
 * Weak-protect crystal: route by co-occurring cues — avoid collapsing to luck_fortune by default.
 *
 * @param {string} raw
 * @returns {"confidence"|"charm"|"luck_fortune"}
 */
function routeCrystalWeakProtectToCategoryCode(raw) {
  const s = String(raw || "").replace(/\s+/g, " ").trim();

  if (/เสน่ห์|ดึงดูด|เข้าหา|ดึงคน|รับสังคม|น่าเข้าหา/.test(s)) {
    return "charm";
  }
  if (/เมตตา|อ่อนโยน|เปิดรับ/.test(s)) {
    return "charm";
  }
  if (
    /โชคลาภ|โชค|จังหวะ|เปิดทาง|ลาภ|โอกาส|จังหวะดี|flow/i.test(s)
  ) {
    return "luck_fortune";
  }
  if (
    /เกราะ|ปลอดภัย|มั่นคง|นิ่ง|ตั้งหลัก|สมดุล|บารมี|อำนาจ|ตัดสินใจ|หลักแน่น|สัญลักษณ์|เขตแดน|boundary|safe/i.test(
      s,
    )
  ) {
    return "confidence";
  }
  return "confidence";
}

/**
 * Generic BOOST crystal (no weak protect): default toward confidence; luck/charm only with clear wording.
 *
 * @param {string} raw
 * @returns {"confidence"|"charm"|"luck_fortune"}
 */
function routeCrystalGenericBoostToCategoryCode(raw) {
  const s = String(raw || "").replace(/\s+/g, " ").trim();
  if (!s || s === "-") {
    return "confidence";
  }
  if (/โชคลาภ|โชค|จังหวะ|ลาภ|เปิดทาง|โอกาส|จังหวะดี|flow/i.test(s)) {
    return "luck_fortune";
  }
  if (/เสน่ห์|ดึงดูด|เมตตา/.test(s)) {
    return "charm";
  }
  if (/สมดุล|นิ่ง|บารมี|อำนาจ|ตั้งหลัก|มั่นใจ/.test(s)) {
    return "confidence";
  }
  if (/กำลังใจ|ฮึด|ลุย|พลังบวก|สดใส|เติมพลัง|โอกาสดี/.test(s)) {
    return "luck_fortune";
  }
  return "confidence";
}

/**
 * @param {string} raw
 * @param {{ energyType: string, protectSignalStrength?: string }} meta
 * @param {string} t
 */
function inferCrystalCategoryFromResolverMeta(raw, meta, t) {
  switch (t) {
    case ENERGY_TYPES.PROTECT:
      return {
        code: "protection",
        crystalNonProtectRoutingReason: "resolver_protect",
        crystalWeakProtectOutcome: null,
        inferenceBranchSuffix: `type_${t}`,
      };
    case ENERGY_TYPES.POWER:
    case ENERGY_TYPES.BALANCE:
      return {
        code: "confidence",
        crystalNonProtectRoutingReason: "resolver_power_balance",
        crystalWeakProtectOutcome: null,
        inferenceBranchSuffix: `type_${t}`,
      };
    case ENERGY_TYPES.KINDNESS:
    case ENERGY_TYPES.ATTRACT:
      return {
        code: "charm",
        crystalNonProtectRoutingReason: "resolver_kindness_attract",
        crystalWeakProtectOutcome: null,
        inferenceBranchSuffix: `type_${t}`,
      };
    case ENERGY_TYPES.LUCK:
      return {
        code: "luck_fortune",
        crystalNonProtectRoutingReason: "resolver_luck",
        crystalWeakProtectOutcome: null,
        inferenceBranchSuffix: `type_${t}`,
      };
    case ENERGY_TYPES.BOOST:
      if (meta.protectSignalStrength === "weak") {
        const code = routeCrystalWeakProtectToCategoryCode(raw);
        return {
          code,
          crystalNonProtectRoutingReason: `weak_protect_${code}`,
          crystalWeakProtectOutcome: code,
          inferenceBranchSuffix: `weak_protect_${code}`,
        };
      }
      {
        const code = routeCrystalGenericBoostToCategoryCode(raw);
        return {
          code,
          crystalNonProtectRoutingReason: `generic_boost_${code}`,
          crystalWeakProtectOutcome: null,
          inferenceBranchSuffix: `generic_boost_${code}`,
        };
      }
    default:
      return {
        code: "confidence",
        crystalNonProtectRoutingReason: "crystal_default_confidence",
        crystalWeakProtectOutcome: null,
        inferenceBranchSuffix: "default_confidence",
      };
  }
}

/**
 * @param {string} mainEnergy
 * @param {string} [objectFamilyRaw]
 * @returns {string}
 */
export function inferEnergyCategoryCodeFromMainEnergy(mainEnergy, objectFamilyRaw) {
  return inferEnergyCategoryFull(mainEnergy, objectFamilyRaw).code;
}

/**
 * Single source of truth for category code + crystal routing telemetry.
 *
 * @param {string} mainEnergy
 * @param {string} [objectFamilyRaw]
 * @returns {{
 *   code: string,
 *   meta: ReturnType<typeof resolveEnergyTypeMetaForFamily>,
 *   inferenceBranch: string,
 *   crystalWeakProtectOutcome: string | null,
 *   crystalNonProtectRoutingReason: string | undefined,
 *   crystalPostResolverCategoryDecision: string | undefined,
 * }}
 */
function inferEnergyCategoryFull(mainEnergy, objectFamilyRaw) {
  const fam = normalizeObjectFamilyForEnergyCopy(objectFamilyRaw || "");
  const isCrystal = fam === "crystal";
  const raw = String(mainEnergy || "").replace(/\s+/g, " ").trim();
  const meta = resolveEnergyTypeMetaForFamily(raw, objectFamilyRaw);
  const t = meta.energyType;

  if (isCrystal && matchesCrystalSpiritualGrowthSignals(raw, { strictQuartz: true })) {
    return {
      code: "spiritual_growth",
      meta,
      inferenceBranch: "crystal_spiritual_growth",
      crystalWeakProtectOutcome: null,
      crystalNonProtectRoutingReason: "spiritual_growth_signals",
      crystalPostResolverCategoryDecision: "spiritual_growth",
    };
  }

  if (isCrystal) {
    const hasLuckWord = raw.includes("โชคลาภ") || raw.includes("โชค");
    const hasMoneyWorkWord =
      /เงิน|งาน|ทรัพย์|รายได้|ดูดเงิน|การงาน/.test(raw);
    if (hasMoneyWorkWord && !hasLuckWord) {
      return {
        code: "money_work",
        meta,
        inferenceBranch: "crystal_money_work",
        crystalWeakProtectOutcome: null,
        crystalNonProtectRoutingReason: "early_money_work",
        crystalPostResolverCategoryDecision: "money_work",
      };
    }
    if (hasLuckWord) {
      return {
        code: "luck_fortune",
        meta: {
          ...meta,
          energyType: ENERGY_TYPES.LUCK,
          matchedKeyword: null,
          protectSignalStrength: "none",
          resolvedEnergyTypeBeforeCategoryMap: ENERGY_TYPES.LUCK,
        },
        inferenceBranch: "crystal_luck_word",
        crystalWeakProtectOutcome: null,
        crystalNonProtectRoutingReason: "early_luck_word",
        crystalPostResolverCategoryDecision: "luck_fortune",
      };
    }

    const routed = inferCrystalCategoryFromResolverMeta(raw, meta, t);
    return {
      code: routed.code,
      meta,
      inferenceBranch: `crystal_${routed.inferenceBranchSuffix}`,
      crystalWeakProtectOutcome: routed.crystalWeakProtectOutcome,
      crystalNonProtectRoutingReason: routed.crystalNonProtectRoutingReason,
      crystalPostResolverCategoryDecision: routed.code,
    };
  }

  switch (t) {
    case ENERGY_TYPES.PROTECT:
      return {
        code: "protection",
        meta,
        inferenceBranch: `thai_type_${t}`,
        crystalWeakProtectOutcome: null,
        crystalNonProtectRoutingReason: undefined,
        crystalPostResolverCategoryDecision: undefined,
      };
    case ENERGY_TYPES.POWER:
    case ENERGY_TYPES.BALANCE:
      return {
        code: "confidence",
        meta,
        inferenceBranch: `thai_type_${t}`,
        crystalWeakProtectOutcome: null,
        crystalNonProtectRoutingReason: undefined,
        crystalPostResolverCategoryDecision: undefined,
      };
    case ENERGY_TYPES.KINDNESS:
    case ENERGY_TYPES.ATTRACT:
      return {
        code: "metta",
        meta,
        inferenceBranch: `thai_type_${t}`,
        crystalWeakProtectOutcome: null,
        crystalNonProtectRoutingReason: undefined,
        crystalPostResolverCategoryDecision: undefined,
      };
    case ENERGY_TYPES.LUCK:
      return {
        code: "luck_fortune",
        meta,
        inferenceBranch: `thai_type_${t}`,
        crystalWeakProtectOutcome: null,
        crystalNonProtectRoutingReason: undefined,
        crystalPostResolverCategoryDecision: undefined,
      };
    case ENERGY_TYPES.BOOST:
      return {
        code: "luck_fortune",
        meta,
        inferenceBranch: `thai_type_${t}`,
        crystalWeakProtectOutcome: null,
        crystalNonProtectRoutingReason: undefined,
        crystalPostResolverCategoryDecision: undefined,
      };
    default:
      return {
        code: "luck_fortune",
        meta,
        inferenceBranch: "thai_type_default",
        crystalWeakProtectOutcome: null,
        crystalNonProtectRoutingReason: undefined,
        crystalPostResolverCategoryDecision: undefined,
      };
  }
}

/**
 * Telemetry: branch labels + keyword that drove PROTECT (if any).
 *
 * @param {string} mainEnergy
 * @param {string} [objectFamilyRaw]
 * @returns {{
 *   code: string,
 *   inferenceBranch: string,
 *   resolveEnergyTypeResult: string,
 *   protectKeywordMatched: string | null,
 *   protectWeakKeywordMatched: string | null,
 *   protectSignalStrength: string,
 *   energyTypeResolverMode: string,
 *   energyTypeResolverFamily: string,
 *   resolvedEnergyTypeBeforeCategoryMap: string,
 *   crystalWeakProtectOutcome: string | null,
 *   crystalNonProtectRoutingReason: string | undefined,
 *   crystalPostResolverCategoryDecision: string | undefined,
 * }}
 */
export function inferEnergyCategoryInferenceTrace(mainEnergy, objectFamilyRaw) {
  const fam = normalizeObjectFamilyForEnergyCopy(objectFamilyRaw || "");
  const isCrystal = fam === "crystal";
  const raw = String(mainEnergy || "").replace(/\s+/g, " ").trim();
  const full = inferEnergyCategoryFull(mainEnergy, objectFamilyRaw);
  const code = full.code;
  let meta = full.meta;

  const inferenceBranch = full.inferenceBranch;

  const protectWeakKeywordMatched =
    isCrystal && meta.protectSignalStrength === "weak"
      ? meta.matchedKeyword
      : null;

  return {
    code,
    inferenceBranch,
    resolveEnergyTypeResult: meta.energyType,
    protectKeywordMatched:
      meta.energyType === ENERGY_TYPES.PROTECT ? meta.matchedKeyword : null,
    protectWeakKeywordMatched,
    protectSignalStrength: meta.protectSignalStrength ?? "none",
    energyTypeResolverMode: meta.energyTypeResolverMode,
    energyTypeResolverFamily: meta.energyTypeResolverFamily,
    resolvedEnergyTypeBeforeCategoryMap: meta.resolvedEnergyTypeBeforeCategoryMap,
    crystalWeakProtectOutcome: full.crystalWeakProtectOutcome ?? null,
    crystalNonProtectRoutingReason: full.crystalNonProtectRoutingReason,
    crystalPostResolverCategoryDecision: full.crystalPostResolverCategoryDecision,
  };
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
