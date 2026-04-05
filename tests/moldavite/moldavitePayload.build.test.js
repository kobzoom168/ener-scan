import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMoldaviteV1Slice } from "../../src/moldavite/moldavitePayload.build.js";

test("buildMoldaviteV1Slice: shape + deterministic_v1", () => {
  const slice = buildMoldaviteV1Slice({
    scanResultId: "rid-uuid-here",
    detection: { reason: "keyword_match", matchedSignals: ["result_text"] },
    seedKey: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    energyScore: 7,
    mainEnergyLabel: "พลังสมดุล",
  });
  assert.equal(slice.version, "1");
  assert.equal(slice.scoringMode, "deterministic_v1");
  assert.equal(slice.detection.reason, "keyword_match");
  assert.deepEqual(slice.detection.matchedSignals, ["result_text"]);
  assert.ok(["work", "money", "relationship"].includes(slice.primaryLifeArea));
  assert.ok(["work", "money", "relationship"].includes(slice.secondaryLifeArea));
  assert.notEqual(slice.primaryLifeArea, slice.secondaryLifeArea);
  assert.equal(slice.context?.energyScoreSnapshot, 7);
  assert.ok(String(slice.flexSurface.headline).includes("มอลดาไวต์"));
  assert.equal(slice.flexSurface.bullets.length, 2);
  assert.equal(slice.flexSurface.mainEnergyShort, "มอลดาไวต์");
});
