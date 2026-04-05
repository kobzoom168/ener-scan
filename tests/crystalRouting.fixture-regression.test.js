import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveEnergyTypeMetaForFamily } from "../src/services/flex/scanCopy.utils.js";
import {
  buildCrystalRoutingInput,
  CRYSTAL_ROUTING_STRATEGY,
  resolveCrystalCategoryRouting,
} from "../src/utils/crystalCategoryRouting.util.js";
import {
  inferEnergyCategoryCodeFromMainEnergy,
  inferEnergyCategoryInferenceTrace,
  matchesCrystalSpiritualGrowthSignals,
} from "../src/utils/energyCategoryResolve.util.js";
import { CRYSTAL_ROUTING_FROZEN_CASES } from "./fixtures/crystalRoutingCases.fixture.js";

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

for (const c of CRYSTAL_ROUTING_FROZEN_CASES) {
  test(`frozen fixture ${c.id}: category + routing id`, () => {
    const code = inferEnergyCategoryCodeFromMainEnergy(
      c.mainEnergy,
      c.objectFamily,
    );
    assert.equal(
      code,
      c.expectCategoryCode,
      `${c.id}: category code`,
    );

    const isCrystal =
      String(c.objectFamily || "").toLowerCase() === "crystal";
    if (isCrystal) {
      const meta = resolveEnergyTypeMetaForFamily(c.mainEnergy, c.objectFamily);
      const routed = routeLikeInference(c.mainEnergy, meta);
      assert.equal(
        routed.routingRuleId,
        c.expectCrystalRoutingRuleId,
        `${c.id}: routingRuleId`,
      );
      assert.equal(routed.categoryCode, c.expectCategoryCode);
    } else {
      assert.equal(
        c.expectCrystalRoutingRuleId,
        null,
        `${c.id}: thai fixture must not expect crystal rule id`,
      );
    }
  });
}

test("crystal inference trace: diagnostic fields present and coherent (weak protect)", () => {
  const mainEnergy = "คุ้มครอง";
  const tr = inferEnergyCategoryInferenceTrace(mainEnergy, "crystal");

  assert.equal(typeof tr.crystalRoutingRuleId, "string");
  assert.ok(tr.crystalRoutingRuleId.length > 0);
  assert.equal(typeof tr.crystalRoutingReason, "string");
  assert.equal(typeof tr.crystalRoutingStrategy, "string");
  assert.ok(
    [
      CRYSTAL_ROUTING_STRATEGY.EARLY_EXIT,
      CRYSTAL_ROUTING_STRATEGY.RESOLVER_DIRECT,
      CRYSTAL_ROUTING_STRATEGY.WEAK_PROTECT,
      CRYSTAL_ROUTING_STRATEGY.GENERIC_BOOST,
      CRYSTAL_ROUTING_STRATEGY.FALLBACK,
    ].includes(tr.crystalRoutingStrategy),
  );
  assert.equal(tr.crystalPostResolverCategoryDecision, tr.code);
  assert.equal(typeof tr.protectSignalStrength, "string");
  assert.equal(tr.protectSignalStrength, "weak");
  assert.equal(tr.protectWeakKeywordMatched, "คุ้มครอง");
  assert.equal(typeof tr.resolvedEnergyTypeBeforeCategoryMap, "string");
  assert.ok(tr.resolvedEnergyTypeBeforeCategoryMap.length > 0);
});

test("thai inference trace: crystal routing fields absent (no false positives)", () => {
  const tr = inferEnergyCategoryInferenceTrace("คุ้มครอง", "thai_talisman");
  assert.equal(tr.code, "protection");
  assert.equal(tr.crystalRoutingRuleId, undefined);
  assert.equal(tr.crystalRoutingReason, undefined);
  assert.equal(tr.crystalRoutingStrategy, undefined);
  assert.equal(tr.crystalPostResolverCategoryDecision, undefined);
  assert.equal(tr.protectSignalStrength, "strong");
  assert.equal(typeof tr.resolvedEnergyTypeBeforeCategoryMap, "string");
});
