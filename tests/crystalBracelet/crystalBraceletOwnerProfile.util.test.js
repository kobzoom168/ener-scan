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
  stone.career = 80;
  owner.career = 20;
  stone.charm_attraction = 40;
  owner.charm_attraction = 85;

  const a = deriveCrystalBraceletOwnerProfile({
    birthdateUsed: "15/03/1990",
    displayCompatibilityPercent: 72,
    stableSeed: "seed-x",
    stoneScores: stone,
    ownerAxisScores: owner,
    primaryAxis: "career",
    alignAxisKey: "charm_attraction",
  });
  const b = deriveCrystalBraceletOwnerProfile({
    birthdateUsed: "15/03/1990",
    displayCompatibilityPercent: 72,
    stableSeed: "seed-x",
    stoneScores: stone,
    ownerAxisScores: owner,
    primaryAxis: "career",
    alignAxisKey: "charm_attraction",
  });

  assert.equal(a.version, "1");
  assert.equal(a.identityPhrase, b.identityPhrase);
  assert.equal(a.tensionAxisKey, "career");
  assert.equal(a.alignAxisKey, "charm_attraction");
  assert.ok(a.ownerChips.length >= 2 && a.ownerChips.length <= 3);
  assert.ok(a.glyphSeed > 0);
  assert.equal(a.hasBirthdate, true);
  assert.ok(
    String(a.profileSummaryShort || "").includes("โดยรวมถือว่า"),
  );
  assert.ok(
    String(a.profileSummaryShort || "").includes("เข้ากันค่อนข้างดี"),
  );
  assert.equal(/\d{2}/.test(String(a.profileSummaryShort || "")), false);
  assert.ok(String(a.profileSummaryShort || "").length > 8);
  const noCurlyQuotes = (s) =>
    !String(s).includes("\u201c") &&
    !String(s).includes("\u201d") &&
    !String(s).includes('"');
  assert.ok(noCurlyQuotes(a.identityPhrase));
  assert.ok(noCurlyQuotes(a.profileSummaryShort));
  assert.ok(noCurlyQuotes(a.derivationNote));
  for (const c of a.ownerChips) assert.ok(noCurlyQuotes(c));
  assert.ok(a.identityPhrase.includes("เสน่ห์"));
  assert.ok(a.identityPhrase.includes("การงาน"));
});

test("deriveCrystalBraceletOwnerProfile: no DOB uses fallback seed", () => {
  /** @type {Record<string, number>} */
  const stone = {};
  /** @type {Record<string, number>} */
  const owner = {};
  for (const k of CRYSTAL_BRACELET_AXIS_ORDER) {
    stone[k] = 55;
    owner[k] = 58;
  }
  const p = deriveCrystalBraceletOwnerProfile({
    birthdateUsed: null,
    displayCompatibilityPercent: 66,
    stableSeed: "abc-def-0001",
    stoneScores: stone,
    ownerAxisScores: owner,
    primaryAxis: "charm_attraction",
    alignAxisKey: "charm_attraction",
  });
  assert.equal(p.hasBirthdate, false);
  assert.ok(
    p.derivationNote.includes("ยังไม่มีวันเกิด") ||
      p.derivationNote.includes("โครงพลังของรายงาน"),
  );
});

test("crystalBraceletOwnerProfileFlexTeaser: short line", () => {
  const t = crystalBraceletOwnerProfileFlexTeaser({
    alignAxisKey: "intuition",
    tensionAxisKey: "career",
  });
  assert.ok(t.includes("เซ้นส์"));
  assert.ok(t.includes("การงาน"));
  assert.ok(t.includes("รับพลังด้าน"));
  assert.ok(t.length <= 58);
});
