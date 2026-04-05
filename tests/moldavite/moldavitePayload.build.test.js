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
  assert.ok(
    /เร่งการเปลี่ยนแปลง|เร่งรอบ|ปล่อยของเก่า|รอบใหม่/.test(
      String(slice.flexSurface.headline),
    ),
    "headline should be native-energy-first",
  );
  assert.equal(slice.flexSurface.bullets.length, 2);
  assert.ok(
    /เปลี่ยนแปลง|ขยับ|แปลงสภาพ|เริ่มใหม่/.test(slice.flexSurface.bullets[0]),
    "first bullet should describe native energy",
  );
  assert.ok(
    String(slice.flexSurface.bullets[1]).includes("มุมรอง"),
    "second bullet should frame life-area as secondary",
  );
  assert.equal(slice.flexSurface.mainEnergyShort, "มอลดาไวต์");
  assert.ok(String(slice.flexSurface.heroNamingLine || "").length > 0);
});
