import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveLineSummaryWording,
  lineSummaryBankKey,
} from "../src/utils/lineSummaryWording.util.js";

test("lineSummaryBankKey: crystal + protection", () => {
  assert.equal(lineSummaryBankKey("crystal", "protection"), "crystal.protection");
});

test("resolveLineSummaryWording: returns opening + fitLine + bank id", () => {
  const r = resolveLineSummaryWording(
    {
      summary: {
        energyCopyObjectFamily: "crystal",
        energyCategoryCode: "protection",
      },
    },
    "Utestuser1",
    "job-seed-1",
  );
  assert.ok(r.opening.length > 0);
  assert.ok(r.fitLine.length > 0);
  assert.match(r.summaryBankUsed, /^crystal\.protection/);
  assert.match(r.summaryVariantId, /^crystal\.protection:v\d+/);
});
