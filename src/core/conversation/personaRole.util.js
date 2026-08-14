/**
 * Role router + pre-send money guard (persona hardening — Codex C2/C3, กบเคาะ 12 ส.ค. 2026)
 *
 * เส้นแบ่งเสียงตามกติกา persona: แอดมินเรียกตัวเองว่า "ผม" · อาจารย์เรียกตัวเองว่า
 * "อาจารย์" (ห้าม ผม) — ใช้เส้นนี้ resolve ว่าข้อความ LLM ขาออกเป็นเสียงใคร และบล็อก
 * "เสียงอาจารย์พูดเงิน" ก่อนถึงมือลูกค้า (เดิมมีแค่ Telegram แจ้งหลังส่ง)
 */
import { AJARN_MONEY_RE } from "../../stores/conversationMessages.db.js";

/** แอดมินเรียกตัวเอง ผม — ภาษาไทยเขียนติดกัน ("เดี๋ยวผม") ใช้ /ผม/ ตรง ๆ
 *  (คำที่มี ผม ปนอย่าง เส้นผม/สระผม โอกาสโผล่ในบริบทเงินต่ำมาก ยอม false pass ดีกว่า
 *  บล็อกคำตอบแอดมินที่ถูกกติกา) */
const ADMIN_SELF_RE = /ผม/;
/** ท่าพูดของอาจารย์ (อาจารย์+กริยาแสดงความเป็นผู้พูดเอง) */
const AJARN_VOICE_RE =
  /อาจารย์(มองว่า|ว่า|แนะนำ|ขอ|เห็นว่า|ไม่ฟันธง|ดูแล้ว|อ่านแล้ว|ฝากบอก|บอกได้เลย)|^📿/;

/**
 * resolve เสียงผู้พูดของข้อความ bot ขาออก
 * @param {string} text
 * @returns {"admin"|"ajarn"|"mixed"|"unknown"}
 */
export function resolveSpeakerRole(text) {
  const t = String(text || "");
  const admin = ADMIN_SELF_RE.test(t);
  const ajarn = AJARN_VOICE_RE.test(t);
  if (admin && ajarn) return "mixed";
  if (ajarn) return "ajarn";
  if (admin) return "admin";
  return "unknown";
}

/**
 * ความเสี่ยง "เงินนอกปากแอดมิน" (Codex รอบ 4): มีคำการเงิน และเสียงที่ resolve ได้
 * ไม่ใช่ admin ล้วน — mixed/ajarn/unknown ที่มีคำเงิน = block ทั้งหมด
 * (mixed = อาจารย์กับแอดมินปน bubble เดียว ก็ขัดกติกา ต้องแยกก่อน)
 * @param {string} text
 */
export function ajarnMoneyRisk(text) {
  const t = String(text || "");
  if (!AJARN_MONEY_RE.test(t)) return false;
  return resolveSpeakerRole(t) !== "admin";
}

/** @deprecated fallback เท่านั้น — SSOT จริงคือ isPaymentCommand/isPromoInquiryText
 *  (webhookText.util) ส่งเป็น ctx.userMoneyIntent เข้ามา (Codex รอบ 6: ห้าม regex เงินสองชุด drift) */
export const USER_MONEY_INTENT_RE =
  /(ราคา|กี่บาท|ค่าครู|จ่าย|โอน|แพ็ก|เปิดสิทธิ์|สลิป|ชำระ|สมัคร)/;

/**
 * Consumer กลางของ typed outcome จาก orchestrator (Codex รอบ 6: deferTo ต้องมีผู้รับจริง)
 * — defer_payment → เรียก deterministic payment route 1 ครั้ง แล้วปิด turn (handled)
 * caller ที่ไม่มี payment context ไม่ต้องส่ง runDeterministicPayment = ผ่าน res เดิม
 * @param {{ handled?: boolean, deferTo?: string } | null | undefined} res
 * @param {{ runDeterministicPayment?: () => Promise<boolean> }} [opts]
 */
export async function consumeOrchestratorOutcome(res, { runDeterministicPayment } = {}) {
  if (
    res &&
    res.deferTo === "deterministic_payment" &&
    typeof runDeterministicPayment === "function"
  ) {
    let ok = false;
    try {
      ok = Boolean(await runDeterministicPayment());
    } catch (e) {
      console.warn(
        JSON.stringify({
          event: "ORCH_DEFER_PAYMENT_CONSUMER_FAILED",
          message: String(e?.message || e).slice(0, 140),
        }),
      );
    }
    console.log(
      JSON.stringify({ event: "ORCH_DEFER_PAYMENT_CONSUMED", handledByPaymentRoute: ok }),
    );
    return { handled: ok, mode: "active", via: "deferred_deterministic_payment" };
  }
  return res;
}

/** neutral recovery — ห้ามชวนขาย และห้ามสัญญาว่าจะไปถามอาจารย์ (Codex รอบ 5:
 *  ประโยค "เดี๋ยวเรียนถามอาจารย์ให้" ไม่มีคำตอบตามจริง = สร้าง dangling handoff เอง) */
export const NEUTRAL_RECOVERY_FALLBACK =
  "เมื่อกี้คำตอบคลาดเคลื่อนไปครับ รบกวนถามเรื่องพลังอีกครั้งได้เลยครับ";

/**
 * Guard เงินสองชั้น (Codex รอบ 5):
 *  ชั้น 1 ใครพูด — เงินต้องออกจากเสียงแอดมินเท่านั้น (mixed/ajarn/unknown = block)
 *  ชั้น 2 ถูกจังหวะไหม — ลูกค้าไม่ได้ถามเงิน + ไม่ได้อยู่ paywall/payment state
 *  = เสนอขายเอง block แม้เสียงแอดมิน
 * @param {string} text
 * @param {{ userMoneyIntent?: boolean, inPaymentState?: boolean }} [ctx]
 * @returns {{ ok: true } | { ok: false, reason: "wrong_speaker" | "unsolicited" }}
 */
export function evaluateMoneyGuard(text, { userMoneyIntent = false, inPaymentState = false } = {}) {
  const t = String(text || "");
  if (!AJARN_MONEY_RE.test(t)) return { ok: true };
  if (resolveSpeakerRole(t) !== "admin") return { ok: false, reason: "wrong_speaker" };
  if (!userMoneyIntent && !inPaymentState) return { ok: false, reason: "unsolicited" };
  return { ok: true };
}

/**
 * คำชม/ปลอบต้องห้ามในเสียงอาจารย์ (Codex 14 ส.ค. — เคสจริง 13 ส.ค.:
 * "ใช้ได้ดีแล้ว...ไม่ต้องกังวล" + "เดี๋ยวก็เจอชิ้นที่ใช่เอง") — prompt อย่างเดียว
 * ไม่การันตี ต้องมี pre-send validator คู่กัน
 */
export const PRAISE_COMFORT_RE =
  /ใช้ได้ดีแล้ว|ถือว่า(?:ดี|ใช้ได้)|ไม่ต้องกังวล|เดี๋ยวก็เจอ|สบายใจได้/;

/** @returns {{ok: true} | {ok: false, reason: "praise_comfort", match: string}} */
export function evaluateToneGuard(text) {
  const m = PRAISE_COMFORT_RE.exec(String(text || ""));
  if (!m) return { ok: true };
  return { ok: false, reason: "praise_comfort", match: m[0] };
}

/**
 * Deterministic sanitizer (Codex 14 ส.ค. รอบ 3): ตัด/แทนเฉพาะวลีต้องห้าม เก็บสาระไว้
 * กติกา: longest phrase first (กัน rule สั้นกินก่อนแล้วเหลือเศษ "ดีแล้ว") ·
 * วลีอนาคต/ปลอบแทนทั้ง clause ถึงจบบรรทัด ห้ามใช้ character class ภาษาไทยตัดกลางคำ
 */
const PRAISE_COMFORT_SANITIZE_RULES = [
  // กลุ่มชมคะแนน — เรียงยาว→สั้น แทนด้วยการอ่านตำแหน่งแบบเป็นกลาง
  [/แบบนี้ก็ถือว่าใช้ได้ดีแล้ว/g, "อยู่ตามตำแหน่งที่รายงานระบุ"],
  [/ถือว่าใช้ได้ดีแล้ว/g, "อยู่ตามตำแหน่งที่รายงานระบุ"],
  [/แบบนี้ก็ใช้ได้ดีแล้ว/g, "อยู่ตามตำแหน่งที่รายงานระบุ"],
  [/ก็ใช้ได้ดีแล้ว/g, "อยู่ตามตำแหน่งที่รายงานระบุ"],
  [/ใช้ได้ดีแล้ว/g, "อยู่ตามตำแหน่งที่รายงานระบุ"],
  [/ถือว่า(?:ดีมาก|ใช้ได้|ดี)(?:แล้ว)?/g, "อยู่ตามตำแหน่งที่รายงานระบุ"],
  // ปลอบอนาคต — กลืนทั้ง clause ถึงจบบรรทัด แทนด้วยขั้นถัดไปที่ทำได้จริง
  [/เดี๋ยวก็เจอ[^\n]*/g, "หากต้องการเทียบให้ชัด ให้สแกนชิ้นต่างสายเพิ่มเติมครับ"],
  // วลีปลอบตัดทิ้ง (รวมคำลงท้ายที่เกาะมา กันเศษ "ครับ" ลอย)
  [/ไม่ต้องกังวล(?:ไป|นะ)?(?:ครับ|ค่ะ)?/g, ""],
  [/สบายใจได้(?:เลย|นะ)?(?:ครับ|ค่ะ)?/g, ""],
];

/** เศษภาษาพัง/ความหมายชมที่หลงเหลือ = sanitize ไม่ผ่าน (Codex รอบ 3) */
const SANITIZE_LEFTOVER_RE = /ดีแล้ว|นที่ใช่เอง|ครับครับ|ค่ะค่ะ|ระบุระบุ/;

/** @param {string} text */
export function sanitizePraiseComfort(text) {
  let t = String(text || "");
  for (const [re, sub] of PRAISE_COMFORT_SANITIZE_RULES) t = t.replace(re, sub);
  // เก็บกวาด: ช่องว่างซ้อน / ช่องว่างหน้าวรรคตอน / บรรทัดว่างเกิน
  return t
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([\n.!?])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Post-sanitize quality gate: ประโยคต้องอ่านรู้เรื่อง + สาระจากต้นฉบับยังอยู่
 * ไม่ผ่านข้อใดข้อหนึ่ง = ไปใช้ neutral fallback แทน (fail-closed)
 * @param {string} sanitized
 * @param {string} original
 */
export function sanitizedOutputQualityOk(sanitized, original) {
  const s = String(sanitized || "").trim();
  const o = String(original || "");
  if (s.length < 10) return false;
  // สาระต้องเหลือพอ ไม่ใช่โดนตัดจนกลวง
  if (s.length < Math.min(30, Math.floor(o.length * 0.4))) return false;
  if (SANITIZE_LEFTOVER_RE.test(s)) return false;
  // ลงท้ายต้องเป็นตัวอักษรไทย/ตัวเลข/วรรคตอนปกติ ไม่จบด้วยอักขระค้าง
  if (!/[ก-๙0-9a-zA-Z%.!?)]$/.test(s)) return false;
  return true;
}

/**
 * Fail-closed tone resolution (Codex 14 ส.ค. รอบ 2 — ห้ามส่ง original ที่ถูก block):
 * retry ผ่านทั้ง tone+money → ใช้ retry · ไม่งั้น sanitize original แล้วตรวจซ้ำ
 * · ยังไม่ผ่าน → NEUTRAL_RECOVERY_FALLBACK — ไม่มีทางที่ข้อความมีคำต้องห้ามหลุดออกไป
 * @param {{ original: string, retry: string | null, moneyCtx: { userMoneyIntent?: boolean, inPaymentState?: boolean } }} p
 * @returns {{ text: string, outcome: "retry_passed" | "sanitized" | "fallback" }}
 */
export function resolveToneGuardedText({ original, retry, moneyCtx = {} }) {
  if (retry && evaluateToneGuard(retry).ok && evaluateMoneyGuard(retry, moneyCtx).ok) {
    return { text: retry, outcome: "retry_passed" };
  }
  const sanitized = sanitizePraiseComfort(original);
  if (
    sanitizedOutputQualityOk(sanitized, original) &&
    evaluateToneGuard(sanitized).ok &&
    evaluateMoneyGuard(sanitized, moneyCtx).ok
  ) {
    return { text: sanitized, outcome: "sanitized" };
  }
  return { text: NEUTRAL_RECOVERY_FALLBACK, outcome: "fallback" };
}
