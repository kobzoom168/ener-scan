import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCrystalRoutingWordingMetrics,
  DASHBOARD_METRIC_VERSION,
  ROUTING_WORDING_ALIGNMENT_STATUS,
  ROUTING_WORDING_MISMATCH_SEVERITY,
  ROUTING_WORDING_MISMATCH_TYPE,
} from "../src/utils/crystalRoutingWordingMetrics.util.js";

const DASHBOARD_KEYS = [
  "routingWordingAlignmentStatus",
  "routingWordingMismatchType",
  "routingWordingMismatchSeverity",
  "routingWordingDashboardGroup",
  "crystalRoutingRuleId",
  "crystalRoutingStrategy",
  "energyCategoryCode",
  "visibleWordingCategoryUsed",
  "visibleWordingDecisionSource",
  "visibleWordingCrystalSpecific",
  "visibleWordingFallbackLevel",
  "protectSignalStrength",
];

test("buildCrystalRoutingWordingMetrics: table-driven cases", () => {
  const cases = [
    {
      name: "crystal db + rule + same category → aligned",
      input: {
        objectFamily: "crystal",
        energyCategoryCode: "confidence",
        crystalRoutingRuleId: "crystal_rg_weak_protect_default",
        crystalRoutingStrategy: "weak_protect",
        crystalRoutingReason: "weak_protect_default_confidence",
        protectSignalStrength: "weak",
        visibleWordingDecisionSource: "db_crystal",
        visibleWordingObjectFamilyUsed: "crystal",
        visibleWordingCrystalSpecific: true,
        visibleWordingCategoryUsed: "confidence",
        visibleWordingFallbackLevel: 0,
      },
      expect: {
        routingWordingAlignmentStatus: ROUTING_WORDING_ALIGNMENT_STATUS.ALIGNED,
        routingWordingMismatchType: ROUTING_WORDING_MISMATCH_TYPE.NONE,
        routingWordingMismatchSeverity: ROUTING_WORDING_MISMATCH_SEVERITY.NONE,
        routingWordingDashboardGroup: "crystal_aligned",
      },
    },
    {
      name: "crystal code_bank_crystal_first + crystalSpecific true → aligned",
      input: {
        objectFamily: "crystal",
        energyCategoryCode: "protection",
        crystalRoutingRuleId: "crystal_rg_resolver_protect",
        crystalRoutingStrategy: "resolver_direct",
        protectSignalStrength: "strong",
        visibleWordingDecisionSource: "code_bank_crystal_first",
        visibleWordingObjectFamilyUsed: "crystal",
        visibleWordingCrystalSpecific: true,
        visibleWordingCategoryUsed: "protection",
        visibleWordingFallbackLevel: null,
      },
      expect: {
        routingWordingAlignmentStatus: ROUTING_WORDING_ALIGNMENT_STATUS.ALIGNED,
        routingWordingMismatchType: ROUTING_WORDING_MISMATCH_TYPE.NONE,
        routingWordingDashboardGroup: "crystal_aligned",
      },
    },
    {
      name: "crystal code_bank_crystal_first + crystalSpecific false → soft unexpected_generic_fallback",
      input: {
        objectFamily: "crystal",
        energyCategoryCode: "luck_fortune",
        crystalRoutingRuleId: "crystal_rg_resolver_luck",
        crystalRoutingStrategy: "resolver_direct",
        protectSignalStrength: "none",
        visibleWordingDecisionSource: "code_bank_crystal_first",
        visibleWordingObjectFamilyUsed: "crystal",
        visibleWordingCrystalSpecific: false,
        visibleWordingCategoryUsed: "luck_fortune",
        visibleWordingFallbackLevel: null,
      },
      expect: {
        routingWordingAlignmentStatus: ROUTING_WORDING_ALIGNMENT_STATUS.SOFT_MISMATCH,
        routingWordingMismatchType:
          ROUTING_WORDING_MISMATCH_TYPE.UNEXPECTED_GENERIC_FALLBACK,
        routingWordingMismatchSeverity: ROUTING_WORDING_MISMATCH_SEVERITY.MEDIUM,
        routingWordingDashboardGroup: "crystal_soft_mismatch",
      },
    },
    {
      name: "crystal routing but wording family thai_amulet → hard object_family_mismatch",
      input: {
        objectFamily: "crystal",
        energyCategoryCode: "confidence",
        crystalRoutingRuleId: "crystal_rg_default_confidence",
        crystalRoutingStrategy: "fallback",
        protectSignalStrength: "none",
        visibleWordingDecisionSource: "db_family",
        visibleWordingObjectFamilyUsed: "thai_amulet",
        visibleWordingCrystalSpecific: false,
        visibleWordingCategoryUsed: "confidence",
        visibleWordingFallbackLevel: 0,
      },
      expect: {
        routingWordingAlignmentStatus: ROUTING_WORDING_ALIGNMENT_STATUS.HARD_MISMATCH,
        routingWordingMismatchType: ROUTING_WORDING_MISMATCH_TYPE.OBJECT_FAMILY_MISMATCH,
        routingWordingMismatchSeverity: ROUTING_WORDING_MISMATCH_SEVERITY.HIGH,
        routingWordingDashboardGroup: "crystal_hard_mismatch",
      },
    },
    {
      name: "crystal category vs wording category → hard category_mismatch",
      input: {
        objectFamily: "crystal",
        energyCategoryCode: "protection",
        crystalRoutingRuleId: "crystal_rg_resolver_protect",
        crystalRoutingStrategy: "resolver_direct",
        protectSignalStrength: "strong",
        visibleWordingDecisionSource: "db_crystal",
        visibleWordingObjectFamilyUsed: "crystal",
        visibleWordingCrystalSpecific: true,
        visibleWordingCategoryUsed: "money_work",
        visibleWordingFallbackLevel: 0,
      },
      expect: {
        routingWordingAlignmentStatus: ROUTING_WORDING_ALIGNMENT_STATUS.HARD_MISMATCH,
        routingWordingMismatchType: ROUTING_WORDING_MISMATCH_TYPE.CATEGORY_MISMATCH,
        routingWordingDashboardGroup: "crystal_hard_mismatch",
      },
    },
    {
      name: "thai path → not_applicable (no mismatch noise)",
      input: {
        objectFamily: "thai_amulet",
        energyCategoryCode: "protection",
        crystalRoutingRuleId: null,
        visibleWordingDecisionSource: "db_family",
        visibleWordingObjectFamilyUsed: "thai_amulet",
        visibleWordingCrystalSpecific: false,
        visibleWordingCategoryUsed: "protection",
        visibleWordingFallbackLevel: 0,
      },
      expect: {
        routingWordingAlignmentStatus: ROUTING_WORDING_ALIGNMENT_STATUS.NOT_APPLICABLE,
        routingWordingMismatchType: ROUTING_WORDING_MISMATCH_TYPE.NOT_APPLICABLE,
        routingWordingMismatchSeverity: ROUTING_WORDING_MISMATCH_SEVERITY.NONE,
        routingWordingDashboardGroup: "non_crystal",
      },
    },
    {
      name: "crystal rule but missing visible wording category → routing_missing_wording_meta",
      input: {
        objectFamily: "crystal",
        energyCategoryCode: "confidence",
        crystalRoutingRuleId: "crystal_rg_weak_protect_default",
        crystalRoutingStrategy: "weak_protect",
        visibleWordingDecisionSource: "db_crystal",
        visibleWordingObjectFamilyUsed: "crystal",
        visibleWordingCrystalSpecific: true,
        visibleWordingCategoryUsed: "",
        visibleWordingFallbackLevel: 0,
      },
      expect: {
        routingWordingAlignmentStatus: ROUTING_WORDING_ALIGNMENT_STATUS.HARD_MISMATCH,
        routingWordingMismatchType:
          ROUTING_WORDING_MISMATCH_TYPE.ROUTING_MISSING_WORDING_META,
        routingWordingDashboardGroup: "crystal_meta_gap",
      },
    },
    {
      name: "crystal rule + categories match but empty wording object family → routing_missing_wording_meta",
      input: {
        objectFamily: "crystal",
        energyCategoryCode: "charm",
        crystalRoutingRuleId: "crystal_rg_weak_protect_charm_social",
        crystalRoutingStrategy: "weak_protect",
        visibleWordingDecisionSource: "db_crystal",
        visibleWordingObjectFamilyUsed: "",
        visibleWordingCrystalSpecific: true,
        visibleWordingCategoryUsed: "charm",
        visibleWordingFallbackLevel: 0,
      },
      expect: {
        routingWordingAlignmentStatus: ROUTING_WORDING_ALIGNMENT_STATUS.HARD_MISMATCH,
        routingWordingMismatchType:
          ROUTING_WORDING_MISMATCH_TYPE.ROUTING_MISSING_WORDING_META,
        routingWordingDashboardGroup: "crystal_meta_gap",
      },
    },
    {
      name: "category present but no crystal_rg rule id → wording_missing_routing_meta",
      input: {
        objectFamily: "crystal",
        energyCategoryCode: "confidence",
        crystalRoutingRuleId: "legacy_or_unknown",
        crystalRoutingStrategy: "",
        visibleWordingDecisionSource: "code_bank_crystal_first",
        visibleWordingObjectFamilyUsed: "crystal",
        visibleWordingCrystalSpecific: true,
        visibleWordingCategoryUsed: "confidence",
        visibleWordingFallbackLevel: null,
      },
      expect: {
        routingWordingAlignmentStatus: ROUTING_WORDING_ALIGNMENT_STATUS.SOFT_MISMATCH,
        routingWordingMismatchType:
          ROUTING_WORDING_MISMATCH_TYPE.WORDING_MISSING_ROUTING_META,
        routingWordingDashboardGroup: "crystal_meta_gap",
      },
    },
    {
      name: "db_crystal protect/confidence style: db_crystal + !crystalSpecific → soft crystal_specificity_mismatch",
      input: {
        objectFamily: "crystal",
        energyCategoryCode: "confidence",
        crystalRoutingRuleId: "crystal_rg_weak_protect_default",
        crystalRoutingStrategy: "weak_protect",
        protectSignalStrength: "weak",
        visibleWordingDecisionSource: "db_crystal",
        visibleWordingObjectFamilyUsed: "crystal",
        visibleWordingCrystalSpecific: false,
        visibleWordingCategoryUsed: "confidence",
        visibleWordingFallbackLevel: 1,
      },
      expect: {
        routingWordingAlignmentStatus: ROUTING_WORDING_ALIGNMENT_STATUS.SOFT_MISMATCH,
        routingWordingMismatchType:
          ROUTING_WORDING_MISMATCH_TYPE.CRYSTAL_SPECIFICITY_MISMATCH,
        routingWordingDashboardGroup: "crystal_soft_mismatch",
      },
    },
    {
      name: "fallback_overuse on db crystal path",
      input: {
        objectFamily: "crystal",
        energyCategoryCode: "spiritual_growth",
        crystalRoutingRuleId: "crystal_rg_spiritual_growth",
        crystalRoutingStrategy: "early_exit",
        visibleWordingDecisionSource: "db_crystal",
        visibleWordingObjectFamilyUsed: "crystal",
        visibleWordingCrystalSpecific: true,
        visibleWordingCategoryUsed: "spiritual_growth",
        visibleWordingFallbackLevel: 2,
      },
      expect: {
        routingWordingAlignmentStatus: ROUTING_WORDING_ALIGNMENT_STATUS.SOFT_MISMATCH,
        routingWordingMismatchType: ROUTING_WORDING_MISMATCH_TYPE.FALLBACK_OVERUSE,
        routingWordingMismatchSeverity: ROUTING_WORDING_MISMATCH_SEVERITY.MEDIUM,
        routingWordingDashboardGroup: "crystal_soft_mismatch",
      },
    },
  ];

  for (const c of cases) {
    const out = buildCrystalRoutingWordingMetrics(c.input);
    for (const [k, v] of Object.entries(c.expect)) {
      assert.equal(
        out[k],
        v,
        `${c.name}: expected ${k}=${v}, got ${out[k]}`,
      );
    }
  }
});

test("buildCrystalRoutingWordingMetrics: dashboard field keys stable", () => {
  const out = buildCrystalRoutingWordingMetrics({
    objectFamily: "crystal",
    energyCategoryCode: "confidence",
    crystalRoutingRuleId: "crystal_rg_default_confidence",
    crystalRoutingStrategy: "fallback",
    protectSignalStrength: "none",
    visibleWordingDecisionSource: "db_crystal",
    visibleWordingObjectFamilyUsed: "crystal",
    visibleWordingCrystalSpecific: true,
    visibleWordingCategoryUsed: "confidence",
    visibleWordingFallbackLevel: 0,
  });
  for (const k of DASHBOARD_KEYS) {
    assert.ok(k in out, `missing dashboard key: ${k}`);
  }
  assert.equal(out.dashboardMetricVersion, DASHBOARD_METRIC_VERSION);
});
