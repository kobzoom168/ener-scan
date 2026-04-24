import test from "node:test";
import assert from "node:assert/strict";
import { formatBangkokScanDateThaiBE } from "../src/utils/dateTime.util.js";

test("formatBangkokScanDateThaiBE: Buddhist year + Thai month abbrev", () => {
  const s = formatBangkokScanDateThaiBE("2026-04-24T12:00:00.000Z");
  assert.ok(s.includes("เม.ย."));
  assert.ok(s.includes("2569"));
});
