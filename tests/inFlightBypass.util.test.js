/**
 * Codex รอบ 6: behavior test ของ in-flight bypass — เคสจริง "วิธีใช้" โดน gate กลืน
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { shouldBypassInFlightGate } from "../src/services/lineWebhook/inFlightBypass.util.js";

test("คำสั่ง info (วิธีใช้/วิธีใช้งาน/สแกนพลังงาน) ต้องข้าม in-flight gate", async () => {
  for (const t of ["วิธีใช้", "วิธีใช้งาน", "สแกนพลังงาน", " วิธีใช้ "]) {
    assert.equal(await shouldBypassInFlightGate(t), true, t);
  }
});

test("คำสั่งเมนูเดิม (ประวัติ/จัดชุด/ชวนเพื่อน) ยังข้ามได้เหมือนเดิม", async () => {
  for (const t of ["ประวัติ", "จัดชุด", "ชวนเพื่อน"]) {
    assert.equal(await shouldBypassInFlightGate(t), true, t);
  }
});

test("ข้อความทั่วไป/คำถาม ไม่ข้าม gate (ยังโดนบอกให้รอ)", async () => {
  for (const t of ["สวัสดีครับ", "ผลออกยัง", "พระองค์นี้ดีไหม", "อยากรู้วิธีใช้งานหน่อย", ""]) {
    assert.equal(await shouldBypassInFlightGate(t), false, t);
  }
});

test("deps พัง → ไม่ข้าม gate (พฤติกรรมเดิม ปลอดภัยกว่า)", async () => {
  const r = await shouldBypassInFlightGate("วิธีใช้", {
    matchExactUtilityCommand: () => { throw new Error("boom"); },
  });
  assert.equal(r, false);
});

test("webhook ใช้ util นี้จริงในเส้น in-flight gate", () => {
  const wh = fs.readFileSync("src/routes/lineWebhook.js", "utf8");
  const idx = wh.indexOf("shouldBypassInFlightGate(text)");
  assert.ok(idx > 0, "webhook ต้องเรียก util");
  // gate ของเลนข้อความอยู่ถัดจากจุดตัดสิน bypass (มี in-flight check อื่นก่อนหน้าในไฟล์)
  const gate = wh.indexOf("!menuBypass && (await isDedupeKeyActive(scanInFlightKeyForUser(userId)))");
  assert.ok(gate > idx, "ต้องตัดสิน bypass ก่อนเช็ค gate ของเลนข้อความ");
});
