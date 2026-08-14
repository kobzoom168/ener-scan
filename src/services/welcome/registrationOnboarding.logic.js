/**
 * Registration onboarding — pure decision logic (กบเคาะ 14 ส.ค. 2569 + เงื่อนไข 8 ข้อ)
 * แยกเป็น pure functions เพื่อ scenario tests โดยไม่ต้อง mock webhook ทั้งก้อน
 *
 * Flow เป้าหมาย:
 *   Add friend → welcome สั้น + การ์ดลงทะเบียนใบเดียว → ลงทะเบียนสำเร็จ → How-to →
 *   ชวนส่งรูป → flow ปกติ · ส่งรูปก่อน = hold รูปแรก durable → resume ด้วยปุ่ม token
 */

/** SSOT ช่องบังคับลงทะเบียน — gate/แชท fallback/LIFF ใช้ชุดเดียวกัน (Codex ข้อ 5) */
export const REGISTRATION_REQUIRED_FIELDS = Object.freeze(["nickname", "birthdate", "phone"]);

export const RESUME_TOKEN_RE = /^rs_[a-f0-9]{32}$/;
export const RESUME_COMMAND_RE = /^เริ่มอ่านรูปนี้:(rs_[a-f0-9]{32})$/;
export const REG_CARD_COOLDOWN_SEC = 900; // 15 นาที (กบเคาะ)
export const PREREG_HOLD_TTL_SEC = 24 * 3600; // รูปค้าง 24 ชม. (กบเคาะ)

/** ลูกค้าบอกเองว่า LIFF ใช้ไม่ได้ / อยากกรอกในแชท (Codex ข้อ 5 — เริ่มจากเจตนา) */
export const CHAT_FALLBACK_TRIGGER_RE =
  /เปิดไม่ได้|กดไม่ได้|กรอกไม่ได้|ลงทะเบียนไม่ได้|กรอกในแชท|ช่วยลงทะเบียน|ให้แอดมินช่วยกรอก/;

const CANCEL_RE = /^(ยกเลิก|ไม่เอาแล้ว|ไม่ลงทะเบียน)$/;
const ADMIN_REQUEST_RE = /ขอคุยกับแอดมิน|ติดต่อแอดมิน|คุยกับคนจริง|ร้องเรียน/;

/**
 * ตอน follow: ยังไม่ลงทะเบียน = welcome สั้น + การ์ดใบเดียว (ห้ามส่ง how-to /
 * ห้ามชวนส่งรูป) · ลงแล้ว = welcome + how-to แบบเดิม
 * @param {{ registered: boolean, gateEnabled: boolean, liffAvailable: boolean }} p
 * @returns {{ kind: "welcome_register", messages: string[] } | { kind: "welcome_full", messages: string[] }}
 */
export function decideFollowMessages({ registered, gateEnabled, liffAvailable }) {
  if (!registered && gateEnabled && liffAvailable) {
    return { kind: "welcome_register", messages: ["welcome_short", "registration_card"] };
  }
  return { kind: "welcome_full", messages: ["welcome_text", "howto_card"] };
}

/**
 * ปุ่ม "เข้าใจแล้ว": ยังไม่ลงทะเบียน (gate เปิด) ห้ามตอบ "ส่งรูปได้เลย"
 * @param {{ registered: boolean, gateEnabled: boolean }} p
 */
export function decideHowtoAckReply({ registered, gateEnabled }) {
  return !registered && gateEnabled ? "registration_reminder" : "invite_send_image";
}

/**
 * ข้อความระหว่างติด registration gate — control/safety intents ชนะก่อน แล้วค่อยเก็บ
 * เป็นรายละเอียดพระ (Codex ข้อ 6)
 * @param {string} text
 * @returns {{ kind: "chat_fallback_trigger" | "cancel" | "admin_request" | "description" | "rejected", reason?: string }}
 */
export function classifyPreRegText(text) {
  const t = String(text || "").trim();
  if (!t) return { kind: "rejected", reason: "empty" };
  if (CANCEL_RE.test(t)) return { kind: "cancel" };
  if (CHAT_FALLBACK_TRIGGER_RE.test(t)) return { kind: "chat_fallback_trigger" };
  if (ADMIN_REQUEST_RE.test(t)) return { kind: "admin_request" };
  if (t.length > 120) return { kind: "rejected", reason: "too_long" };
  // เบอร์/ตัวเลขล้วน = ข้อมูลละเอียดอ่อน ไม่ใช่ชื่อพระ — ห้ามเก็บเป็น description
  const digits = t.replace(/[^0-9]/g, "");
  if (digits.length >= 8 && digits.length / t.length > 0.5) {
    return { kind: "rejected", reason: "phone_like" };
  }
  return { kind: "description" };
}

/** sanitize ก่อนเก็บ/แสดงกลับ: ตัดขึ้นบรรทัด/ช่องว่างซ้อน จำกัดความยาว */
export function sanitizeDescription(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

/**
 * ตรวจสิทธิ์ resume (Codex ข้อ 2): ผูก uid + token ตรง + ยังไม่หมดอายุ + มีรูปจริง
 * @param {{ hold: { resumeToken?: string, storagePath?: string, createdAt?: number } | null,
 *   uid: string, holdUid: string | null, token: string, nowMs: number }} p
 * @returns {{ ok: true } | { ok: false, reason: "no_hold" | "wrong_user" | "token_mismatch" | "expired" | "no_image" }}
 */
export function validateResumeAttempt({ hold, uid, holdUid, token, nowMs }) {
  if (!hold) return { ok: false, reason: "no_hold" };
  if (String(holdUid || "") !== String(uid || "")) return { ok: false, reason: "wrong_user" };
  if (!RESUME_TOKEN_RE.test(String(token || "")) || hold.resumeToken !== token) {
    return { ok: false, reason: "token_mismatch" };
  }
  const age = nowMs - Number(hold.createdAt || 0);
  if (!Number.isFinite(age) || age < 0 || age > PREREG_HOLD_TTL_SEC * 1000) {
    return { ok: false, reason: "expired" };
  }
  if (!hold.storagePath) return { ok: false, reason: "no_image" };
  return { ok: true };
}

/**
 * LIFF save สำเร็จ (Codex ข้อ 4): trigger จาก "ไม่ครบ → ครบ" เท่านั้น ไม่ใช่ !existing
 * @param {{ completeBefore: boolean, completeAfter: boolean, hasHeldImage: boolean }} p
 * @returns {"none" | "success_resume" | "success_howto"}
 */
export function decideLiffSuccessFlow({ completeBefore, completeAfter, hasHeldImage }) {
  if (completeBefore || !completeAfter) return "none";
  return hasHeldImage ? "success_resume" : "success_howto";
}

/* ---------------- chat fallback state machine (ชื่อเล่น → วันเกิด → เบอร์) ---------------- */

/**
 * เดินสเตทแชทลงทะเบียน — pure: รับ state+ข้อความ คืน state ใหม่ + ข้อความตอบ
 * @param {{ state: { step: string, nickname?: string, birthdate?: string } | null,
 *   text: string,
 *   parseBirthdateIso: (t: string) => string | null }} p
 * @returns {{ state: object | null, reply: string, done?: { nickname: string, birthdateIso: string, phone: string } }}
 */
export function chatRegNextStep({ state, text, parseBirthdateIso }) {
  const t = String(text || "").trim();
  if (CANCEL_RE.test(t)) {
    return {
      state: null,
      reply: "ยกเลิกการกรอกในแชทแล้วครับ พร้อมเมื่อไหร่กดการ์ดลงทะเบียน หรือพิมพ์ ช่วยลงทะเบียน มาใหม่ได้เลยครับ",
    };
  }
  const s = state && state.step ? { ...state } : { step: "nickname" };
  if (s.step === "nickname") {
    if (!state) {
      // เพิ่งเริ่ม — ยังไม่กินข้อความนี้เป็นคำตอบ
      return { state: s, reply: "ได้ครับ ผมถามทีละข้อ ตอบในแชทนี้ได้เลย\n\nข้อแรก ใช้ชื่อเล่นว่าอะไรครับ" };
    }
    const nick = t.replace(/\s+/g, " ").slice(0, 60);
    if (nick.length < 1 || /^[0-9]+$/.test(nick)) {
      return { state: s, reply: "ขอชื่อเล่นเป็นตัวอักษรครับ เช่น กบ หรือ หน่อย" };
    }
    return {
      state: { step: "birthdate", nickname: nick },
      reply: `รับชื่อ ${nick} แล้วครับ\n\nข้อสอง วันเกิดวันที่เท่าไหร่ครับ (เช่น 21/07/2530)`,
    };
  }
  if (s.step === "birthdate") {
    const iso = parseBirthdateIso(t);
    if (!iso) {
      return { state: s, reply: "ขอวันเกิดแบบ วัน/เดือน/ปี ครับ เช่น 21/07/2530 (ปี พ.ศ. หรือ ค.ศ. ได้ทั้งคู่)" };
    }
    return {
      state: { step: "phone", nickname: s.nickname, birthdate: iso },
      reply: "รับวันเกิดแล้วครับ\n\nข้อสุดท้าย ขอเบอร์โทรติดต่อครับ ใช้ติดต่อเรื่องสิทธิ์และบริการเท่านั้น",
    };
  }
  if (s.step === "phone") {
    const digits = t.replace(/[^0-9]/g, "");
    if (digits.length < 9 || digits.length > 11) {
      return { state: s, reply: "ขอเบอร์โทร 9-10 หลักครับ เช่น 0812345678" };
    }
    return {
      state: null,
      reply: "",
      done: { nickname: s.nickname, birthdateIso: s.birthdate, phone: digits },
    };
  }
  return { state: null, reply: "ระบบสะดุดครับ พิมพ์ ช่วยลงทะเบียน เพื่อเริ่มใหม่ได้เลย" };
}
