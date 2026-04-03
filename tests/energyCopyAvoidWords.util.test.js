import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ENERGY_COPY_AVOID_WORDS,
  lineContainsEnergyCopyAvoidWord,
} from "../src/utils/reports/energyCopyAvoidWords.util.js";
import {
  composeFlexShortSurface,
  getFallbackFlexSurfaceLines,
} from "../src/utils/reports/flexSummaryShortCopy.js";
import { ENERGY_CATEGORY_DISPLAY_SYNC } from "../src/utils/energyCategoryResolve.util.js";

test("spiritual_growth copy lines: chakra / หยั่งรู้ not flagged as avoid words", () => {
  assert.equal(
    lineContainsEnergyCopyAvoidWord(
      "ช่วยกระตุ้นจักระที่ 6 และ 7 และเพิ่มการหยั่งรู้",
    ),
    false,
  );
  assert.equal(
    lineContainsEnergyCopyAvoidWord("ช่วยเร่งการเปลี่ยนแปลงให้ขยับชัดขึ้น"),
    false,
  );
});

test("avoid list: substring hits for Thai phrases", () => {
  assert.equal(lineContainsEnergyCopyAvoidWord("อยากให้ใจนิ่งขึ้น"), true);
  assert.equal(lineContainsEnergyCopyAvoidWord("วันนี้มั่นใจเต็มที่"), true);
  assert.equal(lineContainsEnergyCopyAvoidWord("Focus on work"), true);
  assert.equal(lineContainsEnergyCopyAvoidWord("stress relief day"), true);
  assert.equal(lineContainsEnergyCopyAvoidWord("เด่นเรื่องบารมี"), false);
});

test("fallback master v2 surfaces contain no avoid words", () => {
  const thaiCodes = ["luck_fortune", "metta", "protection", "confidence"];
  const crystalCodes = [
    "money_work",
    "charm",
    "protection",
    "confidence",
    "luck_fortune",
    "spiritual_growth",
  ];
  for (const c of thaiCodes) {
    const x = getFallbackFlexSurfaceLines(c, "thai_amulet");
    for (const line of [x.headline, x.fitLine, ...x.bullets]) {
      assert.equal(lineContainsEnergyCopyAvoidWord(line), false, line);
    }
  }
  for (const c of crystalCodes) {
    const x = getFallbackFlexSurfaceLines(c, "crystal");
    for (const line of [x.headline, x.fitLine, ...x.bullets]) {
      assert.equal(lineContainsEnergyCopyAvoidWord(line), false, line);
    }
  }
});

test("composeFlexShortSurface: crystal vs thai picks distinct pools", () => {
  const crystal = composeFlexShortSurface({
    mainEnergyLabel: "ปกป้อง",
    objectFamily: "crystal",
    seed: "s",
  });
  const thai = composeFlexShortSurface({
    mainEnergyLabel: "ปกป้อง",
    objectFamily: "generic",
    seed: "s",
  });
  assert.notEqual(crystal.headlineShort, thai.headlineShort);
  for (const s of [crystal, thai]) {
    for (const line of [
      s.headlineShort,
      s.fitReasonShort,
      ...s.bulletsShort,
    ]) {
      assert.equal(lineContainsEnergyCopyAvoidWord(line), false, line);
    }
  }
});

test("ENERGY_CATEGORY_DISPLAY_SYNC labels have no avoid words", () => {
  for (const row of Object.values(ENERGY_CATEGORY_DISPLAY_SYNC)) {
    for (const k of ["display_name_th", "short_name_th", "description_th"]) {
      const v = row[k];
      if (v)
        assert.equal(
          lineContainsEnergyCopyAvoidWord(v),
          false,
          `${k}: ${v}`,
        );
    }
  }
});

test("avoid word list length stable", () => {
  assert.ok(ENERGY_COPY_AVOID_WORDS.length >= 10);
});
