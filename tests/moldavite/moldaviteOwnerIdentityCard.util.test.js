import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMoldaviteOwnerIdentityCard } from "../../src/moldavite/moldaviteOwnerIdentityCard.util.js";

test("buildMoldaviteOwnerIdentityCard: no scores in chips or summary", () => {
  const out = buildMoldaviteOwnerIdentityCard({
    traitScores: [
      { label: "ใจนำ", score: 8 },
      { label: "มั่นใจ", score: 7 },
      { label: "ขยับเร็ว", score: 4 },
      { label: "รับความรู้สึกไว", score: 9 },
    ],
    zodiacShortLabel: "สิงห์",
    seed: "test-seed-owner-1",
  });
  assert.equal(out.chips.length, 3);
  assert.ok(out.chips.includes("ธาตุไฟ"));
  assert.ok(out.summary.length > 12);
  assert.ok(!out.summary.includes("/10"));
  assert.ok(out.glyphSvg.includes("mv2-owner-glyph"));
  assert.ok(!out.glyphSvg.includes("/10"));
});

test("buildMoldaviteOwnerIdentityCard: unknown zodiac uses chip fallback", () => {
  const out = buildMoldaviteOwnerIdentityCard({
    traitScores: [
      { label: "ใจนำ", score: 6 },
      { label: "มั่นใจ", score: 6 },
      { label: "ขยับเร็ว", score: 6 },
      { label: "รับความรู้สึกไว", score: 6 },
    ],
    zodiacShortLabel: "???",
    seed: "test-seed-owner-2",
  });
  assert.equal(out.chips.length, 3);
  assert.ok(out.chips[0].includes("ธาตุ"));
});
