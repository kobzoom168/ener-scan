import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mapObjectCategoryToPipelineSignals,
  countThreadedReportSignalFields,
} from "../src/utils/reports/scanPipelineReportSignals.util.js";

test("mapObjectCategoryToPipelineSignals: crystal path", () => {
  const s = mapObjectCategoryToPipelineSignals("คริสตัล/หิน");
  assert.equal(s.objectFamily, "crystal");
  assert.equal(s.materialFamily, "crystal");
});

test("mapObjectCategoryToPipelineSignals: empty -> generic", () => {
  const s = mapObjectCategoryToPipelineSignals("");
  assert.equal(s.objectFamily, "generic");
});

test("countThreadedReportSignalFields: counts category + check", () => {
  const n = countThreadedReportSignalFields({
    objectCategory: "พระเครื่อง",
    objectCheckResult: "single_supported",
    objectFamily: "somdej",
    shapeFamily: "rectangular",
  });
  assert.ok(n >= 3);
});
