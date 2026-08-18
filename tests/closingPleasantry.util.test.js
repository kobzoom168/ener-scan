/**
 * ข้อความปิดบท = เงียบเมื่อจบเรื่องจริง (กบ 18 ส.ค. + Codex รอบ 2)
 * สองชั้น: unconditional เงียบเสมอ · contextual เงียบเฉพาะหลัง terminal reply
 * "สวัสดี" = คำเปิดบท ห้ามเงียบทุกกรณี
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  classifyClosingPleasantry,
  resolveClosingSilence,
} from "../src/core/conversation/closingPleasantry.util.js";

test("unconditional: ขอบคุณ/สาธุ/emoji เงียบเสมอ ไม่ต้องดูบริบท", () => {
  for (const t of ["ขอบคุณ", "ขอบคุณมากๆครับ", "ขอบพระคุณครับ", "สาธุ", "อนุโมทนาสาธุ", "🙏", "🙏🙏"]) {
    assert.equal(classifyClosingPleasantry(t), "unconditional", t);
    assert.equal(resolveClosingSilence({ text: t }).silent, true, t);
    // แม้ข้อความล่าสุดเป็นคำถาม ขอบคุณก็ยังเงียบได้
    assert.equal(
      resolveClosingSilence({ text: t, lastBotReplyType: "object_info_gate_ask", lastBotText: "เป็นพระอะไร วัดไหน" }).silent,
      true,
    );
  }
});

test("สวัสดี = คำเปิดบท ห้ามเงียบทุกกรณี (Codex จับได้)", () => {
  for (const t of ["สวัสดี", "สวัสดีครับ", "สวัสดีค่ะ"]) {
    assert.equal(classifyClosingPleasantry(t), null, t);
    assert.equal(resolveClosingSilence({ text: t, lastBotReplyType: "scan_result", lastBotText: "x" }).silent, false, t);
  }
});

test("contextual: ครับ/โอเค หลัง terminal result = เงียบ", () => {
  for (const t of ["ครับ", "โอเคครับ", "โชคดีครับ", "ฝันดีนะครับ", "บาย", "ok"]) {
    const r = resolveClosingSilence({
      text: t,
      lastBotReplyType: "scan_result",
      lastBotText: "[ส่งรายงานผลสแกนพร้อมการ์ด/เสียงถึงลูกค้าแล้ว]",
    });
    assert.equal(r.silent, true, t);
    assert.equal(r.tier, "contextual");
  }
});

test("contextual: ครับ หลังคำถาม/handoff/ไม่ terminal = ห้ามเงียบ", () => {
  // อาจารย์เพิ่งถาม (gate ask) — ครับ คือคำตอบ
  assert.equal(
    resolveClosingSilence({ text: "ครับ", lastBotReplyType: "object_info_gate_ask", lastBotText: "เป็นพระอะไร วัดไหน พิมพ์ตอบในแชทนี้" }).silent,
    false,
  );
  // handoff ค้าง
  assert.equal(
    resolveClosingSilence({ text: "โอเค", lastBotReplyType: "scan_result", lastBotText: "เดี๋ยวผมเรียนถามอาจารย์ให้นะครับ" }).silent,
    false,
  );
  // consult ตอบด้วยคำถามปิดท้าย
  assert.equal(
    resolveClosingSilence({ text: "ครับ", lastBotReplyType: "gemini_front_consult", lastBotText: "อยากให้ดูด้านไหนเพิ่มไหมครับ" }).silent,
    false,
  );
  // ไม่มีข้อมูลข้อความล่าสุด (อ่าน DB พลาด) = ตอบปกติ
  assert.equal(resolveClosingSilence({ text: "ครับ" }).silent, false);
});

test("เรื่องจริงห้ามโดนเงียบ + state handlers มาก่อน silencer (source order)", () => {
  for (const t of ["ขอบคุณครับ แล้วองค์นี้แขวนคอได้ไหม", "ผลออกยัง", "จ่าย 49", "ประวัติ", "จัดชุด", "เปลี่ยนวันเกิด"]) {
    assert.equal(classifyClosingPleasantry(t), null, t);
  }
  const src = fs.readFileSync(path.join(process.cwd(), "src", "routes", "lineWebhook.js"), "utf8");
  const lane = src.slice(src.indexOf("async function handleTextMessage"));
  const silencerIdx = lane.indexOf("classifyClosingPleasantry");
  assert.ok(silencerIdx > 0);
  // payment route + reg gate + exact utility ต้องมาก่อน silencer
  assert.ok(lane.indexOf("handleUnregisteredText({") < silencerIdx);
  assert.ok(lane.indexOf("runExactUtilityCommandTerminal({") < silencerIdx);
  // payment text route ต้องชนะก่อน — silencer อยู่หลัง (เลน idle utilities)
  assert.ok(lane.indexOf("handlePaymentCommandTextRoute({") < silencerIdx, "payment route ต้องมาก่อน silencer");
});
