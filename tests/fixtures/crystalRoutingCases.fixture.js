/**
 * Frozen regression cases for crystal routing + Thai baseline (non-crystal).
 * Intention: any change to rule order, regex, or resolver that shifts outcomes should
 * fail tests until expectations are updated deliberately.
 *
 * @typedef {Object} CrystalRoutingFrozenCase
 * @property {string} id — stable id for test titles
 * @property {string} objectFamily — pipeline slug e.g. crystal, thai_talisman, thai_amulet
 * @property {string} mainEnergy
 * @property {string} expectCategoryCode
 * @property {string | null | undefined} expectCrystalRoutingRuleId — `null`/`undefined` means must be absent for non-crystal
 * @property {boolean} [expectCrystalTrace] — if true, assert crystal routing fields on trace (default: true for crystal)
 */

/** @type {CrystalRoutingFrozenCase[]} */
export const CRYSTAL_ROUTING_FROZEN_CASES = [
  {
    id: "01_strong_protect_crystal",
    objectFamily: "crystal",
    mainEnergy: "พลังปกป้อง (กันแรงลบ)",
    expectCategoryCode: "protection",
    expectCrystalRoutingRuleId: "crystal_rg_resolver_protect",
  },
  {
    id: "02_weak_protect_boundary",
    objectFamily: "crystal",
    mainEnergy:
      "พลังคุ้มครอง (เน้นเกราะใจและความปลอดภัยเชิงสัญลักษณ์)",
    expectCategoryCode: "confidence",
    expectCrystalRoutingRuleId: "crystal_rg_weak_protect_confidence_boundary",
  },
  {
    id: "03_weak_protect_charm",
    objectFamily: "crystal",
    mainEnergy: "คุ้มครองแบบเน้นเข้าหาในสังคม",
    expectCategoryCode: "charm",
    expectCrystalRoutingRuleId: "crystal_rg_weak_protect_charm_social",
  },
  {
    id: "04_weak_protect_luck_cues",
    objectFamily: "crystal",
    mainEnergy: "คุ้มครองและจังหวะดี",
    expectCategoryCode: "luck_fortune",
    expectCrystalRoutingRuleId: "crystal_rg_weak_protect_luck",
  },
  {
    id: "05_generic_boost_empty",
    objectFamily: "crystal",
    mainEnergy: "-",
    expectCategoryCode: "confidence",
    expectCrystalRoutingRuleId: "crystal_rg_generic_boost_empty",
  },
  {
    id: "06_explicit_luck_word",
    objectFamily: "crystal",
    mainEnergy: "พลังโชคลาภและคุ้มครอง",
    expectCategoryCode: "luck_fortune",
    expectCrystalRoutingRuleId: "crystal_rg_explicit_luck_word",
  },
  {
    id: "07_money_work",
    objectFamily: "crystal",
    mainEnergy: "เด่นเรื่องเงินและงาน",
    expectCategoryCode: "money_work",
    expectCrystalRoutingRuleId: "crystal_rg_money_work",
  },
  {
    id: "08_spiritual_growth",
    objectFamily: "crystal",
    mainEnergy: "Moldavite พลังสูง third eye",
    expectCategoryCode: "spiritual_growth",
    expectCrystalRoutingRuleId: "crystal_rg_spiritual_growth",
  },
  {
    id: "09_thai_khumkhran_protection",
    objectFamily: "thai_talisman",
    mainEnergy: "คุ้มครอง",
    expectCategoryCode: "protection",
    expectCrystalRoutingRuleId: null,
    expectCrystalTrace: false,
  },
  {
    id: "10_thai_barami_confidence",
    objectFamily: "thai_amulet",
    mainEnergy: "บารมีและอำนาจ",
    expectCategoryCode: "confidence",
    expectCrystalRoutingRuleId: null,
    expectCrystalTrace: false,
  },
];
