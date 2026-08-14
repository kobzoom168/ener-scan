/**
 * Scenario tests flow ลูกค้าใหม่ (กบเคาะ 14 ส.ค. 2569 + เงื่อนไข Codex 8 ข้อ / 14 กรณี)
 * coordinator เป็น pure logic — เทสต์ตรงโดยไม่ mock webhook ทั้งก้อน
 * กรณีที่พึ่งลำดับโค้ดใน webhook ล็อกด้วย source-order invariant แบบเดียวกับ
 * lineWebhookRouting.invariant.test.js
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  REGISTRATION_REQUIRED_FIELDS,
  REG_CARD_COOLDOWN_SEC,
  PREREG_HOLD_TTL_SEC,
  RESUME_COMMAND_RE,
  decideFollowMessages,
  decideHowtoAckReply,
  classifyPreRegText,
  sanitizeDescription,
  validateResumeAttempt,
  decideLiffSuccessFlow,
  chatRegNextStep,
} from "../src/services/welcome/registrationOnboarding.logic.js";
import { holdFirstImage } from "../src/services/welcome/preRegistrationHold.service.js";

const WEBHOOK_SRC = fs.readFileSync(
  path.join(process.cwd(), "src", "routes", "lineWebhook.js"),
  "utf8",
);

// 1) Follow ยังไม่ลงทะเบียน → welcome สั้น + การ์ดใบเดียว (ไม่มี how-to)
test("scenario 1: follow unregistered = welcome + registration เท่านั้น", () => {
  const d = decideFollowMessages({ registered: false, gateEnabled: true, liffAvailable: true });
  assert.equal(d.kind, "welcome_register");
  assert.deepEqual(d.messages, ["welcome_short", "registration_card"]);
  assert.ok(!d.messages.includes("howto_card"));
});

// 2) Follow ลงแล้ว → welcome/How-to เดิม
test("scenario 2: follow registered = welcome + howto เดิม", () => {
  const d = decideFollowMessages({ registered: true, gateEnabled: true, liffAvailable: true });
  assert.equal(d.kind, "welcome_full");
  assert.ok(d.messages.includes("howto_card"));
  // gate ปิด = พฤติกรรมเดิมเช่นกัน
  assert.equal(
    decideFollowMessages({ registered: false, gateEnabled: false, liffAvailable: true }).kind,
    "welcome_full",
  );
});

// 3) กดเข้าใจแล้ว แต่ยังไม่ลงทะเบียน → เตือนลงทะเบียน ไม่ชวนส่งรูป
test("scenario 3: howto ack ยังไม่ลง = registration reminder", () => {
  assert.equal(decideHowtoAckReply({ registered: false, gateEnabled: true }), "registration_reminder");
  assert.equal(decideHowtoAckReply({ registered: true, gateEnabled: true }), "invite_send_image");
  assert.equal(decideHowtoAckReply({ registered: false, gateEnabled: false }), "invite_send_image");
});

// 4) รูปแรกก่อนลงทะเบียน → hold สำเร็จ + ไม่กิน quota (gate อยู่ก่อน checkScanAccess)
test("scenario 4: first image hold + gate ก่อน access check (ไม่กิน quota)", async () => {
  const store = new Map();
  const res = await holdFirstImage({
    uid: "Uaaa",
    messageId: "m1",
    buffer: Buffer.from("img"),
    deps: {
      peek: async (u) => store.get(u) || null,
      save: async (u, h) => store.set(u, h),
      upload: async () => ({ bucket: "b", path: "Uaaa/prereg-m1.bin" }),
    },
  });
  assert.equal(res.held, "first");
  assert.match(res.hold.resumeToken, /^rs_[a-f0-9]{32}$/);
  // source-order: ใน finalizeAcceptedImage — reg gate + holdFirstImage มาก่อน checkScanAccess
  const fin = WEBHOOK_SRC.slice(WEBHOOK_SRC.indexOf("async function finalizeAcceptedImage"));
  assert.ok(fin.indexOf("holdFirstImage") < fin.indexOf("checkScanAccess"));
});

// 5) รูปที่สอง → ไม่ overwrite รูปแรก
test("scenario 5: second image ไม่ทับรูปแรก แค่นับ", async () => {
  const store = new Map();
  const deps = {
    peek: async (u) => store.get(u) || null,
    save: async (u, h) => store.set(u, h),
    upload: async () => ({ bucket: "b", path: "p1" }),
  };
  const first = await holdFirstImage({ uid: "U1", messageId: "m1", buffer: Buffer.from("a"), deps });
  const second = await holdFirstImage({
    uid: "U1",
    messageId: "m2",
    buffer: Buffer.from("b"),
    deps: { ...deps, upload: async () => ({ bucket: "b", path: "p2" }) },
  });
  assert.equal(second.held, "extra");
  assert.equal(store.get("U1").storagePath, "p1"); // รูปแรกยังเป็นเจ้าของ
  assert.equal(store.get("U1").resumeToken, first.hold.resumeToken);
  assert.equal(store.get("U1").extraImages, 1);
});

// 6) ข้อความชื่อพระ → เก็บเป็น description (sanitize + จำกัดความยาว)
test("scenario 6: ชื่อพระ = description · เบอร์/ยาวเกิน = ปฏิเสธ", () => {
  assert.equal(classifyPreRegText("สมเด็จแหวกม่าน หลวงพ่อกวย วัดโฆสิตาราม").kind, "description");
  assert.equal(sanitizeDescription("  สมเด็จ\nแหวกม่าน  "), "สมเด็จ แหวกม่าน");
  assert.equal(classifyPreRegText("0812345678").kind, "rejected"); // เบอร์ ≠ ชื่อพระ
  assert.equal(classifyPreRegText("ก".repeat(121)).kind, "rejected");
});

// 7) "เปิดไม่ได้" → chat fallback ไม่ใช่ชื่อพระ (control intents ชนะ)
test("scenario 7: control intents ชนะ description", () => {
  assert.equal(classifyPreRegText("เปิดไม่ได้ครับ").kind, "chat_fallback_trigger");
  assert.equal(classifyPreRegText("ให้แอดมินช่วยกรอกในแชท").kind, "chat_fallback_trigger");
  assert.equal(classifyPreRegText("ยกเลิก").kind, "cancel");
  assert.equal(classifyPreRegText("ขอคุยกับแอดมินหน่อย").kind, "admin_request");
});

// 8) LIFF incomplete→complete → success ครั้งเดียว · ครบอยู่แล้ว/ยังไม่ครบ = ไม่ยิง
test("scenario 8: success trigger เฉพาะ ไม่ครบ→ครบ", () => {
  assert.equal(
    decideLiffSuccessFlow({ completeBefore: false, completeAfter: true, hasHeldImage: false }),
    "success_howto",
  );
  assert.equal(
    decideLiffSuccessFlow({ completeBefore: false, completeAfter: true, hasHeldImage: true }),
    "success_resume", // มีรูปค้าง: ไม่ส่ง how-to ที่ชวนส่งรูป (Codex ข้อ 1)
  );
  assert.equal(decideLiffSuccessFlow({ completeBefore: true, completeAfter: true, hasHeldImage: false }), "none");
  assert.equal(decideLiffSuccessFlow({ completeBefore: false, completeAfter: false, hasHeldImage: true }), "none");
});

// 9) Resume token ถูกคน/ผิดคน/หมดอายุ/format ผิด
test("scenario 9: resume token ownership + TTL + format", () => {
  const now = Date.now();
  const hold = { resumeToken: "rs_" + "ab".repeat(16), storagePath: "p", createdAt: now - 1000 };
  const ok = validateResumeAttempt({ hold, uid: "U1", holdUid: "U1", token: hold.resumeToken, nowMs: now });
  assert.equal(ok.ok, true);
  assert.equal(
    validateResumeAttempt({ hold, uid: "U2", holdUid: "U1", token: hold.resumeToken, nowMs: now }).reason,
    "wrong_user",
  );
  assert.equal(
    validateResumeAttempt({ hold, uid: "U1", holdUid: "U1", token: "rs_" + "cd".repeat(16), nowMs: now }).reason,
    "token_mismatch",
  );
  const old = { ...hold, createdAt: now - (PREREG_HOLD_TTL_SEC * 1000 + 1) };
  assert.equal(
    validateResumeAttempt({ hold: old, uid: "U1", holdUid: "U1", token: hold.resumeToken, nowMs: now }).reason,
    "expired",
  );
  assert.equal(validateResumeAttempt({ hold: null, uid: "U1", holdUid: null, token: "x", nowMs: now }).reason, "no_hold");
  assert.ok(RESUME_COMMAND_RE.test(`เริ่มอ่านรูปนี้:${hold.resumeToken}`));
  assert.ok(!RESUME_COMMAND_RE.test("เริ่มอ่านรูปนี้:hack"));
});

// 10) consume หลัง ingest สำเร็จเท่านั้น (source-order ใน resume handler)
test("scenario 10: ingest สำเร็จก่อน แล้วจึง consume + cleanup", () => {
  const h = WEBHOOK_SRC.slice(WEBHOOK_SRC.indexOf("async function maybeHandlePreRegResume"));
  const block = h.slice(0, h.indexOf("async function handleTextMessage"));
  assert.ok(block.indexOf("finalizeAcceptedImage") < block.indexOf("consumeHoldAfterIngest"));
});

// 11) ingest ล้ม → ไม่ consume → retry ได้
test("scenario 11: ingest fail ไม่ consume (retry ได้)", () => {
  const h = WEBHOOK_SRC.slice(WEBHOOK_SRC.indexOf("async function maybeHandlePreRegResume"));
  const catchBlock = h.slice(h.indexOf("PREREG_RESUME_INGEST_FAILED"), h.indexOf("finally"));
  assert.ok(!catchBlock.includes("consumeHoldAfterIngest"));
  assert.match(catchBlock, /รูปยังอยู่ครบ/);
});

// 12) infra พัง → fail-open ตาม policy (แต่เลิก fail-open ตามจำนวนครั้ง)
test("scenario 12: fail-open เฉพาะระบบพัง — เลิกเปิด gate ตามจำนวนครั้ง", () => {
  const gateSrc = fs.readFileSync(
    path.join(process.cwd(), "src", "services", "registrationGate.service.js"),
    "utf8",
  );
  assert.match(gateSrc, /REG_GATE_CHECK_ERROR_FAIL_OPEN/); // ระบบพังยังปล่อยผ่าน
  assert.ok(!gateSrc.includes("fallback_after_blocks")); // เลิกปล่อยผ่านตามครั้ง
  assert.ok(!gateSrc.includes("ปลอดภัย 100%")); // copy ต้องห้าม
});

// 13) หลาย container ยัง resume ได้ (state ทั้งหมดผ่าน redis/storage — ไม่มี process memory)
test("scenario 13: hold state ใช้ redis/storage ไม่ใช่ Map ใน process", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "src", "services", "welcome", "preRegistrationHold.service.js"),
    "utf8",
  );
  assert.ok(!/new Map\(/.test(src));
  assert.match(src, /setLargeValueWithTtl/);
  assert.match(src, /uploadScanImageToStorage/);
});

// 14) การ์ด Flex cooldown 15 นาที + SSOT ช่องบังคับ
test("scenario 14: cooldown 900s + required fields SSOT เดียว", () => {
  assert.equal(REG_CARD_COOLDOWN_SEC, 900);
  assert.deepEqual([...REGISTRATION_REQUIRED_FIELDS], ["nickname", "birthdate", "phone"]);
});

// chat fallback state machine ครบวง
test("chat fallback: ถามทีละช่อง ชื่อเล่น → วันเกิด → เบอร์ → done", () => {
  const parse = (t) => (t === "21/07/2530" ? "1987-07-21" : null);
  let s = chatRegNextStep({ state: null, text: "", parseBirthdateIso: parse });
  assert.match(s.reply, /ชื่อเล่น/);
  s = chatRegNextStep({ state: s.state, text: "กบ", parseBirthdateIso: parse });
  assert.match(s.reply, /วันเกิด/);
  // วันเกิดผิด format → ถามซ้ำ ไม่เดินหน้า
  const bad = chatRegNextStep({ state: s.state, text: "ไม่บอก", parseBirthdateIso: parse });
  assert.equal(bad.state.step, "birthdate");
  s = chatRegNextStep({ state: s.state, text: "21/07/2530", parseBirthdateIso: parse });
  assert.match(s.reply, /เบอร์โทร/);
  assert.match(s.reply, /สิทธิ์และบริการเท่านั้น/); // consent copy ตรงการใช้งาน
  const done = chatRegNextStep({ state: s.state, text: "081-234-5678", parseBirthdateIso: parse });
  assert.deepEqual(done.done, { nickname: "กบ", birthdateIso: "1987-07-21", phone: "0812345678" });
  // ยกเลิกกลางทางได้
  const cancel = chatRegNextStep({ state: { step: "phone" }, text: "ยกเลิก", parseBirthdateIso: parse });
  assert.equal(cancel.state, null);
});
