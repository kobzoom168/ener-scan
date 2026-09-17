import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { matchDailyPickNotifyCommand, DAILY_PICK_NOTIFY_HELP_TEXT } from "../src/utils/dailyPickNotifyCommand.util.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("คำสั่งเป๊ะ: รับรูปแบบที่ลูกค้าพิมพ์จริง แต่ไม่ดักบทสนทนาทั่วไป", () => {
  for (const t of ["หยุดแจ้งเตือน", "ปิดแจ้งเตือน", " หยุดแจ้งเตือน ", "หยุดแจ้งเตือนครับ", "ปิดแจ้งเตือนค่ะ", "หยุด แจ้งเตือน"])
    assert.equal(matchDailyPickNotifyCommand(t), "off", t);
  for (const t of ["เปิดแจ้งเตือน", "เปิดแจ้งเตือนครับ", "รับแจ้งเตือน"])
    assert.equal(matchDailyPickNotifyCommand(t), "on", t);
  // คำถามต้องเป็น help ไม่ใช่คำสั่ง (ห้ามเปลี่ยนค่า)
  for (const t of ["ปิดแจ้งเตือนยังไง", "ปิดแจ้งเตือนยังไงครับ", "ยกเลิกแจ้งเตือนได้ไหม", "เปิดแจ้งเตือนทำไง"])
    assert.equal(matchDailyPickNotifyCommand(t), "help", t);
  // ไม่เกี่ยวเลย → ไม่จับ
  for (const t of ["แจ้งเตือน", "ทำไมไม่มีแจ้งเตือน", "สวัสดีครับ", "", null])
    assert.equal(matchDailyPickNotifyCommand(t), null, String(t));
  assert.match(DAILY_PICK_NOTIFY_HELP_TEXT, /หยุดแจ้งเตือน/);
  assert.match(DAILY_PICK_NOTIFY_HELP_TEXT, /เปิดแจ้งเตือน/);
});

test("คำถามต้องตอบ deterministic และห้ามเปลี่ยนค่า", () => {
  const w = read("src/routes/lineWebhook.js");
  const start = w.indexOf('if (action === "help")');
  const block = w.slice(start, w.indexOf("return true;", start) + 12); // เฉพาะในบล็อก help
  assert.match(block, /daily_pick_notify_help/);
  assert.doesNotMatch(block, /setDailyPickOptout|clearDailyPickOptout/, "help ต้องไม่เขียนค่าใด ๆ");
});

test("ยังไม่มีแถวใน DB ห้ามตีความว่าเปิดรับ — ต้องดูค่าเดิมใน Redis ก่อน", () => {
  const sql = read("sql/058_notification_preferences.sql");
  assert.match(sql, /'known',\s*EXISTS/, "RPC ต้องคืน known แยกจาก optedOut");
  const svc = read("src/services/dailyLuckyPickPush.service.js");
  const fn = svc.slice(svc.indexOf("export async function isDailyPickOptedOut"));
  assert.match(fn, /data\?\.known === true/, "ถ้ามีแถวแล้วใช้ค่าจาก DB");
  assert.match(fn, /getValue\(dailyPickOptoutKey/, "ถ้ายังไม่มีแถว ต้องอ่าน Redis เดิม");
  assert.match(fn, /DAILY_PICK_OPTOUT_LEGACY_MIGRATED/, "เจอค่าเดิมต้องย้ายมาเก็บถาวร");
});

test("ขอบเขตสวิตช์: ปิดแจ้งเตือนแนะนำ ไม่แตะงานที่ลูกค้าสั่ง", () => {
  const d = read("src/services/scanV2/deliverOutbound.service.js");
  const cond = d.slice(d.indexOf('if (kind === "daily_pick_push" || kind === "fb_consent_ask")'),
                       d.indexOf("OUTBOUND_SUPPRESSED_OPTOUT") + 120);
  assert.ok(cond.length > 50, "ต้องครอบทั้ง daily_pick_push และ fb_consent_ask");
  for (const k of ["scan_failure_notify", "renewal_reminder", "scan_result"])
    assert.doesNotMatch(cond, new RegExp(k), `${k} ต้องไม่ถูกสวิตช์นี้บล็อก`);
});

test("เก็บถาวรใน DB — ไม่ใช้ Redis TTL ที่ cap 7 วันอีกต่อไป", () => {
  const svc = read("src/services/dailyLuckyPickPush.service.js");
  assert.doesNotMatch(svc, /OPTOUT_TTL_SECONDS/, "ต้องไม่มี TTL constant แล้ว");
  assert.doesNotMatch(svc, /setValueWithTtl\(dailyPickOptoutKey/, "ต้องไม่เขียน optout ลง Redis อีก");
  assert.match(svc, /set_daily_pick_optout/);
  assert.match(svc, /get_daily_pick_optout/);
  const sql = read("sql/058_notification_preferences.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.notification_preferences/);
  // ต้องไม่มีคอลัมน์/กลไกหมดอายุใน DDL (คำว่า TTL ใน comment อธิบายเหตุผลได้)
  const ddl = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  assert.doesNotMatch(ddl, /expires_at|ttl|INTERVAL/i, "ความต้องการลูกค้าต้องไม่มีวันหมดอายุ");
  // สิทธิ์ตามบทเรียน P0-H
  assert.match(sql, /REVOKE ALL ON TABLE public\.notification_preferences FROM PUBLIC/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.set_daily_pick_optout\(text, boolean\) FROM PUBLIC/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.set_daily_pick_optout\(text, boolean\) TO web_anon, service_role/);
});

test("deterministic ก่อน AI: ในสายข้อความ ตัวจับคำสั่งมาก่อน orchestrator ทุกจุด", () => {
  const w = read("src/routes/lineWebhook.js");
  // วัดเฉพาะใน handleTextMessage (สายที่ข้อความลูกค้าเดินจริง)
  const start = w.indexOf("async function handleTextMessage(");
  assert.ok(start > 0, "หา handleTextMessage ไม่เจอ");
  const body = w.slice(start);
  const toggle = body.indexOf("await maybeHandleDailyPickNotifyToggle");
  const orch = body.indexOf("invokePhase1GeminiOrchestrator()");
  const snapshot = body.indexOf("invokePhase1GeminiFromSnapshot");
  assert.ok(toggle > 0, "ต้องถูกเรียกใน handleTextMessage");
  const firstAi = Math.min(...[orch, snapshot].filter((i) => i > 0));
  assert.ok(toggle < firstAi,
    `ตัวจับคำสั่ง (+${toggle}) ต้องมาก่อน AI ตัวแรก (+${firstAi}) ในสายข้อความ`);
  const banGuard = body.indexOf("await maybeHandleBanCommand");
  assert.ok(banGuard > 0 && banGuard < toggle, "ban guard ต้องมาก่อนเสมอ");
});

test("ยืนยันกับลูกค้าเฉพาะเมื่อบันทึกสำเร็จ", () => {
  const w = read("src/routes/lineWebhook.js");
  assert.match(w, /!res\?\.ok/, "ต้องเช็คผลการบันทึกก่อนเลือกข้อความ");
  assert.match(w, /บันทึกการตั้งค่าแจ้งเตือนให้ไม่สำเร็จ/, "ต้องมีข้อความกรณีบันทึกไม่สำเร็จ");
  assert.match(w, /daily_pick_notify_toggle_failed/, "ต้องแยก replyType กรณีล้มเหลว");
  const svc = read("src/services/dailyLuckyPickPush.service.js");
  assert.match(svc, /SELECT daily_pick_optout_at INTO v FROM public\.notification_preferences/.source ? /ok: stored === Boolean\(optedOut\)/ : /ok/,
    "service ต้องคืน ok จากค่าที่อ่านกลับจริง");
});

test("ตรวจ preference ก่อนส่งคิว — เฉพาะแจ้งเตือนอัตโนมัติ ไม่แตะข้อความธุรกรรม", () => {
  const d = read("src/services/scanV2/deliverOutbound.service.js");
  assert.match(d, /if \(kind === "daily_pick_push" \|\| kind === "fb_consent_ask"\)[\s\S]{0,400}isDailyPickOptedOut/,
    "ต้องเช็ค optout ก่อนส่งแจ้งเตือนอัตโนมัติ");
  assert.match(d, /OUTBOUND_SUPPRESSED_OPTOUT/);
  // ต้องไม่ผูก optout กับข้อความธุรกรรม
  const block = d.slice(d.indexOf('if (kind === "daily_pick_push" || kind === "fb_consent_ask")'), d.indexOf("OUTBOUND_SUPPRESSED_OPTOUT") + 200);
  for (const k of ["scan_failure_notify", "renewal_reminder", "scan_result"])
    assert.doesNotMatch(block, new RegExp(k), `${k} ต้องไม่ถูก optout บล็อก`);
});

test("อ่าน preference ไม่ได้ = ถือว่าปิดไว้ (ไม่ส่งหาคนที่อาจเคยกดปิด)", () => {
  const svc = read("src/services/dailyLuckyPickPush.service.js");
  const fn = svc.slice(svc.indexOf("export async function isDailyPickOptedOut"));
  assert.match(fn.slice(0, 600), /if \(error\)[\s\S]{0,300}return true;/,
    "error ต้อง return true (fail-safe)");
});
