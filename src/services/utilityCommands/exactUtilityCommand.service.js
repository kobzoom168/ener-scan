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

/**
 * @param {string} text
 * @returns {"referral" | "synergy" | null}
 */
export function matchExactUtilityCommand(text) {
  const t = String(text || "").trim();
  if (REFERRAL_EXACT.has(t)) return "referral";
  if (SYNERGY_EXACT_RE.test(t)) return "synergy";
  return null;
}

/** เสียงแอดมิน จริงจัง ไม่มีอีโมจิ ไม่ over-promise */
export function buildUtilityUnavailableText(kind) {
  const menuName = kind === "referral" ? "ชวนเพื่อน" : "จัดชุด";
  return `เมนู${menuName}ใช้งานไม่ได้ชั่วคราวครับ\n\nผมรับเรื่องไว้แล้ว เดี๋ยวตรวจให้ ระหว่างนี้ใช้งานส่วนอื่นได้ตามปกติครับ`;
}

/**
 * รันคำสั่งเป๊ะแบบ terminal — คืน true = จบเทิร์นนี้ (ห้ามไปต่อ), false = ไม่ใช่คำสั่ง
 * @param {{
 *   text: string,
 *   handlers: { referral: () => Promise<boolean>, synergy: () => Promise<boolean> },
 *   sendUnavailable: (kind: "referral" | "synergy") => Promise<unknown>,
 * }} p
 * @returns {Promise<boolean>}
 */
export async function runExactUtilityCommandTerminal({ text, handlers, sendUnavailable }) {
  const kind = matchExactUtilityCommand(text);
  if (!kind) return false;
  let ok = false;
  try {
    ok = (await handlers[kind]()) === true;
  } catch {
    ok = false;
  }
  if (!ok) {
    try {
      await sendUnavailable(kind);
    } catch {
      /* แจ้งไม่สำเร็จก็ยัง terminal — ห้ามไหลเข้า LLM */
    }
    console.log(
      JSON.stringify({ event: "EXACT_UTILITY_UNAVAILABLE_SENT", kind }),
    );
  }
  return true;
}
