import test from "node:test";
import assert from "node:assert/strict";
import { buildAmuletV1Slice } from "../../src/amulet/amuletPayload.build.js";

test("buildAmuletV1Slice: six power categories + flex surface + deterministic v2", () => {
  const slice = buildAmuletV1Slice({
    scanResultId: "scan-amulet-1",
    seedKey: "seed-amulet-1",
    energyScore: 7,
    mainEnergyLabel: "คุ้มครอง · เปิดทาง",
  });
  assert.equal(slice.version, "1");
  assert.equal(slice.scoringMode, "deterministic_v2");
  assert.equal(slice.detection.reason, "sacred_amulet_lane_v1");
  assert.equal(Object.keys(slice.powerCategories).length, 6);
  assert.ok(slice.primaryPower);
  assert.ok(slice.secondaryPower);
  assert.equal(slice.flexSurface.bullets.length, 2);
  assert.ok(String(slice.flexSurface.fitLine || "").includes("เด่นสุด"));
  assert.ok(String(slice.flexSurface.fitLine || "").includes("รอง"));
  assert.ok(!String(slice.flexSurface.tagline || "").includes("โทนทอง"));
  assert.ok(String(slice.flexSurface.tagline || "").includes("หกมิติ"));
  assert.ok(String(slice.flexSurface.ctaLabel || "").length > 0);
  assert.ok(slice.htmlReport.usageCautionLines.length >= 1);
  const flexJson = JSON.stringify(slice.flexSurface);
  assert.ok(!flexJson.includes("\u2014"), "flex surface copy has no em dash");
  assert.ok(
    slice.flexSurface.bullets.some((b) => String(b).includes("·")),
    "compact bullets use middle dot, not long dash phrasing",
  );
});
