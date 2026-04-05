import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveEnergyTypeMetaForFamily } from "../src/services/flex/scanCopy.utils.js";
import {
  buildCrystalRoutingInput,
  crystalLegacyNonProtectRoutingReason,
  CRYSTAL_ROUTING_STRATEGY,
  resolveCrystalCategoryRouting,
} from "../src/utils/crystalCategoryRouting.util.js";
import {
  inferEnergyCategoryCodeFromMainEnergy,
  inferEnergyCategoryInferenceTrace,
  matchesCrystalSpiritualGrowthSignals,
} from "../src/utils/energyCategoryResolve.util.js";

/**
 * Mirrors flag computation in inferEnergyCategoryFull (crystal path).
 * @param {string} raw
 * @param {ReturnType<typeof resolveEnergyTypeMetaForFamily>} meta
 */
function routeLikeInference(raw, meta) {
  const hasLuckWord = raw.includes("โชคลาภ") || raw.includes("โชค");
  const hasMoneyWorkWord =
    /เงิน|งาน|ทรัพย์|รายได้|ดูดเงิน|การงาน/.test(raw);
  const hasSpiritualGrowthSignal = matchesCrystalSpiritualGrowthSignals(raw, {
    strictQuartz: true,
  });
  const input = buildCrystalRoutingInput(raw, meta, {
    hasSpiritualGrowthSignal,
    hasLuckWord,
    hasMoneyWorkWord,
  });
  return resolveCrystalCategoryRouting(input);
}

test("rule table: spiritual growth beats money/luck (explicit Moldavite)", () => {
  const raw = "Moldavite พลังสูง third eye";
  const meta = resolveEnergyTypeMetaForFamily(raw, "crystal");
  const r = routeLikeInference(raw, meta);
  assert.equal(r.categoryCode, "spiritual_growth");
  assert.equal(r.routingRuleId, "crystal_rg_spiritual_growth");
  assert.equal(r.routingStrategy, CRYSTAL_ROUTING_STRATEGY.EARLY_EXIT);
});

test("rule table: money/work without luck", () => {
  const raw = "เด่นเรื่องเงินและงาน";
  const meta = resolveEnergyTypeMetaForFamily(raw, "crystal");
  const r = routeLikeInference(raw, meta);
  assert.equal(r.categoryCode, "money_work");
  assert.equal(r.routingRuleId, "crystal_rg_money_work");
});

test("rule table: explicit luck word early exit", () => {
  const raw = "พลังโชคลาภและคุ้มครอง";
  const meta = resolveEnergyTypeMetaForFamily(raw, "crystal");
  const r = routeLikeInference(raw, meta);
  assert.equal(r.categoryCode, "luck_fortune");
  assert.equal(r.routingRuleId, "crystal_rg_explicit_luck_word");
  assert.equal(r.needsLuckWordMetaOverride, true);
});

test("rule table: strong protect → protection", () => {
  const raw = "พลังปกป้อง (กันแรงลบ)";
  const meta = resolveEnergyTypeMetaForFamily(raw, "crystal");
  const r = routeLikeInference(raw, meta);
  assert.equal(r.categoryCode, "protection");
  assert.equal(r.routingRuleId, "crystal_rg_resolver_protect");
  assert.equal(r.routingStrategy, CRYSTAL_ROUTING_STRATEGY.RESOLVER_DIRECT);
});

test("rule table: weak protect + boundary → confidence + rule id", () => {
  const raw =
    "พลังคุ้มครอง (เน้นเกราะใจและความปลอดภัยเชิงสัญลักษณ์)";
  const meta = resolveEnergyTypeMetaForFamily(raw, "crystal");
  const r = routeLikeInference(raw, meta);
  assert.equal(r.categoryCode, "confidence");
  assert.equal(r.routingStrategy, CRYSTAL_ROUTING_STRATEGY.WEAK_PROTECT);
  assert.equal(r.routingRuleId, "crystal_rg_weak_protect_confidence_boundary");
  assert.equal(crystalLegacyNonProtectRoutingReason(r), "weak_protect_confidence");
});

test("rule table: weak protect + charm (resolver stays BOOST weak; cue เข้าหา)", () => {
  const raw = "คุ้มครองแบบเน้นเข้าหาในสังคม";
  const meta = resolveEnergyTypeMetaForFamily(raw, "crystal");
  const r = routeLikeInference(raw, meta);
  assert.equal(r.categoryCode, "charm");
  assert.equal(r.routingRuleId, "crystal_rg_weak_protect_charm_social");
});

test("rule table: weak protect + luck wording → luck_fortune", () => {
  const raw = "คุ้มครองและจังหวะดี";
  const meta = resolveEnergyTypeMetaForFamily(raw, "crystal");
  const r = routeLikeInference(raw, meta);
  assert.equal(r.categoryCode, "luck_fortune");
  assert.equal(r.routingRuleId, "crystal_rg_weak_protect_luck");
});

test("rule table: generic BOOST empty → confidence", () => {
  const raw = "-";
  const meta = resolveEnergyTypeMetaForFamily(raw, "crystal");
  const r = routeLikeInference(raw, meta);
  assert.equal(r.categoryCode, "confidence");
  assert.equal(r.routingRuleId, "crystal_rg_generic_boost_empty");
  assert.equal(r.routingStrategy, CRYSTAL_ROUTING_STRATEGY.GENERIC_BOOST);
});

test("integration: trace exposes crystalRoutingRuleId on crystal", () => {
  const tr = inferEnergyCategoryInferenceTrace("คุ้มครอง", "crystal");
  assert.equal(tr.code, "confidence");
  assert.equal(tr.crystalRoutingRuleId, "crystal_rg_weak_protect_default");
  assert.equal(tr.crystalRoutingStrategy, CRYSTAL_ROUTING_STRATEGY.WEAK_PROTECT);
});

test("integration: thai คุ้มครอง unchanged (protection)", () => {
  assert.equal(
    inferEnergyCategoryCodeFromMainEnergy("คุ้มครอง", "thai_talisman"),
    "protection",
  );
  const tr = inferEnergyCategoryInferenceTrace("คุ้มครอง", "thai_talisman");
  assert.equal(tr.crystalRoutingRuleId, undefined);
});

test("integration: thai บารมี / อำนาจ → confidence", () => {
  assert.equal(
    inferEnergyCategoryCodeFromMainEnergy("บารมีและอำนาจ", "thai_amulet"),
    "confidence",
  );
});
