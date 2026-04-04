import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseScanText,
  findFallbackMainEnergy,
  getScanHeaderSliceForMainEnergyFallback,
} from "../src/services/flex/flex.parser.js";
import { inferEnergyCategoryCodeFromMainEnergy } from "../src/utils/energyCategoryResolve.util.js";

const CRYSTAL = "crystal";
const THAI = "thai_amulet";

test("findFallbackMainEnergy: คุ้มครอง only in ภาพรวม (after header slice) does not return พลังปกป้อง", () => {
  const raw = `
ผลการตรวจพลังวัตถุ โดย อาจารย์ Ener
ระดับพลัง: 8 / 10
ความสอดคล้องกับเจ้าของ: 70 %

ลักษณะพลัง
• บุคลิก: ใจนิ่งมั่น (ทดสอบ)

ภาพรวม
ชิ้นนี้เน้นคุ้มครองและนิ่งในวันวุ่น

เหตุผลที่เข้ากับเจ้าของ
โยงทดสอบ
`;
  const fb = findFallbackMainEnergy(raw);
  assert.equal(fb, "-");
  const p = parseScanText(raw);
  assert.equal(p.mainEnergyResolution.source, "missing");
  assert.equal(p.mainEnergy, "-");
  assert.equal(
    inferEnergyCategoryCodeFromMainEnergy(p.mainEnergy, CRYSTAL),
    "luck_fortune",
  );
});

test("parseScanText: พลังหลัก line wins (สมดุล) — thai amulet unchanged", () => {
  const raw = `ระดับพลัง: 7 / 10
พลังหลัก: พลังสมดุล (นิ่งในวันวุ่น)
ความสอดคล้อง: 50%
ภาพรวม
ทดสอบ
เหตุผลที่เข้ากับเจ้าของ
ทดสอบ
`;
  const p = parseScanText(raw);
  assert.equal(p.mainEnergyResolution.source, "line_value");
  assert.ok(String(p.mainEnergy).includes("สมดุล"));
  assert.equal(
    inferEnergyCategoryCodeFromMainEnergy(p.mainEnergy, THAI),
    "confidence",
  );
});

test("parseScanText: explicit พลังปกป้อง still maps to protection (crystal)", () => {
  const raw = `ระดับพลัง: 8 / 10
พลังหลัก: พลังปกป้อง (ทดสอบ)
ความสอดคล้อง: 50%
ภาพรวม
x
เหตุผลที่เข้ากับเจ้าของ
y
`;
  const p = parseScanText(raw);
  assert.equal(p.mainEnergyResolution.source, "line_value");
  assert.equal(
    inferEnergyCategoryCodeFromMainEnergy(p.mainEnergy, CRYSTAL),
    "protection",
  );
});

test("getScanHeaderSliceForMainEnergyFallback: stops before ภาพรวม", () => {
  const raw = `ระดับพลัง: 8 / 10
พลังหลัก: พลังโชคลาภ (ทดสอบ)
ความสอดคล้อง: 50%
ภาพรวม
คุ้มครองเยอะมากที่นี่ไม่ควรดันหมวด
`;
  const slice = getScanHeaderSliceForMainEnergyFallback(raw);
  assert.ok(!slice.includes("คุ้มครองเยอะ"));
  assert.ok(slice.includes("โชคลาภ"));
});

test("parseScanText: no พลังหลัก line but header has โชค -> fallback_body_match", () => {
  const raw = `ระดับพลัง: 8 / 10
ความสอดคล้อง: โชคดีในวันนี้
ลักษณะพลัง
x
`;
  const p = parseScanText(raw);
  assert.equal(p.mainEnergyResolution.source, "fallback_body_match");
  assert.equal(p.mainEnergy, "พลังโชคลาภ");
});

test("findFallbackMainEnergy: header slice picks โชค before protect keywords in header only", () => {
  const raw = `ระดับพลัง: 8 / 10
ความสอดคล้อง: โชคดีในวันนี้
ลักษณะพลัง
x
ภาพรวม
ปกป้องตัวเองจากความเครียด
`;
  const fb = findFallbackMainEnergy(raw);
  assert.equal(fb, "พลังโชคลาภ");
});
