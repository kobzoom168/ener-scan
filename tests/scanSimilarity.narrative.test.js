import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scoreTooSimilarToRecent,
  extractNarrativeCoreForSimilarity,
  computePairSimilarityScores,
  USER_FULL_NEAR_DUP_WORD,
} from "../src/utils/similarity.js";
import { buildRetryHint } from "../src/services/scan.service.js";

const HEADER = `🔮 ผลการตรวจพลังวัตถุ โดย อาจารย์ Ener

`;

const TEMPLATE_A = `${HEADER}ระดับพลัง: 8.2 / 10
พลังหลัก: ป้องกัน
ความสอดคล้องกับเจ้าของ: 78%

ลักษณะพลัง
• บุคลิก: โดดเด่นด้านคุ้มกัน

• คุ้มกัน: ★★★★☆ — 4/5 ดาว
• สมดุล: ★★★☆☆ — 3/5 ดาว
• อำนาจ: ★★★☆☆ — 3/5 ดาว
• เมตตา: ★★☆☆☆ — 2/5 ดาว
• ดึงดูด: ★★☆☆☆ — 2/5 ดาว

ภาพรวม
ชิ้นนี้เน้นการยืนหยัดเวลาโดนกดดันเรื่องงาน ให้ความรู้สึกมั่นใจแบบเงียบๆ ไม่โอ้อวด เหมาะกับช่วงที่ต้องตัดสินใจสำคัญ

เหตุผลที่เข้ากับเจ้าของ
โยงกับคนที่กำลังขยับงานใหม่หรือรับความรับผิดชอบหนักขึ้น ต้องการเสาหลักทางใจมากกว่าคำปลอบ

ชิ้นนี้หนุนเรื่อง
• ตั้งเจตนาก่อนนำเสนองาน
• พักสมองหลังประชุมยาว

เหมาะใช้เมื่อ
• ช่วงก่อนเซ็นสัญญา
• วันที่ต้องเดินทางไกล

อาจไม่เด่นเมื่อ
ต้องการโฟกัสเรื่องเสน่ห์หรือการเจรจาแบบอ่อนหวาน

ควรใช้แบบไหน
พกในกระเป๋าเสื้อหรือวางโต๊ะทำงานด้านขวา

ปิดท้าย
หากมีอีกชิ้นอยากให้ช่วยเปรียบเทียบ ส่งมาได้ครับ`;

const TEMPLATE_B = `${HEADER}ระดับพลัง: 8.2 / 10
พลังหลัก: ป้องกัน
ความสอดคล้องกับเจ้าของ: 78%

ลักษณะพลัง
• บุคลิก: โดดเด่นด้านคุ้มกัน

• คุ้มกัน: ★★★★☆ — 4/5 ดาว
• สมดุล: ★★★☆☆ — 3/5 ดาว
• อำนาจ: ★★★☆☆ — 3/5 ดาว
• เมตตา: ★★☆☆☆ — 2/5 ดาว
• ดึงดูด: ★★☆☆☆ — 2/5 ดาว

ภาพรวม
ลายพลังเน้นความนิ่งท่ามกลางความวุ่นวายในครอบครัว ช่วยกันทำใจให้เย็นเวลามีข่าวกระทบกันทางอารมณ์ ไม่ใช่แนวหาโชคลาภ

เหตุผลที่เข้ากับเจ้าของ
สอดคล้องกับคนที่รับบทดูแลผู้อาวุโสหรือประสานงานหลายฝ่าย ต้องการพลังกลางที่ไม่แหลมคม

ชิ้นนี้หนุนเรื่อง
• สร้างกติกาชัดก่อนคุยกันในบ้าน
• แบ่งเวลาพักตาหลังดูแลผู้ป่วย

เหมาะใช้เมื่อ
• ช่วงปรับบทบาทในครอบครัว
• ก่อนคุยเรื่องสำคัญกับญาติ

อาจไม่เด่นเมื่อ
อยากเสริมด้านการแข่งขันหรือการเจรจาเชิงรุกแบบเปิดเกม

ควรใช้แบบไหน
เก็บในซองผ้าแยกจากเครื่องประดับอื่น เปิดดูเมื่อต้องตั้งสติ

ปิดท้าย
ส่งภาพชิ้นอื่นมาเปรียบเทียบพลังคนละแบบได้ครับ`;

test("narrative core excludes score template overlap", () => {
  const c1 = extractNarrativeCoreForSimilarity(TEMPLATE_A);
  const c2 = extractNarrativeCoreForSimilarity(TEMPLATE_B);
  assert.ok(c1.length >= 48 && c2.length >= 48);
  assert.ok(!c1.includes("★★★"));
});

test("same user: different object-like bodies should not trip user-recent guard", () => {
  const u = scoreTooSimilarToRecent(TEMPLATE_B, [TEMPLATE_A], "user");
  assert.equal(u.tooSimilar, false, "narrative differs despite same score block");
});

test("same user: near-duplicate full text still rejects", () => {
  const u = scoreTooSimilarToRecent(TEMPLATE_A, [TEMPLATE_A], "user");
  assert.equal(u.tooSimilar, true);
  assert.equal(u.matchKind, "full_near_dup");
});

test("structured labels same, narrative different: pair scores show lower narrative than full", () => {
  const s = computePairSimilarityScores(TEMPLATE_A, TEMPLATE_B);
  assert.ok(s.narrativeWord < s.fullWord, "narrative should diverge more than full template");
});

test("full-text near-duplicate threshold catches high overlap", () => {
  const s = computePairSimilarityScores(TEMPLATE_A, TEMPLATE_A);
  assert.ok(s.fullWord >= USER_FULL_NEAR_DUP_WORD - 0.01);
});

test("retry hint for too_similar_user_recent includes anti-echo and stronger instructions", () => {
  const hint = buildRetryHint("ภาพรวม\nซ้ำกันมาก", 1, "too_similar_user_recent");
  assert.match(hint, /โฟกัสที่ย่อหน้า/);
  assert.match(hint, /ห้ามพิมพ์ซ้ำ/);
  assert.match(hint, /ช่วงนี้ของรอบก่อน/);
});

test("retry hint for too_short does not add anti-echo block", () => {
  const hint = buildRetryHint("x", 1, "too_short");
  assert.equal(hint.includes("ห้ามพิมพ์ซ้ำ"), false);
});
