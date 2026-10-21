/**
 * P2 (chat-quality 20 ต.ค. 2026 เคส A · Codex 21 ต.ค.): คำถามสิทธิ์ฟรี ("ดูฟรีไหม/สแกนฟรีมั้ย") ตอบ AI=0 จากนโยบาย + สิทธิ์รายคน ณ เวลานั้น
 *  - ตอบ 2 แง่เสมอ ไม่เดาเจตนา: (1) ผลเก่าของเจ้าของเปิดดูได้โดยไม่ซื้อแพ็ก (2) สแกนใหม่: แพ็ก/โบนัส/วันหมดอายุ/trial/โควต้ารายวัน ตามสถานะจริง
 *  - อ่านสิทธิ์ล้ม → ตอบเฉพาะส่วนที่ทราบ (ผลเก่า) + บอกว่าตรวจสิทธิ์สแกนใหม่ไม่ได้ตอนนี้ ห้ามเดาว่าไม่มีสิทธิ์
 *  - router แคบ: ต้องมี "ฟรี" + รูปคำถาม/กริยาการใช้ · ไม่จับคำว่า "ฟรี" ทุกบริบท · ไม่ส่งการ์ดขาย ไม่มีราคา ไม่สัญญาฟรีนอกโหมด
 */
export const FREE_QUESTION_REPLY_TYPE = "free_question_entitlement";
const QUESTION_MARK_RE = /(ไหม|มั้ย|หรือเปล่า|รึเปล่า|หรือไม่|ป่ะ|ปะ|\?|ได้ยัง|ยังฟรี|ฟรีอยู่|มีฟรี)/u;
/** บริบท "สิทธิ์ใช้บริการสแกน/ดูผล" เท่านั้น — กริยาใช้งานติดกับ "ฟรี" (Codex รอบ 2: "ส่ง/ทำ" ตัดออก เพราะชน "ค่าส่งฟรี") */
const VERB_FREE_RE = /(ดู|สแกน|ใช้|ลอง|เช็ค|อ่าน|เปิด)\s*ฟรี/u;
const SERVICE_NOUN_RE = /(สแกน|ดูผล|ผลเก่า|รายงาน|สิทธิ์|ทดลอง|โควต้า|โควตา|ครั้ง)/u;
/** ประโยคสั้นที่ถามเรื่องฟรีล้วน ๆ เช่น "ฟรีไหม" "ยังฟรีอยู่ไหม" "มีฟรีมั้ยคะ" */
const BARE_FREE_RE = /^(ตอนนี้|วันนี้)?(ยัง)?(มี)?ฟรี(อยู่)?(ไหม|มั้ย|หรือเปล่า|รึเปล่า|ป่ะ|ปะ|หรือไม่|ได้ยัง|\?)(ครับ|คับ|คะ|ค่ะ|นะ)?\??$/u; // ต้องมีรูปคำถาม — "ฟรี" เฉย ๆ ไม่จับ
const EXCLUDE_RE = /(โอน|สลิป|จ่ายแล้ว|ชำระแล้ว|แนบ|ชวนเพื่อน|โปรโมชั่น|ส่วนลด|แจก|ของฟรี|ค่าส่ง|จัดส่ง|ส่งฟรี|ค่าธรรมเนียม|ค่าบริการ|ค่าจัดส่ง|อาหาร|wifi|ไวไฟ|ที่จอด)/iu;

/** @param {string} text @returns {boolean} true = คำถามสิทธิ์ฟรีของบริการสแกน/ดูผล (ไม่ใช่แค่มีคำว่า "ฟรี" + คำถาม) */
export function matchFreeQuestion(text) {
  const t = String(text || "").trim();
  if (!t || t.length > 60 || !t.includes("ฟรี")) return false;
  if (EXCLUDE_RE.test(t)) return false;
  if (BARE_FREE_RE.test(t.replace(/\s+/g, ""))) return true;
  if (VERB_FREE_RE.test(t)) return true;
  return SERVICE_NOUN_RE.test(t) && QUESTION_MARK_RE.test(t);
}

/**
 * ขอบเขตที่ P2 รับผิดชอบ = idle / scan-ready idle / paywall (กำลังเลือกแพ็ก) เท่านั้น — ตัดสินจาก snapshot ที่ resolve จาก DB + memory แล้ว
 * (Codex รอบ 2: memory อย่างเดียวหลุดหลัง restart — DB awaiting_payment แต่ memory none ต้องไม่แย่งเส้น awaiting_slip)
 * @param {{ hasPendingVerify?: boolean, hasAwaitingSlip?: boolean, paymentMemoryState?: string, paymentState?: string, flowState?: string, canonicalStateOwner?: string }|null|undefined} s
 */
export function freeQuestionScopeAllowed(s) {
  if (!s || typeof s !== "object") return false; // ไม่มี snapshot = ไม่รู้สถานะ → ไม่แย่งเส้น
  if (s.hasPendingVerify === true || s.hasAwaitingSlip === true) return false;
  if (String(s.paymentMemoryState || "") === "awaiting_slip") return false;
  const owner = String(s.canonicalStateOwner || "");
  if (owner === "hard_blocked" || owner === "soft_locked" || owner === "pending_verify" || owner === "awaiting_slip" || owner === "payment_package_selected") return false;
  if (String(s.flowState || "") === "waiting_birthdate") return false;
  const ps = String(s.paymentState || "none");
  return ps === "none" || ps === "paywall_offer_single";
}

const OLD_RESULTS_LINE = "ผลสแกนเดิมของคุณเปิดดูได้ฟรีเสมอครับ กดเมนู ดูผลเก่า ได้เลย";
const UNAVAILABLE_LINE = "ส่วนสิทธิ์สแกนใหม่ ตอนนี้ตรวจให้ไม่ได้ชั่วคราว ลองถามใหม่อีกครั้งครับ";

/**
 * @param {ReturnType<import("../entitlementCopy.service.js").resolveEntitlementState>|null} ent
 * @param {{ thaiDate?: (iso: string) => string }} [deps]
 */
export function buildFreeQuestionText(ent, deps = {}) {
  const fmt = deps.thaiDate || ((s) => String(s || "").slice(0, 10));
  const lines = [OLD_RESULTS_LINE];
  if (!ent || ent.state === "unavailable") { lines.push(UNAVAILABLE_LINE); return lines.join("\n"); }
  const bonus = ent.bonusLeft > 0 ? ` (มีสิทธิ์โบนัสอีก ${ent.bonusLeft} ครั้ง)` : "";
  switch (ent.state) {
    case "paid":
      lines.push(ent.paidUnlimited
        ? `สแกนใหม่: ตอนนี้มีแพ็กไม่จำกัดเปิดอยู่${ent.paidUntil ? ` ใช้ได้ถึง ${fmt(ent.paidUntil)}` : ""} ส่งรูปมาได้เลยครับ`
        : `สแกนใหม่: ตอนนี้มีแพ็กเปิดอยู่ เหลือ ${ent.paidLeft} ครั้ง${ent.paidUntil ? ` ใช้ได้ถึง ${fmt(ent.paidUntil)}` : ""}${bonus} ส่งรูปมาได้เลยครับ`);
      break;
    case "bonus":
      lines.push(`สแกนใหม่: มีสิทธิ์โบนัสเหลือ ${ent.bonusLeft} ครั้ง ส่งรูปมาได้เลยครับ ไม่ต้องซื้อแพ็ก`);
      break;
    case "trial_left":
      lines.push(`สแกนใหม่: บัญชีใหม่ทดลองฟรีเหลือ ${ent.freeLeft} จาก ${ent.trialLimit || ent.freeLimit} ครั้ง ส่งรูปมาได้เลยครับ${bonus}`);
      break;
    case "trial_exhausted":
      lines.push(`สแกนใหม่: สิทธิ์ทดลองฟรี ${ent.trialLimit || ent.freeLimit} ครั้งใช้ครบแล้วครับ ถ้าต้องการสแกนเพิ่มต้องใช้แพ็ก${bonus}`);
      break;
    case "daily_left":
      lines.push(`สแกนใหม่: ฟรีวันละ ${ent.freeLimit} ครั้ง วันนี้ยังเหลือ ${ent.freeLeft} ครั้ง ส่งรูปมาได้เลยครับ${bonus}`);
      break;
    case "daily_exhausted":
      // Codex รอบ 2: ห้ามรับปาก "พรุ่งนี้ใช้ได้อีก" จากโหมดปัจจุบัน — อาจมีกำหนดการเปลี่ยนโหมดตอนเที่ยงคืน
      lines.push(`สแกนใหม่: ฟรีวันละ ${ent.freeLimit} ครั้ง วันนี้ใช้ครบแล้วครับ${bonus}`);
      break;
    case "paid_expired":
      lines.push(`สแกนใหม่: แพ็กเดิมหมดอายุแล้ว${ent.expiredPaidUntil ? ` (${fmt(ent.expiredPaidUntil)})` : ""} ตอนนี้ไม่มีสิทธิ์ฟรีครับ ถ้าต้องการสแกนเพิ่มต้องเติมแพ็ก${bonus}`);
      break;
    case "existing_no_rights":
      lines.push(ent.policy === "new_customer"
        ? `สแกนใหม่: ตอนนี้ไม่มีสิทธิ์ฟรีครับ (ทดลองฟรีมีเฉพาะบัญชีใหม่ บัญชีนี้ไม่เข้าเกณฑ์) ถ้าต้องการสแกนเพิ่มต้องใช้แพ็ก${bonus}`
        : `สแกนใหม่: ตอนนี้ไม่มีสิทธิ์ฟรีครับ ถ้าต้องการสแกนเพิ่มต้องใช้แพ็ก${bonus}`);
      break;
    default:
      lines.push(UNAVAILABLE_LINE);
  }
  return lines.join("\n");
}

/**
 * Terminal handler — AI=0 · ไม่แตะ state · ไม่ส่งการ์ด/quick reply ขาย · ตอบเฉพาะในขอบเขต freeQuestionScopeAllowed(snapshot)
 * @param {{ client: any, userId: string, replyToken: string, text: string, snapshot: object|null,
 *   deps: { sendNonScanReply: Function, checkScanAccess: Function, resolveEntitlementState: Function, thaiDate?: Function, now?: Date } }} p
 * @returns {Promise<boolean>} true = จบเทิร์น · false = ไม่ใช่คำถามนี้ หรืออยู่นอกขอบเขต (ให้เส้นเดิมทำงานต่อ)
 */
export async function handleFreeQuestion({ client, userId, replyToken, text, snapshot, deps }) {
  if (!matchFreeQuestion(text)) return false;
  if (!freeQuestionScopeAllowed(snapshot)) {
    console.log(JSON.stringify({ event: "FREE_QUESTION_SKIPPED_STATE", paymentState: snapshot?.paymentState ?? null, owner: snapshot?.canonicalStateOwner ?? null, hasAwaitingSlip: snapshot?.hasAwaitingSlip === true, hasPendingVerify: snapshot?.hasPendingVerify === true }));
    return false;
  }
  let ent = null;
  try {
    const access = await deps.checkScanAccess({ userId });
    ent = deps.resolveEntitlementState(access, { now: deps.now });
  } catch (e) {
    console.error(JSON.stringify({ event: "FREE_QUESTION_ACCESS_READ_FAILED", reason: String(e?.message || e).slice(0, 120) }));
    ent = null; // ตอบเฉพาะส่วนที่ทราบ ห้ามเดาว่าไม่มีสิทธิ์
  }
  await deps.sendNonScanReply({
    client, userId, replyToken,
    replyType: FREE_QUESTION_REPLY_TYPE, semanticKey: FREE_QUESTION_REPLY_TYPE,
    text: buildFreeQuestionText(ent, { thaiDate: deps.thaiDate }), alternateTexts: [],
    speakerRoleOverride: "admin",
  });
  return true;
}
