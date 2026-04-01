import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ensurePrimaryEnergyLineHasGloss,
  glossForPrimaryEnergyName,
} from "../src/utils/deepScanHumanGloss.util.js";
import { isDeepScanHumanReadable } from "../src/services/deepScanFormat.service.js";

test("glossForPrimaryEnergyName: known label", () => {
  assert.match(glossForPrimaryEnergyName("พลังคุ้มครอง"), /เกราะใจ/);
});

test("ensurePrimaryEnergyLineHasGloss: adds parens when missing", () => {
  const raw = `ผลการตรวจพลังวัตถุ โดย อาจารย์ Ener
ระดับพลัง: 8 / 10
พลังหลัก: พลังคุ้มครอง
ความสอดคล้องกับเจ้าของ: 78%
ลักษณะพลัง
• บุคลิก: โดดเด่นด้านคุ้มกัน (สอดคล้องกับแกนพลังของชิ้นนี้)`;
  const out = ensurePrimaryEnergyLineHasGloss(raw);
  assert.match(out, /พลังหลัก: พลังคุ้มครอง \(/);
  assert.equal(isDeepScanHumanReadable(out), true);
});

test("ensurePrimaryEnergyLineHasGloss: idempotent when parens present", () => {
  const s = "พลังหลัก: พลังสมดุล (ทดสอบ)";
  assert.equal(ensurePrimaryEnergyLineHasGloss(s), s);
});
