/**
 * ข้อมูลชิ้นที่ลูกค้าพิมพ์ "ก่อน/พร้อม" รูป (flow-role audit 26 ส.ค. 2026 — เคส 1/4/9/12)
 *
 * เดิม: ข้อความ "พระสมเด็จวัดประสาทฯ ปี 2506" ที่มาก่อนรูป ไม่มีตัวจับ → ตกไป consult
 * ซึ่งแต่งผลจากชื่อรุ่น + gate ถามข้อมูลซ้ำ · ตอนนี้: deterministic high-confidence gate ก่อน
 * (ห้ามส่งข้อความสั้นทุกข้อความเข้า LLM parser) → เก็บ provisional TTL 15 นาที →
 * bind/consume ครั้งเดียวกับรูปถัดไป แล้วลบทันที
 */
import { setLargeValueWithTtl, moveKeyAtomic, getDelKey } from "../../redis/scanV2Redis.js";

export const PRE_SCAN_INFO_TTL_SEC = 15 * 60;
const key = (uid) => `objinfo:preprovided:${uid}`;

/** สัญญาณข้อมูลชิ้นที่ชัดพอ (ต้องเจออย่างน้อย 1) */
const STRONG_SIGNAL_RE =
  /วัด(?!มา|ไป|ไหน|ใจ|ผล|ค่า|ตัว|กัน|ดู|รอบ|แล้ว)[ก-๙]{2,}|รุ่น\s*[ก-๙A-Za-z0-9]{1,}|ปี\s*(?:พ\.?ศ\.?\s*)?(?:25|24)\d{2}|(?:พ\.?ศ\.?)\s*(?:25|24)\d{2}|หลวงปู่|หลวงพ่อ|หลวงตา|ครูบา|พระสมเด็จ|พระขุนแผน|พระนางพญา|พระรอด|พระผงสุพรรณ|พระกริ่ง|เหรียญ(?:หลวง|พระ|รุ่น)|ตะกรุด|ปรกโพธิ์|ปิดตา|กำไล(?:หิน|หยก)|หิน[ก-๙]{2,}/u;
/** ไม่ใช่ข้อมูลชิ้น: คำถาม เงิน เมนู flow อื่น */
const EXCLUDE_RE =
  /[?？]|ไหม|มั้ย|หรือเปล่า|รึเปล่า|ยังไง|อย่างไร|เท่าไหร่|เท่าไร|กี่|ทำไม|อะไร|ที่ไหน|ไหน|เมื่อไหร่|ใช่ป่ะ|ดีป่ะ|จ่าย|โอน|สลิป|ค่าครู|ราคา|แพ็ก|แพค|โปร(?!ด)|สิทธิ์|ประวัติ|จัดชุด|ชวนเพื่อน|เมนู|ยกเลิก|แก้วันเกิด|วิธีใช้|ช่วย|แนะนำ|ควร|เหมาะ|เข้ากับ|แท้|ปลอม|เก๊|ขาย|เช่า|ประเมิน|http|www\.|ผมเกิด|เกิดวัน|เกิดปี/u;
// หมายเหตุ: ไม่ exclude คำว่า พลัง/ดวง เพราะชื่อรุ่นจริงมี ("รุ่นหนุนดวง", "รุ่นเสริมพลัง") — คำถามพลังถูกกันด้วยคำถาม (ไหม/ยังไง/อะไร)

/**
 * deterministic gate — true = ข้อความนี้คือข้อมูลชิ้นที่ลูกค้าบอกเอง (ไม่ใช่คำถาม/เงิน/เมนู)
 * @param {string} text
 */
export function isPreScanObjectInfoText(text) {
  const t = String(text || "").trim();
  if (!t || t.length < 6 || t.length > 80) return false;
  if (/\n/.test(t)) return false;
  if (EXCLUDE_RE.test(t)) return false;
  return STRONG_SIGNAL_RE.test(t);
}

/** เก็บ provisional (TTL 15 นาที) — เขียนทับของเดิมได้ (ข้อความล่าสุดคือของชิ้นถัดไป) */
export async function storePreScanObjectInfo(lineUserId, rawText, deps = {}) {
  const uid = String(lineUserId || "").trim();
  const raw = String(rawText || "").trim().slice(0, 400);
  if (!uid || !raw) return false;
  const set = deps.set || setLargeValueWithTtl;
  await set(key(uid), JSON.stringify({ raw, at: Date.now() }), PRE_SCAN_INFO_TTL_SEC);
  return true;
}

const jobKey = (jobId) => `objinfo:pre_job:${jobId}`;

/**
 * bind ตอน "รับรูป/สร้าง job" (Codex รอบสอง #1): ย้าย uid-scoped → job-scoped แบบ atomic (Lua MOVE)
 * → รูปถัดไปเท่านั้นที่ได้ข้อมูล · สองรูปติดกัน รูปแรกได้ รูปสองไม่ได้ · ไม่มี redis = ไม่ bind
 * @returns {Promise<boolean>} true = bind แล้ว
 */
export async function bindPreScanInfoToJob(lineUserId, jobId, deps = {}) {
  const uid = String(lineUserId || "").trim();
  const jid = String(jobId || "").trim();
  if (!uid || !jid) return false;
  const move = deps.move || moveKeyAtomic;
  const v = await move(key(uid), jobKey(jid), PRE_SCAN_INFO_TTL_SEC);
  return Boolean(v);
}

/**
 * consume ครั้งเดียว (atomic GETDEL) ตาม jobId — gate เรียกตอนจะตัดสินว่าต้องถามหรือไม่
 * @returns {Promise<{ raw: string, at: number } | null>}
 */
export async function consumeJobPreScanInfo(jobId, deps = {}) {
  const jid = String(jobId || "").trim();
  if (!jid) return null;
  const getdel = deps.getdel || getDelKey;
  let raw = null;
  try {
    raw = await getdel(jobKey(jid));
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    if (!j || !j.raw) return null;
    if (Date.now() - Number(j.at || 0) > PRE_SCAN_INFO_TTL_SEC * 1000) return null;
    return { raw: String(j.raw), at: Number(j.at) };
  } catch {
    return null;
  }
}

/** DB insert ล้ม → คืน evidence กลับให้ job (ยังไม่หาย) แล้ว gate ถามตามปกติ */
export async function restoreJobPreScanInfo(jobId, info, deps = {}) {
  const jid = String(jobId || "").trim();
  if (!jid || !info?.raw) return;
  const set = deps.set || setLargeValueWithTtl;
  await set(jobKey(jid), JSON.stringify({ raw: info.raw, at: info.at || Date.now() }), PRE_SCAN_INFO_TTL_SEC);
}

/** copy แอดมินรับข้อมูล (โทนเดิม) */
export const PRE_SCAN_INFO_ACK_TEXT = "รับข้อมูลชิ้นนี้ไว้แล้วครับ ส่งรูปมาได้เลย เดี๋ยวผมส่งให้อาจารย์ดู";
