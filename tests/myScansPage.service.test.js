/**
 * "ผลสแกนของฉัน" (กบเคาะ 14 ส.ค. 2569) — ล็อกกติกาที่เคาะกับ Codex:
 * stored values เท่านั้น · ยุบเฉพาะ identity ตรง · fallback ครบ · token ปลอดภัย
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isValidMyScansTokenFormat,
  hashPageToken,
  tokenPrefixForLog,
  extractMyScanItem,
  groupMyScanItemsByIdentity,
  formatThaiDateBE,
  renderMyScansHtml,
  buildMyScansFlexCard,
  MYSCANS_PAGE_SIZE,
} from "../src/services/myscans/myScansPage.service.js";

const row = (over = {}) => ({
  report_payload_json: {
    object: {
      objectLabel: "พระสมเด็จวัดระฆัง",
      objectType: "พระเครื่อง",
      objectImageUrl: "https://img.example/a.jpg",
    },
    summary: { energyScore: 7.5, compatibilityPercent: 87 },
    diagnostics: { baselineIdPrefix: "abc12345" },
    ...over.payload,
  },
  html_public_token: over.reportToken ?? "tok_abc",
  created_at: over.createdAt ?? "2026-08-14T05:00:00Z",
});

test("token: format ms_+32hex · hash sha256 · log ได้แค่ prefix", () => {
  const t = "ms_" + "a1".repeat(16);
  assert.equal(isValidMyScansTokenFormat(t), true);
  assert.equal(isValidMyScansTokenFormat("syn_abc"), false);
  assert.equal(isValidMyScansTokenFormat("ms_xyz"), false);
  assert.equal(hashPageToken(t).length, 64);
  assert.notEqual(hashPageToken(t), t);
  assert.equal(tokenPrefixForLog(t).length, 8);
});

test("extract: อ่านค่าที่บันทึกไว้เท่านั้น + fallback ชื่อ generic/รูปพัง/คะแนนหาย", () => {
  const full = extractMyScanItem(row());
  assert.equal(full.name, "พระสมเด็จวัดระฆัง");
  assert.equal(full.score10, 7.5);
  assert.equal(full.compatPct, 87);
  assert.equal(full.identity, "abc12345");

  const generic = extractMyScanItem(row({ payload: { object: { objectLabel: "วัตถุจากการสแกน", objectImageUrl: "http://insecure/x.jpg" } } }));
  assert.equal(generic.name, null); // → หน้าเว็บโชว์ "วัตถุมงคลที่สแกน"
  assert.equal(generic.img, null); // ไม่ใช่ https → placeholder

  const noScore = extractMyScanItem(row({ payload: { summary: {} } }));
  assert.equal(noScore.score10, null); // ห้ามโชว์ 0
  assert.equal(noScore.compatPct, null);

  // เช็คก่อนเช่า ไม่ใช่ของลูกค้า — ตัดออก
  assert.equal(extractMyScanItem(row({ payload: { precheckMode: true } })), null);
});

test("dedupe: ยุบเฉพาะ identity ตรงกัน · ไม่มี identity = แสดงแยก (Codex ข้อ 2)", () => {
  const a1 = extractMyScanItem(row());
  const a2 = extractMyScanItem(row({ createdAt: "2026-08-10T05:00:00Z" }));
  const noId1 = extractMyScanItem(row({ payload: { diagnostics: {} } }));
  const noId2 = extractMyScanItem(row({ payload: { diagnostics: {} } }));
  const grouped = groupMyScanItemsByIdentity([a1, a2, noId1, noId2]);
  // a1+a2 ยุบ (identity เดียวกัน เก็บครั้งล่าสุด + นับครั้ง) · noId แสดงแยกทั้งคู่
  assert.equal(grouped.length, 3);
  assert.equal(grouped[0].scanCount, 2);
  assert.equal(grouped[0].createdAt, "2026-08-14T05:00:00Z");
  assert.equal(grouped[1].scanCount, 1);
});

test("วันที่ไทย พ.ศ. เวลาไทย", () => {
  assert.equal(formatThaiDateBE("2026-08-14T05:00:00Z"), "14 ส.ค. 2569");
  // ข้ามวันตามเวลาไทย (19:00Z = 02:00+07 วันถัดไป)
  assert.equal(formatThaiDateBE("2026-08-14T19:00:00Z"), "15 ส.ค. 2569");
});

test("render: 5 ต่อหน้า · ดูเพิ่มเติมเฉพาะมีเกิน · เคยสแกน N ครั้ง · ปุ่มรายงานปิดเมื่อ token หาย", () => {
  const items = Array.from({ length: 7 }, (_, i) => ({
    ...extractMyScanItem(row()),
    identity: `id${i}`,
    scanCount: i === 0 ? 3 : 1,
    reportToken: i === 1 ? null : "tok",
  }));
  const token = "ms_" + "ab".repeat(16);
  const html = renderMyScansHtml({ items, offset: 0, total: 7, token });
  assert.match(html, /ดูเพิ่มเติมอีก 2 รายการ/);
  assert.match(html, /เคยสแกน 3 ครั้ง/);
  assert.match(html, /รายงานเต็มไม่พร้อมใช้งานแล้ว/);
  assert.match(html, /noindex/);
  // หน้า 2: ไม่มีปุ่มดูเพิ่ม + มีปุ่มกลับหน้าแรก
  const p2 = renderMyScansHtml({ items, offset: 5, total: 7, token });
  assert.doesNotMatch(p2, /ดูเพิ่มเติมอีก/);
  assert.match(p2, /กลับหน้าแรก/);
  // ไม่มี LINE user ID บนหน้า (token เท่านั้น)
  assert.doesNotMatch(html, /U[0-9a-f]{32}/);
  assert.equal(MYSCANS_PAGE_SIZE, 5);
});

test("LINE card: ใบเดียว ปุ่มเดียว (Codex ข้อ 5) ไม่มีอีโมจิ", () => {
  const card = buildMyScansFlexCard({ url: "https://x/myscans/ms_ab", total: 5 });
  assert.equal(card.type, "flex");
  assert.equal(card.contents.type, "bubble"); // ไม่ใช่ carousel
  const btns = JSON.stringify(card).match(/"type":"button"/g) || [];
  assert.equal(btns.length, 1);
  assert.doesNotMatch(card.altText, /[\u{1F300}-\u{1FAFF}]/u);
});
