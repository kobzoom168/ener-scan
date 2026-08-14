import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectAjarnMoneyBreach,
  detectRepeatedBotMessages,
  detectDanglingHandoff,
  prioritizeUsers,
} from "../src/services/chatQualityDeterministic.util.js";
import { ANALYZER_SYSTEM } from "../src/services/chatQualityDailyReport.service.js";

const t0 = Date.parse("2026-08-11T03:00:00Z");
const row = (min, role, text, meta = null) => ({
  role,
  text,
  created_at: new Date(t0 + min * 60_000).toISOString(),
  ...(meta ? { metadata_json: meta } : {}),
});

test("อาจารย์+คำเงิน = critical / แอดมินพูดเงิน = ไม่โดน", () => {
  const rows = [
    row(0, "bot", "ค่าครู 49 บาทครับ โอนแล้วส่งสลิปมาได้เลย", { speakerRole: "admin" }),
    row(1, "bot", "ชิ้นนี้เด่นเมตตา ถ้าอยากดูลึกมีค่าครู 49 บาทครับ", { speakerRole: "ajarn" }),
    row(2, "bot", "ชิ้นนี้เด่นด้านคุ้มครองครับ", { speakerRole: "ajarn" }),
    row(3, "bot", "โอนแล้วส่งสลิปมาครับ"), // ไม่มี tag = ไม่ฟันธง
  ];
  const found = detectAjarnMoneyBreach(rows);
  assert.equal(found.length, 1);
  assert.equal(found[0].severity, "high");
  assert.match(found[0].quote, /49 บาท/);
});

test("ข้อความเดิมซ้ำ 3 ครั้งใน 10 นาที = จับ / ห่างเกิน window = ไม่จับ", () => {
  const spam = [
    row(0, "bot", "ขอข้อมูลองค์นี้หน่อยครับ"),
    row(2, "bot", "ขอข้อมูลองค์นี้หน่อยครับ"),
    row(4, "bot", "ขอข้อมูลองค์นี้หน่อยครับ"),
  ];
  assert.equal(detectRepeatedBotMessages(spam).length, 1);
  const spread = [
    row(0, "bot", "สวัสดีครับ"),
    row(30, "bot", "สวัสดีครับ"),
    row(60, "bot", "สวัสดีครับ"),
  ];
  assert.equal(detectRepeatedBotMessages(spread).length, 0);
});

test("marker ภายใน [ส่งรายงาน...] ซ้ำกี่ครั้งก็ไม่จับ (สแกนหลายชิ้นติดกัน — false alarm 13 ส.ค.)", () => {
  const markers = [
    row(0, "bot", "[ส่งรายงานผลสแกนพร้อมการ์ด/เสียงถึงลูกค้าแล้ว]"),
    row(2, "bot", "[ส่งรายงานผลสแกนพร้อมการ์ด/เสียงถึงลูกค้าแล้ว]"),
    row(4, "bot", "[ส่งรายงานผลสแกนพร้อมการ์ด/เสียงถึงลูกค้าแล้ว]"),
  ];
  assert.equal(detectRepeatedBotMessages(markers).length, 0);
});

test("post-rollout ไม่มี tag = ไม่นับเป็นคำตอบ (กัน metadata regression) / consult ไม่นับ", () => {
  // ใช้เวลาแบบหลังวัน rollout metadata (13 ส.ค.) — no-tag ต้องไม่ผ่านเป็น legacy
  const t1 = Date.parse("2026-08-13T03:00:00Z");
  const late = (min, role, text, meta = null) => ({
    role,
    text,
    created_at: new Date(t1 + min * 60_000).toISOString(),
    ...(meta ? { metadata_json: meta } : {}),
  });
  const admin = { speakerRole: "admin", replyType: "x" };
  const rows = [
    late(0, "user", "ถามหน่อย"),
    late(1, "bot", "เดี๋ยวผมเรียนถามอาจารย์ให้ครับ", admin),
    late(2, "bot", "ข้อความไม่มี tag (หลัง rollout)"),
    late(3, "bot", "ตอบแบบ consult", { speakerRole: "consult" }),
  ];
  assert.equal(detectDanglingHandoff(rows).length, 1);
});

test("handoff แล้วเงียบ = จับ / มีคำตอบตามมา = ไม่จับ", () => {
  const dangling = [
    row(0, "user", "องค์นี้เหมาะกับงานไหม"),
    row(1, "bot", "เดี๋ยวผมเรียนถามอาจารย์ให้ครับ"),
    row(15, "user", "ครับ"),
  ];
  assert.equal(detectDanglingHandoff(dangling).length, 1);
  const answered = [
    row(0, "user", "องค์นี้เหมาะกับงานไหม"),
    row(1, "bot", "เดี๋ยวผมเรียนถามอาจารย์ให้ครับ"),
    row(3, "bot", "อาจารย์มองว่าเหมาะกับงานเจรจาครับ"),
  ];
  assert.equal(detectDanglingHandoff(answered).length, 0);
});

test("prioritizeUsers: ด่า > เงิน > คุยเยอะ และตัดคนไม่มีข้อความลูกค้า", () => {
  const byUser = new Map([
    ["quiet", [row(0, "bot", "แจ้งเตือนรายวัน")]],
    ["normal", [row(0, "user", "สวัสดี"), row(1, "bot", "สวัสดีครับ")]],
    ["payer", [row(0, "user", "โอนแล้วส่งสลิปตรงไหน"), row(1, "bot", "แนบในแชทได้เลยครับ")]],
    ["angry", [row(0, "user", "รอนานมาก ทำไมยังไม่ได้ผล"), row(1, "bot", "ขอโทษด้วยครับ")]],
  ]);
  const order = prioritizeUsers(byUser);
  assert.deepEqual(order.slice(0, 2), ["angry", "payer"]);
  assert.ok(!order.includes("quiet"));
});

test("analyzer prompt รู้จัก 2 บทบาท และไม่ตีแอดมินเป็นการหลุดบท", () => {
  assert.ok(ANALYZER_SYSTEM.includes("TWO ROLES"));
  assert.ok(ANALYZER_SYSTEM.includes("never flag admin voice as persona break"));
  // บรรทัดหลุดบทต้องไม่มีคำว่า แอดมิน ในลิสต์คำต้องห้ามอีก
  const breachLine = ANALYZER_SYSTEM.split("\n").find((l) => l.startsWith("- หลุดบท"));
  // ลิสต์คำหลุดบทเดิมคือ "AI/บอท/ระบบ/โมเดล/แอดมิน" — คำว่า แอดมิน ต้องหลุดจากลิสต์นั้นแล้ว
  assert.ok(breachLine && !breachLine.includes("โมเดล/แอดมิน"));
  assert.ok(breachLine.includes("NOT a break"));
  // อาจารย์พูดเงินต้องถูกระบุเป็น violation ร้ายแรง
  assert.ok(ANALYZER_SYSTEM.includes("อาจารย์พูดเรื่องเงิน"));
});

test("handoff + ข้อความแอดมิน (tagged) = ยัง dangling / + scan_result = จบ (Codex H5)", () => {
  const admin = { speakerRole: "admin", replyType: "quota_notice" };
  const scanDone = { speakerRole: "ajarn", replyType: "scan_result" };
  const stillDangling = [
    row(0, "user", "องค์นี้เหมาะไหม"),
    row(1, "bot", "เดี๋ยวผมเรียนถามอาจารย์ให้ครับ", admin),
    row(2, "bot", "ตอนนี้เหลือสิทธิ์ 2 ครั้งครับ", admin),
  ];
  assert.equal(detectDanglingHandoff(stillDangling).length, 1);
  const completed = [
    row(0, "user", "องค์นี้เหมาะไหม"),
    row(1, "bot", "เดี๋ยวผมเรียนถามอาจารย์ให้ครับ", admin),
    row(3, "bot", "[ส่งรายงานผลสแกนพร้อมการ์ด/เสียงถึงลูกค้าแล้ว]", scanDone),
  ];
  assert.equal(detectDanglingHandoff(completed).length, 0);
});
