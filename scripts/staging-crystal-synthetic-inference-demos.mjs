#!/usr/bin/env node
/**
 * No OpenAI — exercises parser + category inference only (same mirror as report payload).
 * Use for local sanity checks; fresh LLM proof is `staging-crystal-fresh-verify.mjs` with real images.
 */
import { mirrorMainEnergyInferenceLikeBuilder } from "./lib/crystalMainEnergyInferenceMirror.mjs";

const SAMPLES = [
  {
    id: 1,
    note: "คุ้มครอง only in ภาพรวม; no พลังหลัก line — parser should not force protect",
    text: `
ผลการตรวจพลังวัตถุ โดย อาจารย์ Ener
ระดับพลัง: 8.0 / 10
ความสอดคล้องกับเจ้าของ: 72 %

ลักษณะพลัง
• บุคลิก: ใจนิ่งมั่น (ทดสอบ)
• โทนพลัง: ขาว | รับแรงกดดันแทน
• พลังซ่อน: ทดสอบ

ภาพรวม
ชิ้นนี้เน้นคุ้มครองและนิ่งในวันวุ่น
อีกประโยคสั้นทดสอบ

เหตุผลที่เข้ากับเจ้าของ
ทดสอบสองประโยค
ทดสอบ

ชิ้นนี้หนุนเรื่อง
• ข้อหนึ่ง
• ข้อสอง

เหมาะใช้เมื่อ
• เมื่อหนึ่ง
• เมื่อสอง

อาจไม่เด่นเมื่อ
ทดสอบ

ควรใช้แบบไหน
ทดสอบ

ปิดท้าย
ทดสอบ
`,
  },
  {
    id: 2,
    note: "Explicit พลังปกป้อง — should stay protection",
    text: `ระดับพลัง: 7.5 / 10
พลังหลัก: พลังปกป้อง (กันเรื่องรบกวนรอบตัว)
ความสอดคล้องกับเจ้าของ: 60 %
ลักษณะพลัง
• บุคลิก: ใจนิ่งมั่น (ทดสอบ)
• โทนพลัง: น้ำเงิน | หนุนหลังให้มั่น
• พลังซ่อน: ทดสอบ
ภาพรวม
สองประโยคทดสอบ
เหตุผลที่เข้ากับเจ้าของ
สองประโยคทดสอบ
`,
  },
  {
    id: 3,
    note: "พลังหลัก: สมดุล — crystal maps to confidence",
    text: `ระดับพลัง: 7.0 / 10
พลังหลัก: พลังสมดุล (นิ่งในวันวุ่น)
ความสอดคล้องกับเจ้าของ: 55 %
ลักษณะพลัง
• บุคลิก: หนักแน่นมีแก่น (ทดสอบ)
• โทนพลัง: เขียว | สร้างโอกาส
• พลังซ่อน: ทดสอบ
ภาพรวม
สองประโยค
เหตุผลที่เข้ากับเจ้าของ
สองประโยค
`,
  },
  {
    id: 4,
    note: "No พลังหลัก; header has โชค — fallback_body_match",
    text: `ระดับพลัง: 8.0 / 10
ความสอดคล้องกับเจ้าของ: โชคดีในวันนี้
ลักษณะพลัง
• บุคลิก: ทดสอบ
ภาพรวม
ทดสอบ
`,
  },
  {
    id: 5,
    note: "พลังหลัก: โชคลาภ",
    text: `ระดับพลัง: 8.0 / 10
พลังหลัก: พลังโชคลาภ (จังหวะดี)
ความสอดคล้องกับเจ้าของ: 66 %
ลักษณะพลัง
• บุคลิก: ทดสอบ
ภาพรวม
ทดสอบ
`,
  },
];

for (const s of SAMPLES) {
  const inf = mirrorMainEnergyInferenceLikeBuilder(s.text, "crystal");
  console.log(
    JSON.stringify({
      syntheticCase: s.id,
      note: s.note,
      energyCategoryCode: inf.energyCategoryCode,
      REPORT_PAYLOAD_MAIN_ENERGY_INFERENCE: inf,
    }),
  );
}
