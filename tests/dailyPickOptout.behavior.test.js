import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { matchDailyPickNotifyCommand, DAILY_PICK_NOTIFY_HELP_TEXT } from "../src/utils/dailyPickNotifyCommand.util.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("คำสั่งเป๊ะ: รับรูปแบบที่ลูกค้าพิมพ์จริง แต่ไม่ดักบทสนทนาทั่วไป", () => {
  for (const t of ["หยุดแจ้งเตือน", "ปิดแจ้งเตือน", " หยุดแจ้งเตือน ", "หยุดแจ้งเตือนครับ", "ปิดแจ้งเตือนค่ะ", "หยุด แจ้งเตือน"])
    assert.equal(matchDailyPickNotifyCommand(t), "off", t);
  for (const t of ["เปิดแจ้งเตือน", "เปิดแจ้งเตือนครับ", "อยากรับแจ้งเตือน"])
    assert.equal(matchDailyPickNotifyCommand(t), "on", t);
  // "รับแจ้งเตือน"/"รับเตือน" กำกวมเกินกว่าจะเปิดให้เอง (Codex 17 ก.ย. รอบสอง) → help
  for (const t of ["รับแจ้งเตือน", "รับเตือน", "เอาแจ้งเตือน"])
    assert.equal(matchDailyPickNotifyCommand(t), "help", t);
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

/* ============================================================================
 * รอบแก้หลัง live test บน staging (Codex GO 17 ก.ย. 2026 รอบสอง)
 * ของจริงที่พบ: ลูกค้าพิมพ์ "ปิดเตือน" → หลุดไป AI → AI ตอบ "ครับ ปิดให้แล้วครับ"
 * โดยไม่มี DAILY_PICK_OPTOUT_SAVED · และคำสั่งซ้ำถูก gateway กลืนจนลูกค้าเห็นเงียบ
 * ========================================================================== */

// hermetic: บล็อก network ทั้งหมด และนับเฉพาะ host โมเดลว่าเป็น "AI call"
const HERMETIC_ENV = {
  OPENAI_API_KEY: "sk-hermetic", LOCAL_POSTGREST_URL: "http://hermetic.invalid", LOCAL_POSTGREST_ANON_KEY: "x",
  LOCAL_POSTGREST_SERVICE_KEY: "x", SUPABASE_URL: "http://hermetic.invalid", SUPABASE_SERVICE_ROLE_KEY: "x",
  CHANNEL_ACCESS_TOKEN: "hermetic", CHANNEL_SECRET: "hermetic", GEMINI_API_KEY: "hermetic", REDIS_URL: "",
};
for (const [k, v] of Object.entries(HERMETIC_ENV)) process.env[k] = v;
try {
  for (const line of readFileSync(new URL("../.env.example", import.meta.url), "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=/);
    if (m && !process.env[m[1]]) process.env[m[1]] = "test-placeholder";
  }
} catch { /* ignore */ }
const EXTERNAL = { ai: 0 };
globalThis.fetch = async (url) => {
  if (/openai|openrouter|generativelanguage|anthropic|deepseek|llm\./i.test(String(url))) EXTERNAL.ai += 1;
  throw new Error("HERMETIC: network blocked");
};
const mockClient = () => {
  const payloads = [];
  return { payloads, replyMessage: async (_t, m) => { payloads.push(m); }, pushMessage: async (_u, m) => { payloads.push(m); } };
};

test("ภาษาจริงของลูกค้า: 'ปิดเตือน' ต้องเป็นคำสั่งปิด และไปเส้นเขียนค่า ไม่ใช่ AI", () => {
  const before = EXTERNAL.ai;
  for (const t of ["ปิดเตือน", "หยุดเตือน", "ปิดเตือนครับ", "ไม่รับแจ้งเตือน", "ยกเลิกแจ้งเตือน", "งดแจ้งเตือน", "ไม่เอาแจ้งเตือน"])
    assert.equal(matchDailyPickNotifyCommand(t), "off", t);
  // เส้นทางของ action=off ต้องเรียกตัวเขียนค่าจริง (ไม่ใช่ตอบลอย ๆ)
  const w = read("src/routes/lineWebhook.js");
  const fn = w.slice(w.indexOf("async function maybeHandleDailyPickNotifyToggle"));
  const body = fn.slice(0, fn.indexOf("\n}\n") + 3);
  assert.match(body, /setDailyPickOptout/, "off ต้องเขียนค่าเสมอ");
  assert.equal(EXTERNAL.ai, before, "ตัดสินคำสั่งได้โดยไม่เรียก AI");
});

test("เปิดคืนแล้วปิดแบบสุภาพได้จริง (คำสุภาพซ้อนกันไม่ทำให้จับคำสั่งพลาด)", () => {
  assert.equal(matchDailyPickNotifyCommand("เปิดแจ้งเตือน"), "on");
  assert.equal(matchDailyPickNotifyCommand("เปิดเตือน"), "on");
  for (const t of ["หยุดแจ้งเตือนครับ", "ขอปิดแจ้งเตือนหน่อยนะครับ", "รบกวนปิดแจ้งเตือนตอนเช้าให้ด้วยครับ", "ช่วยหยุดเตือนทีครับ"])
    assert.equal(matchDailyPickNotifyCommand(t), "off", t);
});

test("คำถาม / กำกวม / ปฏิเสธ / อ้างคำพูด → help เท่านั้น ห้ามเปลี่ยนค่า และห้ามเข้า AI", () => {
  const before = EXTERNAL.ai;
  const mustHelp = [
    "ปิดแจ้งเตือนยังไง", "ยกเลิกแจ้งเตือนได้ไหม",          // คำถาม
    "รับเตือน", "รับแจ้งเตือน", "เอาแจ้งเตือน",              // กำกวม
    "อย่าปิดแจ้งเตือน", "ไม่ต้องปิดแจ้งเตือนนะ", "ยังไม่ปิดแจ้งเตือน", // ปฏิเสธ
    'ลูกค้าบอกว่า "ปิดเตือน"', "พิมพ์ว่า หยุดแจ้งเตือน ใช่ไหม", "เมื่อกี้ผมพิมพ์ ปิดเตือน ไปแล้ว", // อ้างคำพูด
  ];
  for (const t of mustHelp) assert.equal(matchDailyPickNotifyCommand(t), "help", t);
  // บล็อก help ต้องไม่แตะตัวเขียนค่าเลย
  const w = read("src/routes/lineWebhook.js");
  const start = w.indexOf('if (action === "help")');
  const block = w.slice(start, w.indexOf("return true;", start) + 12);
  assert.doesNotMatch(block, /setDailyPickOptout|clearDailyPickOptout/);
  assert.equal(EXTERNAL.ai, before, "help ตัดสินได้เองโดยไม่เรียก AI");
});

test("ข้อความไม่เกี่ยวข้องยังไหลไปเส้นทางเดิม (ไม่ดักทุกประโยคที่มีคำว่า 'เตือน')", () => {
  for (const t of [
    "พระองค์นี้เตือนอะไรผมไหม", "ช่วยเตือนผมเรื่องต่ออายุด้วย", "องค์นี้ดีไหมครับ",
    "ขอดูผลสแกน", "ราคาเท่าไหร่", "สวัสดีครับ", "แจ้งเตือน", "ทำไมไม่มีแจ้งเตือน", "", null,
  ]) assert.equal(matchDailyPickNotifyCommand(t), null, String(t));
});

test("ack dedupe ผูก inbound: คำสั่งใหม่ 2 ครั้ง = ตอบ 2 ครั้ง · redelivery = ไม่ตอบเพิ่ม", async () => {
  const { sendNonScanReply } = await import("../src/services/nonScanReply.gateway.js");
  const c = mockClient();
  const uid = `u_optout_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const TEXT = "ปิดการแจ้งเตือนหนุนดวงตอนเช้าให้แล้วครับ พิมพ์ เปิดแจ้งเตือน เมื่ออยากรับอีกครั้ง";
  const send = (mid, token) => sendNonScanReply({
    client: c, userId: uid, replyToken: token, replyType: "daily_pick_notify_toggle",
    semanticKey: "daily_pick_notify_toggle", text: TEXT, inboundMessageId: mid,
  });
  const a = await send("m1", "t1");
  assert.equal(a.sent, true);
  const b = await send("m2", "t2");
  assert.equal(b.sent, true, "สั่งใหม่คนละ messageId ต้องได้คำยืนยันอีกครั้ง แม้ข้อความตอบเหมือนเดิม");
  assert.equal(b.suppressed, false);
  const again = await send("m2", "t3");
  assert.equal(again.sent, false, "redelivery messageId เดิมต้องไม่ตอบซ้ำ");
  assert.equal(again.suppressed, true);
  assert.equal(c.payloads.length, 2, "รวมแล้วต้องส่ง 2 ครั้งพอดี");
  // dedupe กลางต้องไม่ถูกปิด: caller ที่ไม่ส่ง inboundMessageId ยังโดนกันซ้ำเหมือนเดิม
  const legacy = await sendNonScanReply({
    client: c, userId: uid, replyToken: "t4", replyType: "daily_pick_notify_toggle",
    semanticKey: "daily_pick_notify_toggle", text: TEXT,
  });
  assert.equal(legacy.suppressed, true, "ห้าม bypass dedupe ทุกข้อความ");
  assert.equal(c.payloads.length, 2);
});

test("webhook ส่ง inboundMessageId เข้า gateway ทั้งเส้น help และ toggle", () => {
  const w = read("src/routes/lineWebhook.js");
  const fn = w.slice(w.indexOf("async function maybeHandleDailyPickNotifyToggle"));
  const body = fn.slice(0, fn.indexOf("\n}\n") + 3);
  assert.equal((body.match(/inboundMessageId,/g) || []).length, 2, "ทั้ง help และ toggle ต้องผูก inbound");
  // ทุก call site ของ handler ต้องส่ง messageId จริงมาด้วย
  // เอาเฉพาะจุดเรียกใช้ ไม่นับบรรทัดประกาศฟังก์ชัน
  const calls = w.match(/await maybeHandleDailyPickNotifyToggle\(\{[^}]*\}\)/g) || [];
  assert.ok(calls.length >= 3, `ต้องมี call site อย่างน้อย 3 จุด (พบ ${calls.length})`);
  for (const c of calls) assert.match(c, /inboundMessageId: event\.message\?\.id/);
});

test("DB ล้ม: ไม่อ้างว่าสำเร็จ และ replyType แยกออกมาให้ตรวจได้", () => {
  const w = read("src/routes/lineWebhook.js");
  const fn = w.slice(w.indexOf("async function maybeHandleDailyPickNotifyToggle"));
  const body = fn.slice(0, fn.indexOf("\n}\n") + 3);
  assert.match(body, /!res\?\.ok/, "ต้องดูผลการเขียนก่อนเลือกข้อความ");
  assert.match(body, /บันทึกการตั้งค่าแจ้งเตือนให้ไม่สำเร็จ/, "ล้มเหลวต้องบอกตรง ๆ");
  assert.match(body, /daily_pick_notify_toggle_failed/);
  const svc = read("src/services/dailyLuckyPickPush.service.js");
  const wr = svc.slice(svc.indexOf("async function writeDailyPickOptout"));
  assert.match(wr.slice(0, wr.indexOf("\n}\n")), /return \{ ok: false/, "RPC error ต้องคืน ok:false");
});
