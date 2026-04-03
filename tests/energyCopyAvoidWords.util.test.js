import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lineContainsEnergyCopyAvoidWord,
  ENERGY_COPY_SPIRITUAL_ALLOW_SUBSTRINGS,
} from "../src/utils/reports/energyCopyAvoidWords.util.js";

test("spiritual_growth lines with allowlisted substrings are not flagged", () => {
  assert.ok(
    ENERGY_COPY_SPIRITUAL_ALLOW_SUBSTRINGS.length >= 3,
    "allowlist must stay non-empty",
  );
  assert.equal(
    lineContainsEnergyCopyAvoidWord(
      "ช่วยกระตุ้นจักระที่ 6 และ 7 และเพิ่มการหยั่งรู้",
    ),
    false,
  );
  assert.equal(
    lineContainsEnergyCopyAvoidWord(
      "เด่นเรื่องพลังงานสูงและการยกระดับตัวเอง เร่งการเปลี่ยนแปลงในชีวิต",
    ),
    false,
  );
  assert.equal(
    lineContainsEnergyCopyAvoidWord("เหมาะกับช่วงที่อยากเร่งการเปลี่ยนแปลงในชีวิต"),
    false,
  );
});

test("avoid-word guard still catches known blocklist terms", () => {
  assert.equal(lineContainsEnergyCopyAvoidWord("อยากนิ่งขึ้นในวันนี้"), true);
});
