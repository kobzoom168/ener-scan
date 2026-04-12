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
import {
  buildCrystalRoutingInput,
  crystalLegacyNonProtectRoutingReason,
  resolveCrystalCategoryRouting,
} from "./crystalCategoryRouting.util.js";

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
 * Crystal-only presentation for `confidence` — same `energyCategoryCode` as Thai path; wording only.
 * Thai / เครื่องราง keep {@link ENERGY_CATEGORY_DISPLAY_SYNC.confidence} (บารมี).
 */
export const CRYSTAL_CONFIDENCE_DISPLAY = {
  display_name_th: "ความมั่นใจ",
  short_name_th: "ความมั่นใจ",
  description_th: "เด่นเรื่องความมั่นใจและน้ำหนักในตัว",
};

/**
 * Visible label sync: Thai uses master `confidence` row; crystal uses {@link CRYSTAL_CONFIDENCE_DISPLAY}.
 * @param {string} categoryCode
 * @param {string} [objectFamilyRaw]
 * @returns {typeof ENERGY_CATEGORY_DISPLAY_SYNC[string]}
 */
export function getCategoryDisplaySyncForFamily(categoryCode, objectFamilyRaw) {
  const code = String(categoryCode || "").trim();
  const fam = normalizeObjectFamilyForEnergyCopy(objectFamilyRaw || "");
  if (code === "confidence" && fam === "crystal") {
    return { ...ENERGY_CATEGORY_DISPLAY_SYNC.confidence, ...CRYSTAL_CONFIDENCE_DISPLAY };
  }
  return ENERGY_CATEGORY_DISPLAY_SYNC[code] || ENERGY_CATEGORY_DISPLAY_SYNC.luck_fortune;
}

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
 *   crystalRoutingRuleId: string | undefined,
 *   crystalRoutingReason: string | undefined,
 *   crystalRoutingStrategy: string | undefined,
 * }}
 */
function inferEnergyCategoryFull(mainEnergy, objectFamilyRaw) {
  const fam = normalizeObjectFamilyForEnergyCopy(objectFamilyRaw || "");
  const isCrystal = fam === "crystal";
  const raw = String(mainEnergy || "").replace(/\s+/g, " ").trim();
  const meta = resolveEnergyTypeMetaForFamily(raw, objectFamilyRaw);
  const t = meta.energyType;

  if (isCrystal) {
    const hasLuckWord = raw.includes("โชคลาภ") || raw.includes("โชค");
    const hasMoneyWorkWord =
      /เงิน|งาน|ทรัพย์|รายได้|ดูดเงิน|การงาน/.test(raw);
    const hasSpiritualGrowthSignal = matchesCrystalSpiritualGrowthSignals(raw, {
      strictQuartz: true,
    });

    const routingInput = buildCrystalRoutingInput(raw, meta, {
      hasSpiritualGrowthSignal,
      hasLuckWord,
      hasMoneyWorkWord,
    });
    const routed = resolveCrystalCategoryRouting(routingInput);

    let outMeta = meta;
    if (routed.needsLuckWordMetaOverride) {
      outMeta = {
        ...meta,
        energyType: ENERGY_TYPES.LUCK,
        matchedKeyword: null,
        protectSignalStrength: "none",
        resolvedEnergyTypeBeforeCategoryMap: ENERGY_TYPES.LUCK,
      };
    }

    return {
      code: routed.categoryCode,
      meta: outMeta,
      inferenceBranch: `crystal_${routed.inferenceBranchSuffix}`,
      crystalWeakProtectOutcome: routed.crystalWeakProtectOutcome,
      crystalNonProtectRoutingReason: crystalLegacyNonProtectRoutingReason(routed),
      crystalPostResolverCategoryDecision: routed.categoryCode,
      crystalRoutingRuleId: routed.routingRuleId,
      crystalRoutingReason: routed.routingReason,
      crystalRoutingStrategy: routed.routingStrategy,
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
        crystalRoutingRuleId: undefined,
        crystalRoutingReason: undefined,
        crystalRoutingStrategy: undefined,
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
        crystalRoutingRuleId: undefined,
        crystalRoutingReason: undefined,
        crystalRoutingStrategy: undefined,
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
        crystalRoutingRuleId: undefined,
        crystalRoutingReason: undefined,
        crystalRoutingStrategy: undefined,
      };
    case ENERGY_TYPES.LUCK:
      return {
        code: "luck_fortune",
        meta,
        inferenceBranch: `thai_type_${t}`,
        crystalWeakProtectOutcome: null,
        crystalNonProtectRoutingReason: undefined,
        crystalPostResolverCategoryDecision: undefined,
        crystalRoutingRuleId: undefined,
        crystalRoutingReason: undefined,
        crystalRoutingStrategy: undefined,
      };
    case ENERGY_TYPES.BOOST:
      return {
        code: "luck_fortune",
        meta,
        inferenceBranch: `thai_type_${t}`,
        crystalWeakProtectOutcome: null,
        crystalNonProtectRoutingReason: undefined,
        crystalPostResolverCategoryDecision: undefined,
        crystalRoutingRuleId: undefined,
        crystalRoutingReason: undefined,
        crystalRoutingStrategy: undefined,
      };
    default:
      return {
        code: "luck_fortune",
        meta,
        inferenceBranch: "thai_type_default",
        crystalWeakProtectOutcome: null,
        crystalNonProtectRoutingReason: undefined,
        crystalPostResolverCategoryDecision: undefined,
        crystalRoutingRuleId: undefined,
        crystalRoutingReason: undefined,
        crystalRoutingStrategy: undefined,
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
 *   crystalRoutingRuleId: string | undefined,
 *   crystalRoutingReason: string | undefined,
 *   crystalRoutingStrategy: string | undefined,
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
    crystalRoutingRuleId: full.crystalRoutingRuleId,
    crystalRoutingReason: full.crystalRoutingReason,
    crystalRoutingStrategy: full.crystalRoutingStrategy,
  };
}

/**
 * Maps pipeline objectFamily slugs → canonical family for energy copy + report routing.
 *
 * **Primary lanes (2025):** `crystal` → Moldavite / crystal paths; everything Thai-amulet-class
 * routes to `sacred_amulet` (HTML/Flex amulet v1). Legacy slug `thai_amulet` normalizes here to
 * `sacred_amulet` so runtime does not select the old mobile-report primary path for new scans.
 * DB rows may still use `object_family = thai_amulet`; {@link getEnergyCopyTemplateRowsBundle} expands queries.
 *
 * **Scan V2 worker:** `generic`/unknown must not imply a user-facing lane — `resolveSupportedLaneStrict`
 * runs before report build and rejects when no Moldavite / sacred_amulet / crystal_bracelet proof exists.
 * This function may still map `generic` → `sacred_amulet` for DB energy-copy lookups; lane truth is enforced upstream.
 *
 * @param {string} raw
 * @returns {string}
 */
export function normalizeObjectFamilyForEnergyCopy(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if (s === "crystal") return "crystal";
  if (s === "global_symbol") return "global_symbol";
  /** @deprecated Legacy pipeline slug; maps to sacred_amulet primary lane (not old thai_amulet report path). */
  if (s === "thai_amulet") return "sacred_amulet";
  if (s === "somdej") return "sacred_amulet";
  if (s === "sacred_amulet") return "sacred_amulet";
  /** เครื่องราง / ตะกรุด — same primary lane as พระเครื่อง for Ener Scan routing. */
  if (s === "thai_talisman" || s === "takrud") return "sacred_amulet";
  if (!s || s === "generic") return "sacred_amulet";
  return "sacred_amulet";
}

/**
 * @param {string} categoryCode
 * @returns {string|null}
 */
export function pickAccentColorFromCategoryCode(categoryCode) {
  const c = String(categoryCode || "").trim();
  return ACCENT_COLOR_BY_CATEGORY_CODE[c] || null;
}
