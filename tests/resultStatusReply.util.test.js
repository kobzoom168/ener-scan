/**
 * "ผลออกยัง" ตอบจากสถานะจริง (Codex 17 ส.ค. รอบ 2) — exhaustive switch:
 * cancelled/unknown ห้าม claim ผลออก · delivered ใช้ token ของ job เท่านั้น ·
 * ไม่มีคำสัญญาเวลา
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveResultStatusReply } from "../src/services/scanV2/resultStatusReply.util.js";

test("ทุกสถานะได้คำตอบถูกแขนง — cancelled/unknown ไม่ claim ว่าผลออก", () => {
  for (const st of ["queued", "processing", "claimed"]) {
    const r = resolveResultStatusReply({ status: st });
    assert.equal(r.claimsDelivered, false);
    assert.match(r.reply, /คิว|กำลังอ่าน/);
  }
  const dq = resolveResultStatusReply({ status: "delivery_queued" });
  assert.equal(dq.claimsDelivered, false);
  assert.match(dq.reply, /กำลังส่ง/);
  const failed = resolveResultStatusReply({ status: "failed" });
  assert.equal(failed.claimsDelivered, false);
  assert.match(failed.reply, /สะดุด/);
  const cancelled = resolveResultStatusReply({ status: "cancelled" });
  assert.equal(cancelled.claimsDelivered, false);
  assert.match(cancelled.reply, /ยกเลิก/);
  for (const st of ["", "weird_new_status", "unknown"]) {
    const r = resolveResultStatusReply({ status: st });
    assert.equal(r.claimsDelivered, false, `status "${st}" ห้าม claim ผลออก`);
    assert.doesNotMatch(r.reply, /ผลออกแล้ว/);
  }
});

test("delivered: ใช้ token ของ job เท่านั้น — token เก่าของ user ห้ามหลุด (แขนง failed/cancelled ไม่รับ token)", () => {
  const d = resolveResultStatusReply({
    status: "delivered",
    jobReportToken: "rpt_thisjob",
    baseUrl: "https://scan.my-ener.uk/",
  });
  assert.match(d.reply, /\/r\/rpt_thisjob/);
  // job ล่าสุด failed แต่มีรายงานเก่า — ต่อให้ caller เผลอส่ง token มาก็ห้ามส่งลิงก์
  const f = resolveResultStatusReply({ status: "failed", jobReportToken: "rpt_OLD" });
  assert.doesNotMatch(f.reply, /rpt_OLD/);
  const c = resolveResultStatusReply({ status: "cancelled", jobReportToken: "rpt_OLD" });
  assert.doesNotMatch(c.reply, /rpt_OLD/);
  // delivered แต่หา report ของ job ไม่เจอ → ไม่แต่งลิงก์
  const noTok = resolveResultStatusReply({ status: "delivered", jobReportToken: null });
  assert.doesNotMatch(noTok.reply, /\/r\//);
});

test("ไม่มีคำสัญญาเวลา (ใกล้เสร็จ/ไม่เกิน X นาที) ในทุกแขนง", () => {
  for (const st of ["queued", "processing", "delivery_queued", "delivered", "failed", "cancelled", "x"]) {
    const { reply } = resolveResultStatusReply({ status: st, jobReportToken: "t" });
    assert.doesNotMatch(reply, /ใกล้เสร็จ|ไม่เกิน\s*\d|นาที/);
  }
});
