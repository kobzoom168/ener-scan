/**
 * "แพ็กนี้ดีไหม / โปรคุ้มไหม" ตอน idle (Codex smoke 24 ส.ค.): ตอบข้อเท็จจริงแพ็ก deterministic AI=0
 * - มี selected package → ข้อเท็จจริงแพ็กนั้น
 * - ไม่มี context → ราคาที่มีทั้งหมด
 * - ห้ามส่ง QR เอง (QR เปิดเฉพาะเมื่อลูกค้าสั่ง "จ่าย …")
 */
import { listActivePackages, findPackageByKey } from "../scanOffer.packages.js";

const PKG_WORD_RE = /แพ็ก|แพ็ค|แพค|โปร(?!ด|ไฟล์|แกรม)|ค่าครู/u;
const OPINION_RE = /ดีไหม|ดีมั้ย|ดีป่ะ|คุ้มไหม|คุ้มมั้ย|ควรไหม|ควรมั้ย|เอาไหม|เอาดีไหม|เหมาะไหม|น่าซื้อไหม|ดีกว่าไหม/u;

export function isPackageOpinionQuestion(text) {
  const t = String(text || "").trim();
  if (!t || t.length > 60) return false;
  return PKG_WORD_RE.test(t) && OPINION_RE.test(t);
}

function windowThai(hours) {
  const h = Number(hours) || 0;
  if (h >= 48 && h % 24 === 0) return `${h / 24} วัน`; // 24 ชม. คงรูปแบบการ์ด "4 ครั้ง ใน 24 ชม."
  return `${h} ชม.`;
}

/** @returns {{ text: string, via: "selected_package" | "all_prices" | null }} */
export function buildPackageFactText(offer, selectedPackageKey = null) {
  const selected = findPackageByKey(offer, selectedPackageKey);
  if (selected) {
    return {
      text: `${selected.priceThb} บาท ${selected.scanCount} ครั้ง ใน ${windowThai(selected.windowHours)}`,
      via: "selected_package",
    };
  }
  const prices = listActivePackages(offer).map((p) => Number(p.priceThb)).filter((n) => Number.isFinite(n));
  if (!prices.length) return { text: "", via: null };
  const last = prices[prices.length - 1];
  const head = prices.slice(0, -1).join(", ");
  return { text: `แพ็กมี ${head ? `${head} และ ${last}` : last} บาท`, via: "all_prices" };
}
