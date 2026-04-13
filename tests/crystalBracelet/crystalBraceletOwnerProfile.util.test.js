import { test } from "node:test";
import assert from "node:assert/strict";
import {
  crystalBraceletOwnerProfileFlexTeaser,
  deriveCrystalBraceletOwnerProfile,
} from "../../src/crystalBracelet/crystalBraceletOwnerProfile.util.js";
import { CRYSTAL_BRACELET_AXIS_ORDER } from "../../src/crystalBracelet/crystalBraceletScores.util.js";

test("deriveCrystalBraceletOwnerProfile: stable + shape + tension = max gap", () => {
  /** @type {Record<string, number>} */
  const stone = {};
  /** @type {Record<string, number>} */
  const owner = {};
  for (const k of CRYSTAL_BRACELET_AXIS_ORDER) {
    stone[k] = 50;
    owner[k] = 50;
  }
  stone.work = 80;
  owner.work = 20;
  stone.protection = 40;
  owner.protection = 85;

  const a = deriveCrystalBraceletOwnerProfile({
    birthdateUsed: "15/03/1990",
    ownerFitScore: 72,
    stableSeed: "seed-x",
    stoneScores: stone,
    ownerAxisScores: owner,
    primaryAxis: "work",
    alignAxisKey: "protection",
  });
  const b = deriveCrystalBraceletOwnerProfile({
    birthdateUsed: "15/03/1990",
    ownerFitScore: 72,
    stableSeed: "seed-x",
    stoneScores: stone,
    ownerAxisScores: owner,
    primaryAxis: "work",
    alignAxisKey: "protection",
  });

  assert.equal(a.version, "1");
  assert.equal(a.identityPhrase, b.identityPhrase);
  assert.equal(a.tensionAxisKey, "work");
  assert.equal(a.alignAxisKey, "protection");
  assert.ok(a.ownerChips.length >= 2 && a.ownerChips.length <= 4);
  assert.ok(a.glyphSeed > 0);
  assert.equal(a.hasBirthdate, true);
  assert.ok(String(a.profileSummaryShort || "").includes("เข้ากัน"));
  assert.ok(String(a.profileSummaryShort || "").length > 8);
});

test("deriveCrystalBraceletOwnerProfile: no DOB uses fallback seed", () => {
  /** @type {Record<string, number>} */
  const stone = { protection: 60, charm: 55, aura: 55, opportunity: 55, work: 55, grounding: 55, third_eye: 55 };
  /** @type {Record<string, number>} */
  const owner = { protection: 62, charm: 58, aura: 58, opportunity: 58, work: 58, grounding: 58, third_eye: 58 };
  const p = deriveCrystalBraceletOwnerProfile({
    birthdateUsed: null,
    ownerFitScore: 66,
    stableSeed: "abc-def-0001",
    stoneScores: stone,
    ownerAxisScores: owner,
    primaryAxis: "protection",
    alignAxisKey: "protection",
  });
  assert.equal(p.hasBirthdate, false);
  assert.ok(p.derivationNote.includes("ยังไม่มีวันเกิด"));
});

test("crystalBraceletOwnerProfileFlexTeaser: short line", () => {
  const t = crystalBraceletOwnerProfileFlexTeaser({
    alignAxisKey: "aura",
    tensionAxisKey: "work",
  });
  assert.ok(t.includes("ออร่า"));
  assert.ok(t.includes("งาน"));
  assert.ok(t.length <= 54);
});
