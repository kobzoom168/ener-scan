/**
 * P1-3 (Codex raw log 19-20 ส.ค. 2026): static chat copy โทนแข็ง —
 * ตัด ครับ/สัญญาเวลา(เดี๋ยว·นาที·ผลมา)/เพ่ง/emoji/คำปลอบ/CTA เกินจำเป็น
 * และข้อความอัตโนมัติที่มี URL/CTA ต้องเป็นเสียงแอดมิน ไม่ปนคำอ้างอาจารย์ (C6)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (...p) => fs.readFileSync(path.join(process.cwd(), ...p), "utf8");

// คำต้องห้ามใน static copy ชุดนี้ (เช็คเป็น token ตรง ๆ ใน copy ที่แก้)
const BANNED_IN_COPY = ["ครับ", "เดี๋ยว", "นาที", "ผลมา", "เพ่ง", "✨", "🙏", "นะ"];

function extractStrings(src, anchor, span = 900) {
  const i = src.indexOf(anchor);
  assert.ok(i >= 0, `หา anchor ไม่เจอ: ${anchor}`);
  return src.slice(i, i + span);
}

test("pre_scan_ack: 'รับรูปแล้ว' ล้วน — ไม่มีสัญญาเวลา/อนาคต/ครับ", () => {
  const src = read("src", "services", "scanV2", "webhookImageIngestion.service.js");
  const block = extractStrings(src, "const PRE_SCAN_ACK_VARIANTS", 400);
  assert.ok(block.includes('"รับรูปแล้ว"'));
  for (const w of BANNED_IN_COPY) {
    const copyLines = block.split("\n").filter((l) => l.trim().startsWith('"'));
    assert.ok(!copyLines.some((l) => l.includes(w)), `ack ห้ามมีคำ "${w}"`);
  }
});

test("object_info_gate_ask: ขอข้อมูลแบบตรง ไม่มีครับ/คำอวยพลัง", () => {
  const src = read("src", "services", "objectInfoGate", "objectInfoGate.service.js");
  assert.ok(src.includes("ขอชื่อ วัด รุ่นหรือปีของชิ้นนี้ รู้เท่าไหนตอบเท่านั้น"));
  assert.ok(!src.includes("อ่านพลังเสร็จแล้วครับ"), "copy เดิมต้องหายไป");
  // ไว้ก่อน/ปฏิเสธ → รับทราบ (ไม่สัญญาว่าเดี๋ยวส่งผล)
  assert.ok(src.includes('text: "รับทราบ"'));
  assert.ok(!src.includes("เดี๋ยวอาจารย์ส่งผลให้เลย"));
});

test("unsupported object: สั้น ตรง ไม่มี ครับ/emoji/คำปลอบ", async () => {
  const { getUnsupportedObjectReplyCandidates } = await import("../src/utils/webhookText.util.js");
  const cands = getUnsupportedObjectReplyCandidates();
  assert.ok(cands[0].includes("ชิ้นนี้ยังอ่านไม่ได้"));
  assert.ok(cands[0].includes("เต็มกรอบ"));
  for (const c of cands) {
    for (const w of ["ครับ", "นะ", "🙏", "✨", "เดี๋ยว"]) {
      assert.ok(!c.includes(w), `unsupported copy ห้ามมี "${w}": ${c}`);
    }
  }
});

test("YouTube push: เหลือ 'คลิปของชิ้นนี้: URL' — ไม่มี CTA แชร์/ครับ/emoji", () => {
  const src = read("src", "services", "fbShowcase", "scanYoutubeShort.service.js");
  assert.ok(src.includes("คลิปของชิ้นนี้: ${url}"));
  assert.ok(!src.includes("กดดูแล้วแชร์"), "CTA แชร์ต้องหายไป");
  assert.ok(!src.includes("ขึ้นคลิปในช่อง YouTube ของอาจารย์แล้วครับ"));
});

test("Synergy push/reply: URL/CTA เสียงแอดมิน — ไม่มีคำอ้างอาจารย์/ครับ ปนในข้อความ + history ติด speakerRole admin", () => {
  const intro = read("src", "services", "synergy", "synergyIntro.service.js");
  assert.ok(!intro.includes("อาจารย์จัดชุดให้ได้แล้วครับ"), "copy เดิมต้องหายไป");
  assert.ok(intro.includes('speakerRole: "admin"'), "history ต้องรู้ว่าเป็นเสียงแอดมิน");
  assert.ok(!/text = \[[^\]]*อาจารย์/s.test(intro), "ข้อความ intro ห้ามอ้างอาจารย์");
  const wh = read("src", "routes", "lineWebhook.js");
  assert.ok(!wh.includes("อาจารย์จัดชุดจากคลังของคุณ"), "จัดชุด reply ต้องเป็นเสียงแอดมิน");
  assert.ok(wh.includes("ชุดประจำวันจากคลังของคุณ"));
  // ห้ามคำ "ระบบ" หลุดใน copy จัดชุด (หลุดบทเผย AI)
  const synBlock = wh.slice(wh.indexOf("maybeHandleSynergyRequest"), wh.indexOf("maybeHandleSynergyRequest") + 2500);
  assert.ok(!synBlock.includes("ระบบจัดชุด"), 'ห้ามคำ "ระบบ" ใน copy ลูกค้าเห็น');
});
