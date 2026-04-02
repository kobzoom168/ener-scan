import { test } from "node:test";
import assert from "node:assert/strict";
import {
  inferEnergyCategoryCodeFromMainEnergy,
  normalizeObjectFamilyForEnergyCopy,
  pickAccentColorFromCategoryCode,
  ACCENT_COLOR_BY_CATEGORY_CODE,
} from "../src/utils/energyCategoryResolve.util.js";
import { pickMainEnergyColor } from "../src/services/flex/flex.utils.js";

test("crystal + protection: category + accent", () => {
  assert.equal(
    inferEnergyCategoryCodeFromMainEnergy("พลังหลัก ปกป้องและคุ้มครอง"),
    "protection",
  );
  assert.equal(normalizeObjectFamilyForEnergyCopy("crystal"), "crystal");
  assert.equal(pickAccentColorFromCategoryCode("protection"), "#D4AF37");
});

test("crystal + confidence: power / authority → confidence", () => {
  assert.equal(
    inferEnergyCategoryCodeFromMainEnergy("พลังอำนาจและบารมี"),
    "confidence",
  );
  assert.equal(normalizeObjectFamilyForEnergyCopy("crystal"), "crystal");
  assert.equal(ACCENT_COLOR_BY_CATEGORY_CODE.confidence, "#C62828");
});

test("crystal + money_work: luck line", () => {
  assert.equal(
    inferEnergyCategoryCodeFromMainEnergy("พลังโชคลาภเด่น"),
    "money_work",
  );
  assert.equal(pickAccentColorFromCategoryCode("money_work"), "#2E7D32");
});

test("thai_amulet + protection", () => {
  assert.equal(
    inferEnergyCategoryCodeFromMainEnergy("เน้นป้องกันและคุ้มครอง"),
    "protection",
  );
  assert.equal(normalizeObjectFamilyForEnergyCopy("somdej"), "thai_amulet");
  assert.equal(normalizeObjectFamilyForEnergyCopy("generic"), "thai_amulet");
});

test("thai_amulet + confidence", () => {
  assert.equal(
    inferEnergyCategoryCodeFromMainEnergy("บารมีและอำนาจ"),
    "confidence",
  );
  assert.equal(normalizeObjectFamilyForEnergyCopy(""), "thai_amulet");
});

test("thai_amulet + charm: เมตตา / attraction", () => {
  assert.equal(inferEnergyCategoryCodeFromMainEnergy("เมตตาและความอ่อนโยน"), "charm");
  assert.equal(
    inferEnergyCategoryCodeFromMainEnergy("เสน่ห์และดึงดูด"),
    "charm",
  );
});

test("pickMainEnergyColor uses category hint then legacy", () => {
  assert.equal(pickMainEnergyColor("ข้อความไม่ระบุ", "money_work"), "#2E7D32");
  assert.equal(
    pickMainEnergyColor("พลังโชคลาภ", undefined),
    pickAccentColorFromCategoryCode("money_work"),
  );
});
