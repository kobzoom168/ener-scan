import { test } from "node:test";
import assert from "node:assert/strict";
import { formatScanBirthdayLabelThai } from "../src/utils/scanBirthdayLabel.util.js";

test("formatScanBirthdayLabelThai: 19/08/1985 → วันจันทร์ 19 ส.ค. 2528 (BE)", () => {
  assert.equal(
    formatScanBirthdayLabelThai("19/08/1985"),
    "วันจันทร์ 19 ส.ค. 2528",
  );
});
