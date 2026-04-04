import { test } from "node:test";
import assert from "node:assert/strict";
import { generateScanCopy } from "../src/services/flex/scanCopy.generator.js";
import { ENERGY_TYPES, MAIN_LABEL } from "../src/services/flex/scanCopy.config.js";
import { SCAN_TONE_LEVEL } from "../src/services/flex/scanCopy.toneLevel.js";

test("generateScanCopy: same mainEnergy คุ้มครอง — crystal uses BOOST label, empty family uses PROTECT label", () => {
  const base = {
    mainEnergy: "คุ้มครอง",
    energyScore: "8",
    scoreNumeric: 8,
    compatibility: "70%",
    scanToneLevel: SCAN_TONE_LEVEL.STANDARD,
  };
  const crystal = generateScanCopy({ ...base, objectFamily: "crystal" });
  const thai = generateScanCopy({ ...base, objectFamily: "" });
  assert.equal(crystal.summary.mainEnergyLabel, MAIN_LABEL[ENERGY_TYPES.BOOST]);
  assert.equal(thai.summary.mainEnergyLabel, MAIN_LABEL[ENERGY_TYPES.PROTECT]);
});

test("buildScanFlex forwards objectFamily into generateScanCopy (integration)", async () => {
  const { buildScanFlex } = await import("../src/services/flex/flex.service.js");
  const raw = `ระดับพลัง: 8 / 10
พลังหลัก: คุ้มครอง
ความสอดคล้อง: 70 %

ลักษณะพลัง
• บุคลิก: ทดสอบ
• โทนพลัง: ขาว | รับแรงกดดันแทน
• พลังซ่อน: ทดสอบ

ภาพรวม
ทดสอบ
ทดสอบ

เหตุผลที่เข้ากับเจ้าของ
ทดสอบ
ทดสอบ
`;
  const flexOut = buildScanFlex(raw, { objectFamily: "crystal" });
  assert.equal(flexOut.type, "flex");
  assert.ok(String(flexOut.altText || "").length > 0);
});
