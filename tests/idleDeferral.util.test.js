// P1 (Codex 21 ต.ค. 2026): "ไว้ก่อน" ใน true idle → คำตอบพักสนทนากลาง ๆ AI=0 · ไม่ชวนส่งรูป ไม่ขายแพ็ก ไม่สัญญาฟรี · กันจับผิด "ไม่ต้องไว้ก่อน ทำต่อเลย"
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { matchIdleDeferral, handleIdleDeferral, IDLE_DEFERRAL_TEXT } from "../src/services/lineWebhook/idleDeferral.util.js";
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("match: วลีพัก (ไว้ก่อน/เดี๋ยวค่อย/ยังไม่เอา/พักก่อน) = true · ปฏิเสธการพัก/สั่งทำต่อ = false · ประโยคยาว = false", () => {
  for (const t of ["ไว้ก่อน", " ไว้ก่อนครับ ", "เอาไว้ก่อนนะ", "เดี๋ยวค่อยส่ง", "ยังไม่เอาตอนนี้", "ขอพักก่อน", "ขอคิดดูก่อน", "ไว้วันหลังค่อยดู"]) assert.equal(matchIdleDeferral(t), true, t);
  for (const t of ["ไม่ต้องไว้ก่อน ทำต่อเลย", "ไม่ไว้ก่อนแล้ว สแกนเลย", "ไว้ก่อน? ไม่ต้อง เอาเลย", "ทำต่อ", "ส่งเลย", "", "   ", "ดูฟรีไหม", "ไว้ก่อน " + "x".repeat(40)]) assert.equal(matchIdleDeferral(t), false, t);
  // Codex รอบ 2: ประโยคผสม (พัก + คำถาม/คำขอ) และคำปฏิเสธการพัก → ต้องไม่จับ ให้เส้นปกติตอบคำถาม
  for (const t of ["ไม่เอาไว้ก่อนแล้ว", "ไว้ก่อน แพ็กหมดอายุเมื่อไหร่", "ไว้ก่อน ขอถามราคาหน่อย", "ไว้ก่อนได้ไหม", "ไว้ก่อน สแกนได้กี่ครั้ง", "พักก่อน แล้วสลิปล่ะ", "ไว้ก่อนนะ แต่ช่วยเช็คสิทธิ์ให้หน่อย", "ไว้ก่อน แต่ขอดูผลเก่า"]) assert.equal(matchIdleDeferral(t), false, "ผสม/ปฏิเสธ: " + t);
  // ยังจับวลีพักล้วนที่มีคำลงท้าย/ emoji/กริยาการพักเอง ("เดี๋ยวค่อยส่งรูป" = พัก ไม่ใช่คำขอ)
  for (const t of ["ไว้ก่อนนะครับ", "โอเค ไว้ก่อน", "ไว้ก่อนละ ขอบคุณครับ", "ไว้ก่อน 🙏", "ยังไม่เอาครับ", "ขอคิดดูก่อนนะคะ", "เดี๋ยวค่อยส่งรูป", "ไว้วันหลังค่อยดู", "ยังไม่เอาตอนนี้"]) assert.equal(matchIdleDeferral(t), true, "พักล้วน: " + t);
});

test("handle: ส่งข้อความกลาง ๆ ครั้งเดียว replyType idle_deferral_ack · ไม่มีคำชวนส่งรูป/ขายแพ็ก/ฟรีพรุ่งนี้ · ไม่ match = false ไม่ส่ง", async () => {
  const sent = [];
  const ok = await handleIdleDeferral({ client: {}, userId: "U1", replyToken: "rt", text: "ไว้ก่อน", deps: { sendNonScanReply: async (p) => { sent.push(p); return { sent: true }; } } });
  assert.equal(ok, true); assert.equal(sent.length, 1);
  assert.equal(sent[0].replyType, "idle_deferral_ack"); assert.equal(sent[0].text, IDLE_DEFERRAL_TEXT); assert.deepEqual(sent[0].alternateTexts, []);
  for (const bad of ["ส่งรูป", "แพ็ก", "ค่าครู", "บาท", "พรุ่งนี้", "ฟรี", "ยกเลิก"]) assert.ok(!sent[0].text.includes(bad), "ห้ามมีคำว่า " + bad);
  const sent2 = [];
  assert.equal(await handleIdleDeferral({ client: {}, userId: "U1", replyToken: "rt", text: "ไม่ต้องไว้ก่อน ทำต่อเลย", deps: { sendNonScanReply: async (p) => { sent2.push(p); } } }), false);
  assert.equal(sent2.length, 0);
});

test("static: webhook เรียก handleIdleDeferral ก่อน true-idle consult (replyIdleTextNoDuplicate allowIdleDirectConsult) · util ไม่ import AI/store · ไม่ clear payment/job", () => {
  const wh = read("src/routes/lineWebhook.js");
  const i = wh.indexOf("handleIdleDeferral({ client, userId, replyToken: event.replyToken, text");
  const j = wh.indexOf("allowIdleDirectConsult: true,");
  assert.ok(i > 0 && j > 0 && i < j, "P1 ต้องอยู่ก่อนจุดเปิด idle consult");
  const util = read("src/services/lineWebhook/idleDeferral.util.js");
  assert.doesNotMatch(util, /gemini|openai|llm|supabase|clearPaymentState|scan_jobs|import /i, "util ต้องไม่แตะ AI/DB/state");
  assert.match(read("package.json"), /tests\/idleDeferral\.util\.test\.js/);
});
