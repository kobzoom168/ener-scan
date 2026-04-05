import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMoldaviteV1Slice } from "../../src/moldavite/moldavitePayload.build.js";
import { resolveMoldaviteDisplayNaming } from "../../src/moldavite/moldaviteDisplayNaming.util.js";

const namingHigh = resolveMoldaviteDisplayNaming({
  geminiSubtypeConfidence: 0.9,
  moldaviteDecisionSource: "gemini",
  detectionReason: "gemini_crystal_subtype",
});

test("buildMoldaviteV1Slice: shape + deterministic_v1 + Flex v1 summary-first", () => {
  const slice = buildMoldaviteV1Slice({
    scanResultId: "rid-uuid-here",
    detection: { reason: "keyword_match", matchedSignals: ["result_text"] },
    seedKey: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    energyScore: 7,
    mainEnergyLabel: "พลังสมดุล",
    displayNaming: namingHigh,
  });
  assert.equal(slice.version, "1");
  assert.equal(slice.scoringMode, "deterministic_v1");
  assert.equal(slice.detection.reason, "keyword_match");
  assert.deepEqual(slice.detection.matchedSignals, ["result_text"]);
  assert.ok(["work", "money", "relationship"].includes(slice.primaryLifeArea));
  assert.ok(["work", "money", "relationship"].includes(slice.secondaryLifeArea));
  assert.notEqual(slice.primaryLifeArea, slice.secondaryLifeArea);
  assert.equal(slice.context?.energyScoreSnapshot, 7);
  assert.equal(String(slice.flexSurface.headline).trim(), "มอลดาไวต์");
  assert.equal(slice.flexSurface.bullets.length, 0);
  assert.equal(slice.flexSurface.mainEnergyShort, "เร่งการเปลี่ยนแปลง");
  assert.equal(slice.displayNaming?.displayNamingConfidenceLevel, "high");
  assert.ok(
    String(slice.flexSurface.heroNamingLine || "").includes("มอลดาไวต์"),
  );
  assert.ok(
    String(slice.flexSurface.heroNamingLine || "").includes("เร่งการเปลี่ยนแปลง"),
  );
  assert.ok(String(slice.flexSurface.tagline || "").includes("เทคไทต์"));
  assert.ok(
    String(slice.flexSurface.fitLine || "").startsWith("โฟกัสช่วงนี้:"),
    "fit line should be a short focus hint (not repeat ranking prose)",
  );
  assert.ok(
    String(slice.flexSurface.fitLine || "").includes(
      slice.lifeAreas[slice.primaryLifeArea].labelThai,
    ),
    "fit line should still name primary/secondary life areas",
  );
  assert.ok(
    String(slice.flexSurface.htmlOpeningLine || "").length > 40,
    "htmlOpeningLine should carry deeper copy for HTML/report",
  );
  assert.ok(
    /แปลงสภาพ|เคลื่อนไหว|เร่งการเปลี่ยนแปลง/.test(
      String(slice.flexSurface.mainEnergyWordingLine || ""),
    ),
    "mainEnergyWordingLine should expand native-energy nuance for report body",
  );
});
