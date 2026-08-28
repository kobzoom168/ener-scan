/**
 * P0-C (Codex 28 ส.ค. 2026): คำถามแพ็ก/ราคา/สิทธิ์ = ข้อเท็จจริงจาก SSOT (scanOffer + checkScanAccess)
 * ตอบ deterministic เสียงแอดมิน AI = 0 · ไม่เปิด QR (QR เฉพาะคำสั่งจ่าย "จ่าย 49" ตาม isPaymentCommand)
 * ห้าม fallback "เดี๋ยวแจ้งกลับ" — ไม่มี durable owner
 *
 * เคสจริง smoke 28 ส.ค.: "ค่าครู 49 บาทได้กี่ครั้ง" → consult ตอบถูกแต่ guard สิทธิ์แทนด้วย
 * "เดี๋ยวผมเช็กสถานะให้ก่อนครับ แล้วแจ้งกลับ" (handoff ค้าง) · "แพ็คนี้ดีไหม" → guard บล็อก 2 รอบ
 */
import { listActivePackages, getDefaultPackage, findActivePackageByPriceThb, findPackageByKey } from "../services/scanOffer.packages.js";

const NEG_OBJECT_RE = /ประเมิน|เช่า|ปล่อย|พระ|เหรียญ|องค์|หิน|กำไล|พลัง|ดวง/;
const PACK_TERM_RE = /แพ็ก|แพ็ค|แพค|แพคเกจ|แพ็กเกจ|ค่าครู|โปร(?!ด|ไฟล์|แกรม)|สมาชิก/;
const PRICE_IN_TEXT_RE = /(\d{2,4})\s*(?:บาท|บ\.|฿)?/;
const COUNT_ASK_RE = /กี่ครั้ง|กี่รอบ|ได้กี่|ใช้ได้เท่าไหร่|ใช้ได้กี่|สแกนได้กี่/;
const WORTH_ASK_RE = /ดีไหม|ดีมั้ย|คุ้มไหม|คุ้มมั้ย|คุ้มไหม|ควรซื้อ|ควรจ่าย|น่าซื้อ|เอาดีไหม|ซื้อดีไหม|โอเคไหม|ดีป่ะ|คุ้มป่ะ/;
const QUOTA_TERM_RE = /สิทธิ์|สิทธิ|โควตา|โควต้า|เครดิต|รอบสแกน|สแกนฟรี|สิทธิ์สแกน/;
const REMAIN_ASK_RE = /เหลือ|คงเหลือ|ยังมี|ใช้ไปกี่|หมดยัง|หมดหรือยัง|เหลือกี่|กี่ครั้ง/;

/**
 * @param {string} text
 * @returns {"pack_price_count" | "pack_worth" | "quota_remaining" | "other"}
 */
export function classifyPackageQuestion(text) {
  const t = String(text || "").trim();
  if (!t || t.length > 60 || /\n/.test(t)) return "other";
  if (NEG_OBJECT_RE.test(t) && !PACK_TERM_RE.test(t) && !QUOTA_TERM_RE.test(t)) return "other";
  // สิทธิ์เหลือกี่ครั้ง / โควตาเหลือไหม / สแกนฟรีเหลือกี่ครั้ง (ชนะก่อน — คำว่า "กี่ครั้ง" ซ้ำกับราคา)
  if (QUOTA_TERM_RE.test(t) && REMAIN_ASK_RE.test(t)) return "quota_remaining";
  if (/เหลือกี่ครั้ง|เหลืออีกกี่ครั้ง|สแกนได้อีกกี่ครั้ง/.test(t) && !PRICE_IN_TEXT_RE.test(t)) return "quota_remaining";
  // แพ็กนี้ดีไหม / 49 คุ้มไหม / โปรนี้โอเคไหม
  if ((PACK_TERM_RE.test(t) || PRICE_IN_TEXT_RE.test(t)) && WORTH_ASK_RE.test(t)) return "pack_worth";
  // ค่าครู 49 บาทได้กี่ครั้ง / แพ็ก 399 ใช้ได้กี่ครั้ง / 49 บาทกี่ครั้ง
  if ((PACK_TERM_RE.test(t) || PRICE_IN_TEXT_RE.test(t)) && COUNT_ASK_RE.test(t)) return "pack_price_count";
  return "other";
}

const winTxt = (h) => (h >= 48 && h % 24 === 0 ? `${h / 24} วัน` : `${h} ชั่วโมง`);
const pkgLine = (p) =>
  Number(p.scanCount) >= 999999
    ? `${p.priceThb} บาท สแกนไม่จำกัด ${winTxt(p.windowHours)} (รายเดือน)`
    : `${p.priceThb} บาท ใช้ได้ ${p.scanCount} ครั้ง ภายใน ${winTxt(p.windowHours)}`;

/** ราคาที่ลูกค้าพิมพ์มา (ถ้ามี) */
export function extractPriceThbFromText(text) {
  const m = String(text || "").match(PRICE_IN_TEXT_RE);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n >= 10 && n <= 9999 ? n : null;
}

/**
 * "ค่าครู 49 บาทได้กี่ครั้ง" — ข้อเท็จจริงจาก offer เท่านั้น (Codex 28 ส.ค.: ห้ามแถมคำชวนจ่าย —
 * ลูกค้าถามแค่ใช้ได้กี่ครั้ง ไม่ได้ขอเปิดสิทธิ์) · ไม่เปิด QR · ไม่สัญญา
 * @param {{ offer: object, text: string }} p
 */
export function buildPackagePriceCountReply({ offer, text }) {
  const pkgs = listActivePackages(offer);
  const price = extractPriceThbFromText(text);
  const hit = price != null ? findActivePackageByPriceThb(offer, price) : null;
  if (hit) return `${pkgLine(hit)}ครับ`;
  if (price != null && pkgs.length > 0) {
    return `ตอนนี้ไม่มีแพ็ก ${price} บาทครับ แพ็กที่เปิดอยู่:\n${pkgs.map((p, i) => `${i + 1}) ${pkgLine(p)}`).join("\n")}`;
  }
  if (pkgs.length === 1) return `${pkgLine(pkgs[0])}ครับ`;
  if (pkgs.length > 1) return `แพ็กที่เปิดอยู่ตอนนี้ครับ:\n${pkgs.map((p, i) => `${i + 1}) ${pkgLine(p)}`).join("\n")}`;
  const def = getDefaultPackage(offer);
  return def ? `${pkgLine(def)}ครับ` : "ตอนนี้ยังไม่มีแพ็กเปิดให้เลือกครับ";
}

/**
 * "แพ็กนี้ดีไหม" — มี selected package (หรือราคาในข้อความ) → ข้อเท็จจริงของแพ็กนั้น · ไม่มี → สรุปแพ็กสั้น ๆ
 * ไม่ขาย ไม่ตีความ ไม่เปิด QR ไม่ชวนจ่าย
 * @param {{ offer: object, text: string, selectedPackageKey?: string|null }} p
 */
export function buildPackageWorthReply({ offer, text, selectedPackageKey = null }) {
  const pkgs = listActivePackages(offer);
  const price = extractPriceThbFromText(text);
  const hit =
    (price != null ? findActivePackageByPriceThb(offer, price) : null) ||
    (selectedPackageKey ? findPackageByKey(offer, selectedPackageKey) : null);
  if (hit) {
    const per = Number(hit.scanCount) >= 999999 ? "" : ` ตกครั้งละประมาณ ${Math.round(hit.priceThb / Math.max(1, Number(hit.scanCount)))} บาท`;
    return `${pkgLine(hit)}${per} เหมาะถ้ามีหลายชิ้นอยากดูในช่วงนี้ครับ ชิ้นเดียวใช้สแกนฟรีรายวันก่อนได้`;
  }
  if (pkgs.length === 0) return "ตอนนี้ยังไม่มีแพ็กเปิดให้เลือกครับ";
  return `แพ็กที่เปิดอยู่ครับ:\n${pkgs.map((p, i) => `${i + 1}) ${pkgLine(p)}`).join("\n")}\nเลือกตามจำนวนชิ้นที่อยากดูในช่วงนี้ได้เลย ชิ้นเดียวใช้สแกนฟรีรายวันก่อนก็ได้ครับ`;
}

/** วันที่ไทยสั้น จาก ISO (ไม่มี = null) */
function thaiShortDate(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  const bkk = new Date(d.getTime() + 7 * 3600 * 1000);
  const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  return `${bkk.getUTCDate()} ${months[bkk.getUTCMonth()]}`;
}

/**
 * "สิทธิ์สแกนเหลือกี่ครั้ง" — อ่านสิทธิ์จริง (checkScanAccess + free quota วันนี้) ห้ามเดา ห้ามสัญญา
 * @param {{
 *   access: { allowed?: boolean, reason?: string, remaining?: number|null, paidUntil?: string|null, paidRemainingScans?: number|null } | null,
 *   freeRemainingToday: number|null,
 *   freeQuotaPerDay: number|null,
 *   nextResetLabel?: string,
 *   now?: Date,
 * }} p
 */
export function buildQuotaRemainingReply({ access, freeRemainingToday, freeQuotaPerDay, nextResetLabel = "", now = new Date() }) {
  const paidUntil = access?.paidUntil || null;
  const paidRemaining = Number(access?.paidRemainingScans);
  const paidActive = Boolean(paidUntil && new Date(paidUntil).getTime() > now.getTime());
  const allowed = access?.allowed === true;
  const isNum = (x) => x != null && x !== "" && Number.isFinite(Number(x));
  const fr = isNum(freeRemainingToday) ? Math.max(0, Number(freeRemainingToday)) : null;
  const fl = isNum(freeQuotaPerDay) ? Number(freeQuotaPerDay) : null;
  // label จาก resolver เป็น "พรุ่งนี้เวลา 00:00 น. (รีเซ็ตโควตฟรี)" — ตัดวงเล็บท้ายออกให้อ่านเป็นประโยค
  const resetLabel = String(nextResetLabel || "").replace(/\s*\([^)]*\)\s*$/, "").trim();
  const lines = [];
  if (paidActive) {
    const until = thaiShortDate(paidUntil);
    if (Number.isFinite(paidRemaining) && paidRemaining >= 999999) {
      lines.push(`สิทธิ์แพ็กของคุณสแกนไม่จำกัด${until ? ` ใช้ได้ถึง ${until}` : ""}ครับ`);
    } else if (Number.isFinite(paidRemaining)) {
      lines.push(`สิทธิ์แพ็กเหลือ ${Math.max(0, paidRemaining)} ครั้ง${until ? ` ใช้ได้ถึง ${until}` : ""}ครับ`);
    } else {
      lines.push(`สิทธิ์แพ็กยังเปิดอยู่${until ? ` ถึง ${until}` : ""}ครับ`);
    }
    if (fr != null && fl != null) lines.push(fr > 0 ? `สแกนฟรีวันนี้เหลือ ${fr} จาก ${fl} ครั้ง` : `สแกนฟรีวันนี้ใช้ครบ ${fl} ครั้งแล้ว`);
    return lines.join(" ");
  }
  // ไม่มีแพ็ก active แต่ authority บอก allowed (ฟรีเหลือ / โบนัสชวนเพื่อน / อื่น ๆ) → ห้ามพูดว่า "ใช้ครบแล้ว"
  // (เคสจริง staging 28 ส.ค.: checkScanAccess allowed:true reason:free ผ่านโบนัส แต่ freeRemaining=0 → ข้อความเดิมบอกหมดสิทธิ์ = ขัดกับ authority)
  if (allowed) {
    if (fr != null && fl != null && fr > 0) {
      return `ตอนนี้ไม่มีสิทธิ์แพ็กเปิดอยู่ครับ สแกนฟรีวันนี้เหลือ ${fr} จาก ${fl} ครั้ง`;
    }
    const rem = Number(access?.remaining);
    const remTxt = Number.isFinite(rem) && rem > 0 && rem < 999999 ? ` ใช้ได้อีก ${rem} ครั้ง` : "";
    return `ตอนนี้ยังมีสิทธิ์สแกนอยู่ครับ${remTxt} ส่งรูปมาได้เลย`;
  }
  lines.push("ตอนนี้ไม่มีสิทธิ์แพ็กเปิดอยู่ครับ");
  // ห้าม hardcode/เดาจำนวนฟรี: ไม่มีค่าจริงจาก checkScanAccess = ไม่พูดถึงฟรีเลย
  if (fr != null && fl != null) {
    lines.push(fr > 0 ? `สแกนฟรีวันนี้เหลือ ${fr} จาก ${fl} ครั้ง` : `สแกนฟรีวันนี้ใช้ครบ ${fl} ครั้งแล้ว${resetLabel ? ` รอบใหม่${resetLabel}` : ""}`);
  }
  return lines.join(" ");
}

export const QUOTA_READ_FAILED_TEXT = "ตอนนี้ตรวจสิทธิ์ให้ไม่ได้ครับ ลองถามใหม่อีกครั้งได้เลย";

/**
 * ตัวรวม (ใช้ทั้ง webhook และ test hermetic): คำถามแพ็ก/ราคา/สิทธิ์ → { kind, text } · ไม่ใช่ = null
 * - คำสั่งจ่ายจริง (deps.isPaymentCommand) = null เสมอ → payment route เดิม (QR)
 * - สิทธิ์: อ่าน deps.checkScanAccess เท่านั้น (authoritative) · ล้ม/ว่าง → บอกตรงว่าตรวจไม่ได้ ไม่สัญญา
 * - AI = 0 ทุกกรณี (ไม่มี LLM ใน path นี้)
 * @param {{
 *   text: string, lowerText?: string, userId: string,
 *   offer: object, selectedPackageKey?: string|null,
 *   isPaymentCommand: (t: string, lt?: string) => boolean,
 *   checkScanAccess: (p: { userId: string }) => Promise<object|null>,
 *   nextResetLabel?: (usedScans: number) => string,
 * }} deps
 * @returns {Promise<{ kind: string, text: string, accessReadFailed?: boolean } | null>}
 */
export async function resolvePackageQuestionReply(deps) {
  const t = String(deps.text || "").trim();
  if (!t) return null;
  if (deps.isPaymentCommand(t, deps.lowerText)) return null;
  const kind = classifyPackageQuestion(t);
  if (kind === "other") return null;
  if (kind === "pack_price_count") return { kind, text: buildPackagePriceCountReply({ offer: deps.offer, text: t }) };
  if (kind === "pack_worth") return { kind, text: buildPackageWorthReply({ offer: deps.offer, text: t, selectedPackageKey: deps.selectedPackageKey || null }) };
  let access = null;
  try {
    access = await deps.checkScanAccess({ userId: deps.userId });
  } catch {
    access = null;
  }
  if (!access || typeof access !== "object") return { kind, text: QUOTA_READ_FAILED_TEXT, accessReadFailed: true };
  const freeRemaining = Number.isFinite(Number(access.freeScansRemaining)) ? Number(access.freeScansRemaining) : null;
  const freeLimit = Number.isFinite(Number(access.freeScansLimit)) ? Number(access.freeScansLimit) : null;
  const used = Number.isFinite(Number(access.usedScans)) ? Number(access.usedScans) : null;
  const nextResetLabel = access.allowed !== true && freeRemaining === 0 && typeof deps.nextResetLabel === "function" ? String(deps.nextResetLabel(used ?? 0) || "") : "";
  return {
    kind,
    text: buildQuotaRemainingReply({ access, freeRemainingToday: freeRemaining, freeQuotaPerDay: freeLimit, nextResetLabel }),
  };
}

