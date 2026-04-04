import { test } from "node:test";
import assert from "node:assert/strict";
import {
  inferEnergyCategoryCodeFromMainEnergy,
  inferEnergyCategoryInferenceTrace,
  extractCrystalSpiritualSignalTags,
  normalizeObjectFamilyForEnergyCopy,
  pickAccentColorFromCategoryCode,
  ACCENT_COLOR_BY_CATEGORY_CODE,
  resolveCrystalMode,
} from "../src/utils/energyCategoryResolve.util.js";
import { getFallbackFlexSurfaceLines } from "../src/utils/reports/flexSummaryShortCopy.js";
import { pickMainEnergyColor } from "../src/services/flex/flex.utils.js";

test("crystal + protection", () => {
  assert.equal(
    inferEnergyCategoryCodeFromMainEnergy("พลังหลัก ปกป้องและคุ้มครอง", "crystal"),
    "protection",
  );
  assert.equal(normalizeObjectFamilyForEnergyCopy("crystal"), "crystal");
  assert.equal(pickAccentColorFromCategoryCode("protection"), "#D4AF37");
});

test("crystal: weak คุ้มครอง alone → luck_fortune (not protection)", () => {
  assert.equal(
    inferEnergyCategoryCodeFromMainEnergy("คุ้มครอง", "crystal"),
    "luck_fortune",
  );
  const tr = inferEnergyCategoryInferenceTrace("คุ้มครอง", "crystal");
  assert.equal(tr.protectSignalStrength, "weak");
  assert.equal(tr.protectWeakKeywordMatched, "คุ้มครอง");
  assert.equal(tr.protectKeywordMatched, null);
  assert.equal(tr.energyTypeResolverMode, "crystal_conservative");
});

test("crystal: พลังปกป้อง → protection + strong signal", () => {
  assert.equal(
    inferEnergyCategoryCodeFromMainEnergy("พลังปกป้อง (กันแรงลบ)", "crystal"),
    "protection",
  );
  const tr = inferEnergyCategoryInferenceTrace("พลังปกป้อง (กันแรงลบ)", "crystal");
  assert.equal(tr.protectSignalStrength, "strong");
  assert.equal(tr.protectKeywordMatched, "พลังปกป้อง");
});

test("crystal: ป้องกันสิ่งรบกวน → protection", () => {
  assert.equal(
    inferEnergyCategoryCodeFromMainEnergy("ป้องกันสิ่งรบกวนรอบตัว", "crystal"),
    "protection",
  );
});

test("crystal: สมดุลและคุ้มครองเบา ๆ → confidence", () => {
  assert.equal(
    inferEnergyCategoryCodeFromMainEnergy("สมดุลและคุ้มครองเบา ๆ", "crystal"),
    "confidence",
  );
});

test("crystal: โชคและคุ้มครอง → luck_fortune (luck word branch)", () => {
  assert.equal(
    inferEnergyCategoryCodeFromMainEnergy("โชคและคุ้มครอง", "crystal"),
    "luck_fortune",
  );
  const tr = inferEnergyCategoryInferenceTrace("โชคและคุ้มครอง", "crystal");
  assert.equal(tr.inferenceBranch, "crystal_luck_word");
});

test("crystal: เสน่ห์และคุ้มครอง → charm", () => {
  assert.equal(
    inferEnergyCategoryCodeFromMainEnergy("เสน่ห์และคุ้มครอง", "crystal"),
    "charm",
  );
});

test("thai_amulet: บารมี → confidence", () => {
  assert.equal(
    inferEnergyCategoryCodeFromMainEnergy("บารมีนิ่ง", "thai_amulet"),
    "confidence",
  );
});

test("thai_amulet: อำนาจ → confidence", () => {
  assert.equal(
    inferEnergyCategoryCodeFromMainEnergy("อำนาจในการตัดสินใจ", "thai_amulet"),
    "confidence",
  );
});

test("thai_amulet: คุ้มครอง → protection (legacy)", () => {
  assert.equal(
    inferEnergyCategoryCodeFromMainEnergy("เน้นคุ้มครอง", "thai_amulet"),
    "protection",
  );
  const tr = inferEnergyCategoryInferenceTrace("เน้นคุ้มครอง", "thai_amulet");
  assert.equal(tr.protectSignalStrength, "strong");
  assert.equal(tr.energyTypeResolverMode, "thai_legacy");
});

test("thai_talisman: คุ้มครอง → protection", () => {
  assert.equal(
    inferEnergyCategoryCodeFromMainEnergy("คุ้มครอง", "thai_talisman"),
    "protection",
  );
});

test("crystal + confidence (อำนาจ / บารมี)", () => {
  assert.equal(
    inferEnergyCategoryCodeFromMainEnergy("พลังอำนาจและบารมี", "crystal"),
    "confidence",
  );
  assert.equal(ACCENT_COLOR_BY_CATEGORY_CODE.confidence, "#C62828");
});

test("crystal + money_work (เงิน/งาน ไม่เน้นโชค)", () => {
  assert.equal(
    inferEnergyCategoryCodeFromMainEnergy("เด่นเรื่องเงินและงาน", "crystal"),
    "money_work",
  );
  assert.equal(pickAccentColorFromCategoryCode("money_work"), "#2E7D32");
});

test("crystal + luck_fortune (โชคลาภ)", () => {
  assert.equal(
    inferEnergyCategoryCodeFromMainEnergy("พลังโชคลาภเด่น", "crystal"),
    "luck_fortune",
  );
});

test("thai_amulet + protection", () => {
  assert.equal(
    inferEnergyCategoryCodeFromMainEnergy("เน้นป้องกันและคุ้มครอง", "generic"),
    "protection",
  );
  assert.equal(normalizeObjectFamilyForEnergyCopy("somdej"), "thai_amulet");
});

test("thai_amulet + confidence (บารมี)", () => {
  assert.equal(
    inferEnergyCategoryCodeFromMainEnergy("บารมีและอำนาจ", ""),
    "confidence",
  );
});

test("thai_amulet + metta (เมตตา / kindness)", () => {
  assert.equal(
    inferEnergyCategoryCodeFromMainEnergy("เมตตาและความอ่อนโยน", "thai_amulet"),
    "metta",
  );
  assert.equal(
    inferEnergyCategoryCodeFromMainEnergy("เสน่ห์และดึงดูด", "thai_amulet"),
    "metta",
  );
});

test("thai_amulet + luck_fortune", () => {
  assert.equal(
    inferEnergyCategoryCodeFromMainEnergy("พลังโชคลาภ", "thai_amulet"),
    "luck_fortune",
  );
});

test("crystal + spiritual_growth (Moldavite / chakra / หยั่งรู้)", () => {
  assert.equal(
    inferEnergyCategoryCodeFromMainEnergy(
      "Moldavite high vibration third eye",
      "crystal",
    ),
    "spiritual_growth",
  );
  assert.equal(
    inferEnergyCategoryCodeFromMainEnergy(
      "Clear quartz จักระที่ 6 และ 7 หยั่งรู้",
      "crystal",
    ),
    "spiritual_growth",
  );
  assert.equal(
    inferEnergyCategoryCodeFromMainEnergy(
      "เด่นเรื่องจิตวิญญาณ ยกระดับตัวเอง",
      "crystal",
    ),
    "spiritual_growth",
  );
  assert.equal(pickAccentColorFromCategoryCode("spiritual_growth"), "#3949AB");
});

test("thai_amulet must not resolve to spiritual_growth", () => {
  assert.notEqual(
    inferEnergyCategoryCodeFromMainEnergy(
      "Moldavite quartz หยั่งรู้",
      "thai_amulet",
    ),
    "spiritual_growth",
  );
});

test("getFallbackFlexSurfaceLines: spiritual_growth + crystal matches DB seed", () => {
  const x = getFallbackFlexSurfaceLines("spiritual_growth", "crystal");
  assert.equal(
    x.headline,
    "เด่นเรื่องพลังงานสูงและการยกระดับตัวเอง",
  );
  assert.ok(x.fitLine.includes("เร่งการเปลี่ยนแปลง"));
  assert.equal(x.bullets.length, 2);
});

test("resolveCrystalMode: non-crystal → null", () => {
  assert.equal(resolveCrystalMode("thai_amulet", "Moldavite third eye"), null);
  assert.equal(resolveCrystalMode("generic", "Clear quartz"), null);
});

test("resolveCrystalMode: crystal default → general", () => {
  assert.equal(
    resolveCrystalMode("crystal", "เด่นเรื่องเงินและงาน"),
    "general",
  );
  assert.equal(resolveCrystalMode("crystal", "พลังปกป้องและคุ้มครอง"), "general");
});

test("crystal: generic quartz without spiritual context stays general / not spiritual_growth", () => {
  assert.equal(
    resolveCrystalMode("crystal", "rose quartz เน้นโชคลาภและเสน่ห์"),
    "general",
  );
  assert.notEqual(
    inferEnergyCategoryCodeFromMainEnergy(
      "rose quartz เน้นโชคลาภ",
      "crystal",
    ),
    "spiritual_growth",
  );
});

test("extractCrystalSpiritualSignalTags lists moldavite / chakra tags", () => {
  const t = extractCrystalSpiritualSignalTags(
    "Moldavite จักระที่ 6 หยั่งรู้",
  );
  assert.ok(t.includes("moldavite"));
  assert.ok(t.includes("chakra_th") || t.includes("intuition_th"));
});

test("inferEnergyCategoryCode: crystal uses raw Moldavite text → spiritual_growth (not protection)", () => {
  assert.equal(
    inferEnergyCategoryCodeFromMainEnergy(
      "Moldavite พลังสูง third eye",
      "crystal",
    ),
    "spiritual_growth",
  );
  assert.notEqual(
    inferEnergyCategoryCodeFromMainEnergy(
      "Moldavite พลังสูง third eye",
      "crystal",
    ),
    "protection",
  );
});

test("resolveCrystalMode: crystal high-vibration signals → spiritual_growth", () => {
  assert.equal(
    resolveCrystalMode("crystal", "Moldavite crown chakra"),
    "spiritual_growth",
  );
  assert.equal(
    resolveCrystalMode("crystal", "Clear quartz จักระที่ 7 หยั่งรู้"),
    "spiritual_growth",
  );
  assert.equal(
    resolveCrystalMode("crystal", "เด่นเรื่องจิตวิญญาณ ยกระดับตัวเอง"),
    "spiritual_growth",
  );
});

test("pickMainEnergyColor uses category hint then legacy", () => {
  assert.equal(pickMainEnergyColor("ข้อความไม่ระบุ", "money_work"), "#2E7D32");
  assert.equal(
    pickMainEnergyColor("พลังโชคลาภ", undefined),
    pickAccentColorFromCategoryCode("luck_fortune"),
  );
});
