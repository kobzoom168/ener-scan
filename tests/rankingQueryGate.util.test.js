/**
 * เกตอันดับในแชท (กบ 18 ส.ค.): ลูกค้าไม่มีประวัติจ่ายใน 3 วัน ถามอันดับ/แรงสุด
 * → ชี้ไปรายงานหลัก ห้ามหลุดคำตอบที่หน้ารายงานเซ็นเซอร์
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isRankingQuery, buildRankingRedirectText } from "../src/services/lineWebhook/rankingQueryGate.util.js";

test("จับคำถามอันดับจริง (เคสตี 1-5) — คำถามปกติไม่โดน", () => {
  for (const t of [
    "องค์ไหนคะแนนสูงสุด", "ชิ้นไหนแรงสุด", "พระองค์ไหนดีที่สุด", "จัดอันดับให้หน่อย",
    "อันดับในคลังผมเป็นไง", "ชิ้นไหนเด่นสุดครับ", "top 3 ของผมมีอะไรบ้าง", "เทียบคะแนนให้หน่อย",
  ]) {
    assert.equal(isRankingQuery(t), true, t);
  }
  for (const t of [
    "องค์นี้พลังด้านไหนเด่น", "พระสมเด็จวัดระฆังดีไหม", "ผลออกยัง", "จ่าย 49", "ประวัติ",
    "แขวนคอได้ไหมครับ", "ขอบคุณครับ",
  ]) {
    assert.equal(isRankingQuery(t), false, t);
  }
});

test("redirect copy: ชี้เลื่อนลงด้านล่างของรายงาน + ลิงก์จริง — ไม่มีตัวเลข/ชื่อชิ้น/คำเงิน", () => {
  const txt = buildRankingRedirectText("https://scan.my-ener.uk/r/rpt_abc");
  // smoke 24 ส.ค.: copy เดิม 163 ตัว/3 บรรทัด โดน step limit → ต้อง ≤120 และ ≤2 บรรทัด
  assert.equal(txt, "อันดับอยู่ท้ายรายงานชิ้นล่าสุด\nhttps://scan.my-ener.uk/r/rpt_abc");
  assert.ok(txt.split("\n").length <= 2 && [...txt].length <= 120);
  assert.doesNotMatch(txt, /บาท|จ่าย|ค่าครู|แพ็ก|ราคา/);
  assert.doesNotMatch(txt, /\d+\s*\/\s*10|คะแนน \d/);
});

test("consult ตัด axisTop เมื่อไม่มีสิทธิ์ (source invariant)", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync("src/core/conversation/geminiFront/geminiConsult.service.js", "utf8");
  assert.match(src, /if \(!rankingAllowed\) axisTop = null/);
  assert.match(src, /hasRecentPaidAccess/);
});
