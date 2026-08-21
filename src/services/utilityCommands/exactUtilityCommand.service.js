/**
 * คำสั่งเป๊ะจากปุ่ม/เมนู ("ชวนเพื่อน" / "จัดชุด") — contract เดียว (Codex 14 ส.ค.):
 * เมื่อข้อความ match คำสั่ง ต้อง terminal เสมอ
 * - handler สำเร็จ → ลูกค้าได้ของ (การ์ดโค้ด/carousel)
 * - feature ปิด / code สร้างไม่ได้ / error → แอดมินแจ้งขัดข้อง deterministic
 * - ห้าม fall through เข้า LLM เด็ดขาด (เคสจริง 13 ส.ค.: LLM สอนให้พิมพ์
 *   "ชวนเพื่อน" ซ้ำทั้งที่ลูกค้าพิมพ์แล้ว 3 รอบ)
 *
 * ตำแหน่งใน routing (เคาะกับ Codex): admin/identity/safety → registration gate
 * → คำสั่งเป๊ะ (ไฟล์นี้) → object/payment/birthdate states → LLM
 * — ลูกค้าใหม่ยังไม่ลงทะเบียนต้องเจอ registration gate ก่อนเสมอ
 */

const REFERRAL_EXACT = new Set(["ชวนเพื่อน", "ชวนเพื่อน ได้สแกนฟรี"]);
const SYNERGY_EXACT_RE = /^(จัดชุด|ชุดวันนี้|ชุดพลัง|จัดชุดพลัง)$/;
// "ประวัติ" จากปุ่มเมนู (เคสจริง 16-17 ส.ค.: กดระหว่างสแกน/ติด slip แล้วโดน state
// อื่นกลืน — ลูกค้าพิมพ์ซ้ำสองรอบก็ไม่ได้การ์ด) — exact เท่านั้น ประโยคยาวไป LLM ตามเดิม
const HISTORY_EXACT = new Set(["ประวัติ", "history", "ดูผลเก่า"]);

/**
 * @param {string} text
 * @returns {"referral" | "synergy" | "history" | null}
 */
export function matchExactUtilityCommand(text) {
  const t = String(text || "").trim().toLowerCase();
  const orig = String(text || "").trim();
  if (REFERRAL_EXACT.has(orig)) return "referral";
  if (SYNERGY_EXACT_RE.test(orig)) return "synergy";
  if (HISTORY_EXACT.has(orig) || HISTORY_EXACT.has(t)) return "history";
  return null;
}

/** เสียงแอดมิน จริงจัง ไม่มีอีโมจิ ไม่ over-promise */
export function buildUtilityUnavailableText(kind) {
  const menuName =
    kind === "referral" ? "ชวนเพื่อน" : kind === "history" ? "ดูผลเก่า" : "จัดชุด";
  return `เมนู${menuName}ใช้งานไม่ได้ชั่วคราว\n\nผมรับเรื่องไว้แล้ว ตรวจให้ ระหว่างนี้ใช้งานส่วนอื่นได้ตามปกติ`;
}

/**
 * รันคำสั่งเป๊ะแบบ terminal — คืน true = จบเทิร์นนี้ (ห้ามไปต่อ), false = ไม่ใช่คำสั่ง
 * Delivery honesty (Codex 14 ส.ค. รอบ 2): reply ล้ม → push fallback หนึ่งครั้ง →
 * ล้มทั้งคู่ = log DELIVERY_FAILED ตามจริง + แจ้ง monitor — ห้าม log _SENT ทั้งที่ไม่ถึงมือ
 * ทุกกรณียัง terminal เพื่อไม่ไหลเข้า LLM
 * sender contract: คืน true = ส่งถึงจริง · false/throw = ไม่ถึง
 * @param {{
 *   text: string,
 *   handlers: { referral: () => Promise<boolean>, synergy: () => Promise<boolean> },
 *   sendUnavailable: (kind: "referral" | "synergy") => Promise<boolean>,
 *   pushUnavailable?: (kind: "referral" | "synergy") => Promise<boolean>,
 *   onDeliveryFailure?: (kind: "referral" | "synergy") => Promise<unknown>,
 * }} p
 * @returns {Promise<boolean>}
 */
export async function runExactUtilityCommandTerminal({
  text,
  handlers,
  sendUnavailable,
  pushUnavailable = null,
  onDeliveryFailure = null,
}) {
  const kind = matchExactUtilityCommand(text);
  if (!kind) return false;
  let ok = false;
  try {
    ok = (await handlers[kind]()) === true;
  } catch {
    ok = false;
  }
  if (!ok) {
    let delivery = null;
    try {
      if ((await sendUnavailable(kind)) === true) delivery = "reply";
    } catch {
      delivery = null;
    }
    if (!delivery && pushUnavailable) {
      try {
        if ((await pushUnavailable(kind)) === true) delivery = "push_fallback";
      } catch {
        delivery = null;
      }
    }
    if (delivery) {
      console.log(
        JSON.stringify({ event: "EXACT_UTILITY_UNAVAILABLE_SENT", kind, delivery }),
      );
    } else {
      console.error(
        JSON.stringify({ event: "EXACT_UTILITY_UNAVAILABLE_DELIVERY_FAILED", kind }),
      );
      try {
        if (onDeliveryFailure) await onDeliveryFailure(kind);
      } catch {
        /* แจ้ง monitor ไม่ได้ก็ยัง terminal */
      }
    }
  }
  return true;
}
