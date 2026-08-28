/**
 * P0-C (Codex 28 ส.ค. 2026): คำถามแพ็ก/ราคา/สิทธิ์ = ข้อเท็จจริงจาก SSOT (scanOffer + checkScanAccess)
 * ตอบ deterministic เสียงแอดมิน AI = 0 · ไม่เปิด QR (QR เฉพาะคำสั่งจ่าย "จ่าย 49" ตาม isPaymentCommand)
 * ห้าม fallback "เดี๋ยวแจ้งกลับ" — ไม่มี durable owner
 *
 * เคสจริง smoke 28 ส.ค.: "ค่าครู 49 บาทได้กี่ครั้ง" → consult ตอบถูกแต่ guard สิทธิ์แทนด้วย
 * "เดี๋ยวผมเช็กสถานะให้ก่อนครับ แล้วแจ้งกลับ" (handoff ค้าง) · "แพ็คนี้ดีไหม" → guard บล็อก 2 รอบ
 */
import { listActivePackages, getDefaultPackage, findActivePackageByPriceThb } from "../services/scanOffer.packages.js";

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
 * "ค่าครู 49 บาทได้กี่ครั้ง" — ข้อเท็จจริงจาก offer · ไม่เปิด QR · ไม่สัญญา
 * @param {{ offer: object, text: string }} p
 */
export function buildPackagePriceCountReply({ offer, text }) {
  const pkgs = listActivePackages(offer);
  const price = extractPriceThbFromText(text);
  const hit = price != null ? findActivePackageByPriceThb(offer, price) : null;
  if (hit) {
    return `${pkgLine(hit)}ครับ ถ้าต้องการเปิดสิทธิ์ พิมพ์ จ่าย ${hit.priceThb} ได้เลย`;
  }
  if (price != null && pkgs.length > 0) {
    // ราคาที่ถามไม่มีในแพ็กปัจจุบัน → บอกตรง ๆ + แพ็กที่มีจริง
    return `ตอนนี้ไม่มีแพ็ก ${price} บาทครับ แพ็กที่เปิดอยู่:\n${pkgs.map((p, i) => `${i + 1}) ${pkgLine(p)}`).join("\n")}\nต้องการอันไหน พิมพ์ จ่าย ตามด้วยราคาได้เลย`;
  }
  if (pkgs.length === 1) return `${pkgLine(pkgs[0])}ครับ ถ้าต้องการเปิดสิทธิ์ พิมพ์ จ่าย ${pkgs[0].priceThb} ได้เลย`;
  if (pkgs.length > 1) {
    return `แพ็กที่เปิดอยู่ตอนนี้ครับ:\n${pkgs.map((p, i) => `${i + 1}) ${pkgLine(p)}`).join("\n")}\nต้องการอันไหน พิมพ์ จ่าย ตามด้วยราคาได้เลย`;
  }
  const def = getDefaultPackage(offer);
  return def ? `${pkgLine(def)}ครับ` : "ตอนนี้ยังไม่มีแพ็กเปิดให้เลือกครับ ใช้สแกนฟรีรายวันได้ตามปกติ";
}

/**
 * "แพ็กนี้ดีไหม" — ไม่ขาย ไม่ตีความ: บอกสิ่งที่ได้จริงต่อแพ็ก แล้วให้ลูกค้าเลือกตามการใช้งาน
 * @param {{ offer: object, text: string }} p
 */
export function buildPackageWorthReply({ offer, text }) {
  const pkgs = listActivePackages(offer);
  const price = extractPriceThbFromText(text);
  const hit = price != null ? findActivePackageByPriceThb(offer, price) : null;
  if (hit) {
    const per = Number(hit.scanCount) >= 999999 ? "" : ` ตกครั้งละประมาณ ${Math.round(hit.priceThb / Math.max(1, Number(hit.scanCount)))} บาท`;
    return `แพ็ก ${hit.priceThb} บาท ได้${Number(hit.scanCount) >= 999999 ? "สแกนไม่จำกัด" : ` ${hit.scanCount} ครั้ง`} ภายใน ${winTxt(hit.windowHours)}${per} เหมาะถ้ามีหลายชิ้นอยากดูในช่วงนี้ครับ ถ้ามีชิ้นเดียว ใช้สแกนฟรีรายวันก่อนได้ ตัดสินใจแล้วพิมพ์ จ่าย ${hit.priceThb} ได้เลย`;
  }
  if (pkgs.length === 0) return "ตอนนี้ยังไม่มีแพ็กเปิดให้เลือกครับ ใช้สแกนฟรีรายวันได้ตามปกติ";
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
 *   access: { paidUntil?: string|null, paidRemainingScans?: number|null } | null,
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
  } else {
    lines.push("ตอนนี้ไม่มีสิทธิ์แพ็กเปิดอยู่ครับ");
  }
  if (Number.isFinite(Number(freeRemainingToday)) && Number.isFinite(Number(freeQuotaPerDay))) {
    const fr = Math.max(0, Number(freeRemainingToday));
    lines.push(
      fr > 0
        ? `สแกนฟรีวันนี้เหลือ ${fr} จาก ${freeQuotaPerDay} ครั้ง`
        : `สแกนฟรีวันนี้ใช้ครบ ${freeQuotaPerDay} ครั้งแล้ว${nextResetLabel ? ` ${nextResetLabel}` : ""}`,
    );
  }
  return lines.join(" ");
}
