import { test } from "node:test";
import assert from "node:assert/strict";
import {
  inferEnergyCategoryCodeFromMainEnergy,
  normalizeObjectFamilyForEnergyCopy,
  pickAccentColorFromCategoryCode,
  ACCENT_COLOR_BY_CATEGORY_CODE,
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

test("pickMainEnergyColor uses category hint then legacy", () => {
  assert.equal(pickMainEnergyColor("ข้อความไม่ระบุ", "money_work"), "#2E7D32");
  assert.equal(
    pickMainEnergyColor("พลังโชคลาภ", undefined),
    pickAccentColorFromCategoryCode("luck_fortune"),
  );
});
