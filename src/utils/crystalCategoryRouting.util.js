/**
 * Single place to tune crystal main-energy → energy_categories.code routing.
 * Rule table + ordered evaluation; resolver output (`resolveEnergyTypeMetaForFamily`) is an input, not re-implemented here.
 *
 * Tuning: adjust {@link CRYSTAL_ROUTING_RULES} rows and cue patterns only — avoid scattering new if/else in callers.
 */
import { ENERGY_TYPES } from "../services/flex/scanCopy.config.js";

/**
 * @typedef {Object} CrystalRoutingInput
 * @property {string} mainEnergyRaw — normalized single-line main energy
 * @property {string} resolvedEnergyType — meta.energyType (Thai key)
 * @property {"strong"|"weak"|"none"} [protectSignalStrength]
 * @property {string|null} [protectKeywordMatched]
 * @property {string|null} [protectWeakKeywordMatched] — meta.matchedKeyword when weak
 * @property {string} [resolvedEnergyTypeBeforeCategoryMap] — telemetry mirror
 * @property {boolean} hasSpiritualGrowthSignal — from {@link matchesCrystalSpiritualGrowthSignals}
 * @property {boolean} hasLuckWord — substring โชค / โชคลาภ
 * @property {boolean} hasMoneyWorkWord — money/work regex (no luck)
 */

/**
 * @typedef {Object} CrystalRoutingResult
 * @property {string} categoryCode
 * @property {string} routingRuleId — stable id for logs/QA (e.g. crystal_rg_weak_protect_charm)
 * @property {string} routingReason — short machine-readable reason (kept aligned with legacy diagnostics)
 * @property {"early_exit"|"resolver_direct"|"weak_protect"|"generic_boost"|"fallback"} routingStrategy
 * @property {string|null} crystalWeakProtectOutcome — category code when weak-protect path; else null
 * @property {string} inferenceBranchSuffix — suffix after `crystal_` (backward compatible)
 * @property {boolean} [needsLuckWordMetaOverride] — caller should force LUCK in meta for early luck word
 */

/** Exported for tests / docs — strategy labels only. */
export const CRYSTAL_ROUTING_STRATEGY = {
  EARLY_EXIT: "early_exit",
  RESOLVER_DIRECT: "resolver_direct",
  WEAK_PROTECT: "weak_protect",
  GENERIC_BOOST: "generic_boost",
  FALLBACK: "fallback",
};

/**
 * Ordered cue rows for weak-protect BOOST (first match wins).
 * @type {ReadonlyArray<{ id: string, test: (s: string) => boolean, categoryCode: string, reason: string }>}
 */
export const CRYSTAL_WEAK_PROTECT_CUE_RULES = [
  {
    id: "crystal_rg_weak_protect_charm_social",
    test: (s) =>
      /เสน่ห์|ดึงดูด|เข้าหา|ดึงคน|รับสังคม|น่าเข้าหา/.test(s),
    categoryCode: "charm",
    reason: "weak_protect_charm_cues",
  },
  {
    id: "crystal_rg_weak_protect_charm_metta",
    test: (s) => /เมตตา|อ่อนโยน|เปิดรับ/.test(s),
    categoryCode: "charm",
    reason: "weak_protect_charm_metta",
  },
  {
    id: "crystal_rg_weak_protect_luck",
    test: (s) =>
      /โชคลาภ|โชค|จังหวะ|เปิดทาง|ลาภ|โอกาส|จังหวะดี|flow/i.test(s),
    categoryCode: "luck_fortune",
    reason: "weak_protect_luck_cues",
  },
  {
    id: "crystal_rg_weak_protect_confidence_boundary",
    test: (s) =>
      /เกราะ|ปลอดภัย|มั่นคง|นิ่ง|ตั้งหลัก|สมดุล|บารมี|อำนาจ|ตัดสินใจ|หลักแน่น|สัญลักษณ์|เขตแดน|boundary|safe/i.test(
        s,
      ),
    categoryCode: "confidence",
    reason: "weak_protect_confidence_cues",
  },
];

/**
 * Ordered cue rows for generic BOOST (not weak protect).
 * @type {ReadonlyArray<{ id: string, test: (s: string) => boolean, categoryCode: string, reason: string }>}
 */
export const CRYSTAL_GENERIC_BOOST_CUE_RULES = [
  {
    id: "crystal_rg_generic_boost_empty",
    test: (s) => !s || s === "-",
    categoryCode: "confidence",
    reason: "generic_boost_empty_or_dash",
  },
  {
    id: "crystal_rg_generic_boost_luck",
    test: (s) =>
      /โชคลาภ|โชค|จังหวะ|ลาภ|เปิดทาง|โอกาส|จังหวะดี|flow/i.test(s),
    categoryCode: "luck_fortune",
    reason: "generic_boost_luck_cues",
  },
  {
    id: "crystal_rg_generic_boost_charm",
    test: (s) => /เสน่ห์|ดึงดูด|เมตตา/.test(s),
    categoryCode: "charm",
    reason: "generic_boost_charm_cues",
  },
  {
    id: "crystal_rg_generic_boost_confidence",
    test: (s) => /สมดุล|นิ่ง|บารมี|อำนาจ|ตั้งหลัก|มั่นใจ/.test(s),
    categoryCode: "confidence",
    reason: "generic_boost_confidence_cues",
  },
  {
    id: "crystal_rg_generic_boost_energy",
    test: (s) =>
      /กำลังใจ|ฮึด|ลุย|พลังบวก|สดใส|เติมพลัง|โอกาสดี/.test(s),
    categoryCode: "luck_fortune",
    reason: "generic_boost_energy_mood",
  },
];

/**
 * Top-level crystal rules (priority order). Only the first matching phase runs for early exits.
 * Resolver-direct rules apply when no early exit matched.
 *
 * @type {ReadonlyArray<{
 *   id: string,
 *   priority: number,
 *   strategy: string,
 *   when: (ctx: { input: CrystalRoutingInput, s: string, t: string }) => boolean,
 *   resolve: (ctx: { input: CrystalRoutingInput, s: string, t: string }) => CrystalRoutingResult
 * }>}
 */
export const CRYSTAL_ROUTING_RULES = [
  {
    id: "crystal_rg_spiritual_growth",
    priority: 10,
    strategy: CRYSTAL_ROUTING_STRATEGY.EARLY_EXIT,
    when: ({ input }) => input.hasSpiritualGrowthSignal === true,
    resolve: () => ({
      categoryCode: "spiritual_growth",
      routingRuleId: "crystal_rg_spiritual_growth",
      routingReason: "spiritual_growth_signals",
      routingStrategy: CRYSTAL_ROUTING_STRATEGY.EARLY_EXIT,
      crystalWeakProtectOutcome: null,
      inferenceBranchSuffix: "spiritual_growth",
      needsLuckWordMetaOverride: false,
    }),
  },
  {
    id: "crystal_rg_money_work",
    priority: 20,
    strategy: CRYSTAL_ROUTING_STRATEGY.EARLY_EXIT,
    when: ({ input }) =>
      input.hasMoneyWorkWord === true && input.hasLuckWord === false,
    resolve: () => ({
      categoryCode: "money_work",
      routingRuleId: "crystal_rg_money_work",
      routingReason: "early_money_work",
      routingStrategy: CRYSTAL_ROUTING_STRATEGY.EARLY_EXIT,
      crystalWeakProtectOutcome: null,
      inferenceBranchSuffix: "money_work",
      needsLuckWordMetaOverride: false,
    }),
  },
  {
    id: "crystal_rg_explicit_luck_word",
    priority: 30,
    strategy: CRYSTAL_ROUTING_STRATEGY.EARLY_EXIT,
    when: ({ input }) => input.hasLuckWord === true,
    resolve: () => ({
      categoryCode: "luck_fortune",
      routingRuleId: "crystal_rg_explicit_luck_word",
      routingReason: "early_luck_word",
      routingStrategy: CRYSTAL_ROUTING_STRATEGY.EARLY_EXIT,
      crystalWeakProtectOutcome: null,
      inferenceBranchSuffix: "luck_word",
      needsLuckWordMetaOverride: true,
    }),
  },
];

/**
 * @param {CrystalRoutingInput} input
 * @returns {CrystalRoutingResult}
 */
export function resolveCrystalCategoryRouting(input) {
  const s = String(input.mainEnergyRaw || "").replace(/\s+/g, " ").trim();
  const t = String(input.resolvedEnergyType || "");

  for (const rule of CRYSTAL_ROUTING_RULES) {
    if (rule.when({ input, s, t })) {
      return rule.resolve({ input, s, t });
    }
  }

  if (t === ENERGY_TYPES.PROTECT) {
    return {
      categoryCode: "protection",
      routingRuleId: "crystal_rg_resolver_protect",
      routingReason: "resolver_protect",
      routingStrategy: CRYSTAL_ROUTING_STRATEGY.RESOLVER_DIRECT,
      crystalWeakProtectOutcome: null,
      inferenceBranchSuffix: `type_${t}`,
    };
  }
  if (t === ENERGY_TYPES.POWER || t === ENERGY_TYPES.BALANCE) {
    return {
      categoryCode: "confidence",
      routingRuleId: "crystal_rg_resolver_power_balance",
      routingReason: "resolver_power_balance",
      routingStrategy: CRYSTAL_ROUTING_STRATEGY.RESOLVER_DIRECT,
      crystalWeakProtectOutcome: null,
      inferenceBranchSuffix: `type_${t}`,
    };
  }
  if (t === ENERGY_TYPES.KINDNESS || t === ENERGY_TYPES.ATTRACT) {
    return {
      categoryCode: "charm",
      routingRuleId: "crystal_rg_resolver_kindness_attract",
      routingReason: "resolver_kindness_attract",
      routingStrategy: CRYSTAL_ROUTING_STRATEGY.RESOLVER_DIRECT,
      crystalWeakProtectOutcome: null,
      inferenceBranchSuffix: `type_${t}`,
    };
  }
  if (t === ENERGY_TYPES.LUCK) {
    return {
      categoryCode: "luck_fortune",
      routingRuleId: "crystal_rg_resolver_luck",
      routingReason: "resolver_luck",
      routingStrategy: CRYSTAL_ROUTING_STRATEGY.RESOLVER_DIRECT,
      crystalWeakProtectOutcome: null,
      inferenceBranchSuffix: `type_${t}`,
    };
  }

  if (t === ENERGY_TYPES.BOOST) {
    const weak = input.protectSignalStrength === "weak";
    if (weak) {
      for (const row of CRYSTAL_WEAK_PROTECT_CUE_RULES) {
        if (row.test(s)) {
          const code = row.categoryCode;
          return {
            categoryCode: code,
            routingRuleId: row.id,
            routingReason: row.reason,
            routingStrategy: CRYSTAL_ROUTING_STRATEGY.WEAK_PROTECT,
            crystalWeakProtectOutcome: code,
            inferenceBranchSuffix: `weak_protect_${code}`,
          };
        }
      }
      return {
        categoryCode: "confidence",
        routingRuleId: "crystal_rg_weak_protect_default",
        routingReason: "weak_protect_default_confidence",
        routingStrategy: CRYSTAL_ROUTING_STRATEGY.WEAK_PROTECT,
        crystalWeakProtectOutcome: "confidence",
        inferenceBranchSuffix: "weak_protect_confidence",
      };
    }

    for (const row of CRYSTAL_GENERIC_BOOST_CUE_RULES) {
      if (row.test(s)) {
        const code = row.categoryCode;
        return {
          categoryCode: code,
          routingRuleId: row.id,
          routingReason: row.reason,
          routingStrategy: CRYSTAL_ROUTING_STRATEGY.GENERIC_BOOST,
          crystalWeakProtectOutcome: null,
          inferenceBranchSuffix: `generic_boost_${code}`,
        };
      }
    }
    return {
      categoryCode: "confidence",
      routingRuleId: "crystal_rg_default_confidence",
      routingReason: "crystal_default_confidence",
      routingStrategy: CRYSTAL_ROUTING_STRATEGY.FALLBACK,
      crystalWeakProtectOutcome: null,
      inferenceBranchSuffix: "default_confidence",
    };
  }

  return {
    categoryCode: "confidence",
    routingRuleId: "crystal_rg_fallback_confidence",
    routingReason: "crystal_default_confidence",
    routingStrategy: CRYSTAL_ROUTING_STRATEGY.FALLBACK,
    crystalWeakProtectOutcome: null,
    inferenceBranchSuffix: "default_confidence",
  };
}

/**
 * Build {@link CrystalRoutingInput} from normalized raw text + resolver meta + flags.
 *
 * @param {string} mainEnergyRaw
 * @param {object} meta — return shape of `resolveEnergyTypeMetaForFamily`
 * @param {{ hasSpiritualGrowthSignal: boolean, hasLuckWord: boolean, hasMoneyWorkWord: boolean }} flags
 * @returns {CrystalRoutingInput}
 */
export function buildCrystalRoutingInput(mainEnergyRaw, meta, flags) {
  return {
    mainEnergyRaw,
    resolvedEnergyType: meta.energyType,
    protectSignalStrength: meta.protectSignalStrength ?? "none",
    protectKeywordMatched:
      meta.energyType === ENERGY_TYPES.PROTECT ? meta.matchedKeyword : null,
    protectWeakKeywordMatched:
      meta.protectSignalStrength === "weak" ? meta.matchedKeyword : null,
    resolvedEnergyTypeBeforeCategoryMap: meta.resolvedEnergyTypeBeforeCategoryMap,
    hasSpiritualGrowthSignal: flags.hasSpiritualGrowthSignal,
    hasLuckWord: flags.hasLuckWord,
    hasMoneyWorkWord: flags.hasMoneyWorkWord,
  };
}

/**
 * Compact diagnostics key aligned with pre-table callers (`weak_protect_*`, `generic_boost_*`).
 *
 * @param {CrystalRoutingResult} r
 * @returns {string}
 */
export function crystalLegacyNonProtectRoutingReason(r) {
  if (r.routingStrategy === CRYSTAL_ROUTING_STRATEGY.WEAK_PROTECT) {
    const code = r.crystalWeakProtectOutcome || r.categoryCode;
    return `weak_protect_${code}`;
  }
  if (r.routingStrategy === CRYSTAL_ROUTING_STRATEGY.GENERIC_BOOST) {
    return `generic_boost_${r.categoryCode}`;
  }
  return r.routingReason;
}
