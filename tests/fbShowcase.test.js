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
