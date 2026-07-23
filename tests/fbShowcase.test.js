import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractShowcasePiece,
  sanitizeFbCaption,
} from "../src/services/fbShowcase/fbShowcase.service.js";

const basePayload = () => ({
  publicToken: "abc12345TOKEN",
  objectImageUrl: "https://cdn.example.com/x.jpg",
  summary: { energyScore: 8.4 },
  amuletV1: {
    flexSurface: { heroNamingLine: "พระสายเมตตา เนื้อผงเก่า" },
    powerCategories: {
      metta: { labelThai: "เมตตามหานิยม", score: 86 },
      guard: { labelThai: "แคล้วคลาด", score: 71 },
    },
  },
});

test("extractShowcasePiece: เลนพระ + คะแนน + รูป + token ครบ → ได้ชิ้นพร้อมด้านเด่น", () => {
  const p = extractShowcasePiece(basePayload());
  assert.ok(p);
  assert.equal(p.token, "abc12345TOKEN");
  assert.equal(p.name, "พระสายเมตตา เนื้อผงเก่า");
  assert.equal(p.energyScore, 8.4);
  assert.equal(p.peakLabel, "เมตตามหานิยม");
});

test("extractShowcasePiece: ไม่ใช่เลนพระ (กำไลหิน) → null (การ์ดยังไม่รองรับ)", () => {
  const payload = basePayload();
  delete payload.amuletV1;
  payload.crystalBraceletV1 = { flexSurface: {} };
  assert.equal(extractShowcasePiece(payload), null);
});

test("extractShowcasePiece: ไม่มีรูปวัตถุ https → null", () => {
  const payload = basePayload();
  payload.objectImageUrl = "";
  assert.equal(extractShowcasePiece(payload), null);
});

test("extractShowcasePiece: token รูปแบบผิด → null", () => {
  const payload = basePayload();
  payload.publicToken = "no";
  assert.equal(extractShowcasePiece(payload), null);
});

test("sanitizeFbCaption: ตัด em dash และเครื่องหมายคำพูดตามกติกาภาษา", () => {
  const out = sanitizeFbCaption('พลังนิ่ง — ลึก "สายเมตตา" ครับ');
  assert.ok(!out.includes("—"));
  assert.ok(!out.includes('"'));
  assert.equal(out, "พลังนิ่ง ลึก สายเมตตา ครับ");
});

// ─── การ์ดโฉมรูปเต็ม (กบเคาะ 23 ก.ค.) ───
import { deriveShowcaseCardData } from "../src/services/fbShowcase/showcasePhotoCard.service.js";

const cardPayload = () => ({
  objectImageUrl: "https://cdn.example.com/x.jpg",
  summary: { energyScore: 8.5, energyLevelLabel: "A", compatibilityPercent: 76 },
  amuletV1: {
    flexSurface: { heroNamingLine: "พระ/เทวรูป · ปกป้อง" },
    powerCategories: {
      luck: { score: 76, labelThai: "โชคลาภและการเปิดทาง" },
      metta: { score: 70, labelThai: "เมตตาและคนเอ็นดู" },
      baramee: { score: 91, labelThai: "บารมีและอำนาจนำ" },
      specialty: { score: 67, labelThai: "งานเฉพาะทาง" },
      protection: { score: 84, labelThai: "คุ้มครองป้องกัน" },
      fortune_anchor: { score: 61, labelThai: "หนุนดวงและการตั้งหลัก" },
    },
  },
});

test("deriveShowcaseCardData: ชื่อ = ส่วนหลัง · + แกนครบ 6 + สกิลท็อป 2 เรียงถูก", () => {
  const d = deriveShowcaseCardData(cardPayload());
  assert.ok(d);
  assert.equal(d.name, "บารมี"); // ชื่อ = แกนคะแนนสูงสุดจริง (กบ 23 ก.ค.)
  assert.equal(d.axes.length, 6);
  assert.equal(d.axes[2].label, "บารมี");
  assert.equal(d.skills[0].labelFull, "บารมีและอำนาจนำ");
  assert.equal(d.skills[0].score, 91);
  assert.equal(d.skills[1].score, 84);
  assert.equal(d.grade, "A");
  assert.equal(d.compat, 76);
});

test("deriveShowcaseCardData: เกรดต่ำกว่า B → ไม่ขึ้นเกรดบนการ์ด (null)", () => {
  const p = cardPayload();
  p.summary.energyScore = 4.2;
  p.summary.energyLevelLabel = "D";
  const d = deriveShowcaseCardData(p);
  assert.ok(d);
  assert.equal(d.grade, null);
});

test("deriveShowcaseCardData: ไม่ใช่เลนพระ → null", () => {
  const p = cardPayload();
  delete p.amuletV1;
  assert.equal(deriveShowcaseCardData(p), null);
});
