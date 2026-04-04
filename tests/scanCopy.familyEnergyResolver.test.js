import { test } from "node:test";
import assert from "node:assert/strict";
import { ENERGY_TYPES } from "../src/services/flex/scanCopy.config.js";
import { resolveEnergyTypeMetaForFamily } from "../src/services/flex/scanCopy.utils.js";

test("thai_legacy: คุ้มครอง maps to PROTECT (unchanged)", () => {
  const m = resolveEnergyTypeMetaForFamily("เน้นคุ้มครอง", "thai_amulet");
  assert.equal(m.energyType, ENERGY_TYPES.PROTECT);
  assert.equal(m.protectSignalStrength, "strong");
  assert.equal(m.energyTypeResolverMode, "thai_legacy");
});

test("crystal_conservative: คุ้มครอง alone is weak → BOOST not PROTECT", () => {
  const m = resolveEnergyTypeMetaForFamily("คุ้มครอง", "crystal");
  assert.equal(m.energyType, ENERGY_TYPES.BOOST);
  assert.equal(m.protectSignalStrength, "weak");
  assert.equal(m.matchedKeyword, "คุ้มครอง");
});

test("crystal_conservative: พลังปกป้อง is strong PROTECT", () => {
  const m = resolveEnergyTypeMetaForFamily("พลังปกป้อง (ทดสอบ)", "crystal");
  assert.equal(m.energyType, ENERGY_TYPES.PROTECT);
  assert.equal(m.protectSignalStrength, "strong");
});

test("crystal_conservative: เสน่ห์ wins over trailing คุ้มครอง", () => {
  const m = resolveEnergyTypeMetaForFamily("เสน่ห์และคุ้มครอง", "crystal");
  assert.equal(m.energyType, ENERGY_TYPES.ATTRACT);
  assert.equal(m.protectSignalStrength, "none");
});

test("crystal_conservative: สมดุล wins over คุ้มครองเบา ๆ", () => {
  const m = resolveEnergyTypeMetaForFamily("สมดุลและคุ้มครองเบา ๆ", "crystal");
  assert.equal(m.energyType, ENERGY_TYPES.BALANCE);
});
