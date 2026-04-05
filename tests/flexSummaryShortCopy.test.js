import { test } from "node:test";
import assert from "node:assert/strict";
import {
  composeFlexShortSurface,
  getFlexHeroVariantByPresentationAngle,
  lineLooksLikeThaiTruncationArtifact,
  storedFlexSummaryLooksComplete,
  TRUNCATION_ARTIFACT_SUFFIXES,
} from "../src/utils/reports/flexSummaryShortCopy.js";
import { lineContainsEnergyCopyAvoidWord } from "../src/utils/reports/energyCopyAvoidWords.util.js";
import {
  FLEX_SUMMARY_BULLET_MAX,
  FLEX_SUMMARY_FIT_MAX,
  FLEX_SUMMARY_HEADLINE_MAX,
} from "../src/utils/reports/flexSummarySurface.util.js";
import { buildFlexSummarySurfaceFields } from "../src/utils/reports/flexSummarySurface.util.js";
import { ENERGY_TYPES } from "../src/services/flex/scanCopy.config.js";

const FORBIDDEN_SNAPSHOT_FRAGMENTS = ["ต้องการคว", "เสริมควา", "ทำงานห"];

test("composed surface: lengths and no truncation-artifact tails", () => {
  const energies = Object.values(ENERGY_TYPES);
  const fams = ["protection", "shielding", "authority", "attraction", ""];
  for (const e of energies) {
    for (const f of fams) {
      for (let i = 0; i < 12; i++) {
        const s = composeFlexShortSurface({
          mainEnergyLabel: e,
          wordingFamily: f,
          seed: `t-${e}-${f}-${i}`,
        });
        assert.ok(s.headlineShort.length <= FLEX_SUMMARY_HEADLINE_MAX, s.headlineShort);
        assert.ok(s.fitReasonShort.length <= FLEX_SUMMARY_FIT_MAX);
        assert.equal(s.bulletsShort.length, 2);
        for (const b of s.bulletsShort) {
          assert.ok(b.length <= FLEX_SUMMARY_BULLET_MAX, b);
        }
        for (const line of [s.headlineShort, s.fitReasonShort, ...s.bulletsShort]) {
          assert.ok(!lineLooksLikeThaiTruncationArtifact(line), line);
          assert.ok(!lineContainsEnergyCopyAvoidWord(line), line);
          for (const frag of FORBIDDEN_SNAPSHOT_FRAGMENTS) {
            assert.ok(!line.endsWith(frag), line);
          }
        }
      }
    }
  }
});

test("storedFlexSummaryLooksComplete rejects legacy mid-phrase cuts", () => {
  assert.equal(
    storedFlexSummaryLooksComplete({
      headlineShort: "พลังของชิ้นนี้เหมาะอย่างยิ่งสำหรับคนที่ต้องการคว",
      fitReasonShort: "ok",
      bulletsShort: ["ก", "ข"],
    }),
    false,
  );
  assert.equal(
    storedFlexSummaryLooksComplete({
      headlineShort: "เหมาะกับคนที่ต้องการความมั่นคง",
      fitReasonShort: "เหมาะกับช่วงที่ต้องคุมใจ",
      bulletsShort: ["ช่วยให้ใจไม่แกว่งเวลาเจอแรงกดดัน", "เหมาะกับช่วงที่ต้องตั้งสติและตัดสินใจ"],
    }),
    true,
  );
  assert.equal(
    storedFlexSummaryLooksComplete({
      headlineShort: "หัวเรื่องมั่นใจ",
      fitReasonShort: "ok",
      bulletsShort: ["ก", "ข"],
    }),
    false,
  );
});

test("buildFlexSummarySurfaceFields ignores long flexHeadline; uses composition", () => {
  const r = buildFlexSummarySurfaceFields({
    wording: {
      mainEnergy: ENERGY_TYPES.POWER,
      wordingFamily: "authority",
      flexHeadline: "x".repeat(200),
    },
    mainEnergyLabel: ENERGY_TYPES.POWER,
    wordingFamily: "authority",
    seed: "unit",
  });
  assert.ok(!r.headlineShort.includes("xxx"));
  assert.ok(r.headlineShort.length <= FLEX_SUMMARY_HEADLINE_MAX);
  assert.ok(!lineLooksLikeThaiTruncationArtifact(r.headlineShort));
});

test("artifact suffix list is documented for regression snapshots", () => {
  assert.ok(TRUNCATION_ARTIFACT_SUFFIXES.length >= 5);
});

test("crystal + confidence surface: headline not default บารมี", () => {
  const s = composeFlexShortSurface({
    mainEnergyLabel: "คุ้มครอง",
    objectFamily: "crystal",
    energyCategoryCode: "confidence",
    seed: "crystal-conf-unit",
  });
  assert.ok(!s.headlineShort.includes("บารมี"));
});

test("ten sample composed lines (documentation-style)", () => {
  const samples = [
    composeFlexShortSurface({
      mainEnergyLabel: "ปกป้อง",
      wordingFamily: "protection",
      seed: "s1",
    }),
    composeFlexShortSurface({
      mainEnergyLabel: "สมดุล",
      wordingFamily: "shielding",
      seed: "s2",
    }),
    composeFlexShortSurface({
      mainEnergyLabel: "อำนาจ",
      wordingFamily: "authority",
      seed: "s3",
    }),
    composeFlexShortSurface({
      mainEnergyLabel: "เมตตา",
      wordingFamily: "attraction",
      seed: "s4",
    }),
    composeFlexShortSurface({
      mainEnergyLabel: "ดึงดูด",
      wordingFamily: "attraction",
      seed: "s5",
    }),
    composeFlexShortSurface({
      mainEnergyLabel: "โชคลาภ",
      wordingFamily: "attraction",
      seed: "s6",
    }),
    composeFlexShortSurface({
      mainEnergyLabel: "เสริมพลัง",
      wordingFamily: "",
      seed: "s7",
    }),
    composeFlexShortSurface({
      mainEnergyLabel: "ปกป้อง",
      wordingFamily: "shielding",
      seed: "s8",
    }),
    composeFlexShortSurface({
      mainEnergyLabel: "สมดุล",
      wordingFamily: "authority",
      seed: "s9",
    }),
    composeFlexShortSurface({
      mainEnergyLabel: "อำนาจ",
      wordingFamily: "attraction",
      seed: "s10",
    }),
  ];
  assert.equal(samples.length, 10);
  for (const s of samples) {
    assert.ok(s.headlineShort.length > 5);
    assert.ok(s.fitReasonShort.length > 8);
  }
});

test("getFlexHeroVariantByPresentationAngle: same truth protection, different angles", () => {
  const filter = getFlexHeroVariantByPresentationAngle(
    "crystal",
    "protection",
    "filter",
  );
  const shield = getFlexHeroVariantByPresentationAngle(
    "crystal",
    "protection",
    "shield",
  );
  assert.ok(filter?.headline && shield?.headline);
  assert.notEqual(filter.headline, shield.headline);
  assert.match(filter.headline, /กรอง|รบกวน/);
});
