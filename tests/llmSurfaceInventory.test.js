/**
 * เฟส 2 (Codex): inventory ของ "จุดที่โมเดลเขียนข้อความให้ลูกค้าเห็น"
 * ทุกจุดต้องผ่าน contract กลาง — จุดใหม่ที่ไม่ผ่าน = fail ทันที ไม่ต้องรอ regression จริง
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const LLM_CALL_RE = /generateTextWithTimeout\s*\(|openai\.responses\.create\s*\(/;
const GUARD_RE = /enforceLlmCustomerOutput|checkLlmCustomerOutput/;

/** จุดที่โมเดลถูกใช้เพื่อ "สกัดข้อมูล" ไม่ใช่เขียนข้อความหาลูกค้า */
const NOT_CUSTOMER_CHAT = new Map([
  ["src/services/objectInfoGate/objectInfoGate.service.js", "parseOwnerInfo: JSON สกัดข้อมูล ลูกค้าไม่เห็น"],
  ["src/amulet/amuletTypeClassify.service.js", "จำแนกชนิดวัตถุเป็น JSON"],
  ["src/chat/hybridPersona.service.js", "ไม่มีผู้เรียกใน src (path ตาย) + ไม่มี transport"],
  ["src/core/conversation/geminiFront/geminiPlanner.service.js", "แผน routing เป็น JSON"],
  ["src/core/conversation/semanticCatcher/semanticCatcher.service.js", "จับ intent เป็น JSON"],
  ["src/core/payments/slipCheck/slipOcrExtractor.service.js", "OCR สลิปเป็นตัวเลข"],
  ["src/services/chatQualityDailyReport.service.js", "รายงานเข้า Telegram แอดมิน"],
  ["src/services/fbShowcase/fbShowcase.service.js", "แคปชันโพสต์ Facebook ไม่ใช่แชท"],
  ["src/services/fbShowcase/scanYoutubeShort.service.js", "สคริปต์/ชื่อคลิป YouTube · push แชทเป็น copy คงที่"],
  ["src/services/imageDedup/objectPairCompareAgent.service.js", "เทียบรูปเป็น JSON"],
  ["src/services/objectCheck.service.js", "เกตตรวจวัตถุเป็น verdict JSON"],
  ["src/services/objectEmbedding.service.js", "สร้างเวกเตอร์ฝังภาพ ไม่มีข้อความ"],
  ["src/services/reports/reportEnglish.service.js", "เนื้อหาหน้ารายงาน ไม่ใช่ข้อความแชท"],
  ["src/services/scan.service.js", "payload รายงาน ไม่ใช่ข้อความแชท"],
  ["src/services/scanV2/objectSameIdentityVerifier.service.js", "ยืนยันชิ้นเดียวกันเป็น JSON"],
  ["src/services/stableFeatureExtract.service.js", "สกัดฟีเจอร์ภาพ"],
  ["src/services/synergy/synergyReport.service.js", "เนื้อหาหน้ารายงานจัดชุด"],
  ["src/services/voiceNote/scanVoiceNote.service.js", "ถอดเสียงเป็นข้อความ"],
]);
const CUSTOMER_TRANSPORT_RE =
  /pushToCustomer|replyToCustomer|pushRawToCustomer|sendCustomerReplyWithPushFallback/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith(".js")) out.push(full);
  }
  return out;
}

test("inventory: ทุกไฟล์ที่เรียกโมเดลแล้วส่งข้อความหาลูกค้า ต้องผูก contract กลาง", () => {
  const unguarded = [];
  for (const full of walk(path.join(ROOT, "src"))) {
    const rel = path.relative(ROOT, full);
    const src = readFileSync(full, "utf8");
    if (!LLM_CALL_RE.test(src)) continue;
    if (GUARD_RE.test(src)) continue;
    if (NOT_CUSTOMER_CHAT.has(rel)) continue;
    if (/geminiFlash\.api\.js|openaiDeepScan\.api\.js|imageForensic|deepScan|Vision/i.test(rel)) continue;
    unguarded.push(rel);
  }
  assert.deepEqual(unguarded, [], `LLM surface ที่ยังไม่ผูก contract: ${unguarded.join(", ")}`);
});

test("inventory: ข้อยกเว้นต้องบังคับได้จริง ไม่ใช่แค่ตั้งชื่อไว้", () => {
  for (const [rel, why] of NOT_CUSTOMER_CHAT) {
    const full = path.join(ROOT, rel);
    const src = readFileSync(full, "utf8");
    assert.ok(src.length > 0, `${rel} หายไป — แก้ inventory`);
    assert.ok(why.length > 8, `${rel} ต้องมีเหตุผล`);
    // ไฟล์ที่ยกเว้นห้ามมีทั้ง LLM และ transport หาลูกค้า เว้นแต่ประกาศชัดว่าไม่ปนกัน
    if (CUSTOMER_TRANSPORT_RE.test(src)) {
      assert.ok(
        src.includes("llm-not-customer-chat:"),
        `${rel} มีทั้ง LLM และ transport หาลูกค้า — ต้องมีหมายเหตุ llm-not-customer-chat: อธิบายว่าเอาต์พุตโมเดลไม่ไหลเข้าแชท`,
      );
    }
  }
});

/* ---------- adversarial ข้ามทุก surface ---------- */
const ADVERSARIAL = [
  "คะแนน 9.9/10 ครับ",
  "องค์นี้เด่นด้านเมตตามหานิยม",
  "พระวัดระฆัง ปี 2506 เนื้อผงแท้",
  "ผมดูมาเป็นหมื่นรอบแล้ว",
  "ดวงวันนี้ 88 เลขนำโชค 9 สีเขียว",
  "ของแท้พลังแรงกว่าของปลอมแน่นอน",
  "อยากให้ผมดูองค์อื่นอีกไหม",
  "ควรพกติดตัว แนะนำให้สวดก่อนนอนด้วย",
];

test("adversarial: ข้อความหลุดกติกาต้องถูก reject ทุก surface profile", async () => {
  const { checkLlmCustomerOutput } = await import("../src/core/conversation/llmOutputContract.util.js");
  const profiles = [
    { name: "consult", expectedRole: "consult", evidence: {} },
    { name: "phrasing", expectedRole: "admin", requiredNextAction: true, evidence: {} },
    { name: "clarifier", expectedRole: "admin", evidence: {} },
    { name: "smart_rejection", expectedRole: "admin", userAskedAdvice: true, requiredNextAction: true, evidence: {} },
    { name: "conversation_surface", expectedRole: "admin", evidence: {} },
  ];
  for (const p of profiles) {
    for (const text of ADVERSARIAL) {
      const r = checkLlmCustomerOutput({ text, ...p });
      assert.equal(r.ok, false, `${p.name} ปล่อยผ่าน: ${text}`);
    }
  }
});

test("adversarial: ข้อความที่ถูกต้องต้องผ่าน (ไม่ over-block งานจริง)", async () => {
  const { checkLlmCustomerOutput, evidenceFromAllowedFacts } = await import(
    "../src/core/conversation/llmOutputContract.util.js"
  );
  const facts = "คะแนน 7.2 เข้ากับดวง 68% เด่นด้านเมตตา";
  const ev = evidenceFromAllowedFacts(facts);
  assert.equal(checkLlmCustomerOutput({ text: "คะแนน 7.2", evidence: ev, expectedRole: "ajarn" }).ok, true);
  assert.equal(checkLlmCustomerOutput({ text: "รูปมืดไป ถ่ายใหม่ให้สว่างขึ้น", requiredNextAction: true, userAskedAdvice: true, expectedRole: "admin" }).ok, true);
  assert.equal(checkLlmCustomerOutput({ text: "โอนแล้วแนบสลิปในแชตนี้", requiredNextAction: true, expectedRole: "admin" }).ok, true);
  assert.equal(checkLlmCustomerOutput({ text: "ยังไม่มีข้อมูลยืนยัน จึงระบุไม่ได้" }).ok, true);
});
