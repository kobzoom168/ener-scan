/**
 * ข้อมูลชิ้นที่ลูกค้าพิมพ์ "ก่อน/พร้อม" รูป (flow-role audit 26 ส.ค. 2026 — เคส 1/4/9/12)
 *
 * เดิม: ข้อความ "พระสมเด็จวัดประสาทฯ ปี 2506" ที่มาก่อนรูป ไม่มีตัวจับ → ตกไป consult
 * ซึ่งแต่งผลจากชื่อรุ่น + gate ถามข้อมูลซ้ำ · ตอนนี้: deterministic high-confidence gate ก่อน
 * (ห้ามส่งข้อความสั้นทุกข้อความเข้า LLM parser) → เก็บ provisional TTL 15 นาที →
 * bind/consume ครั้งเดียวกับรูปถัดไป แล้วลบทันที
 *
 * P0-1 (Codex 27 ส.ค.): persistence contract เป็น typed ตามผลเขียนจริง — ไม่มี redis / SET ล้ม
 * = ห้ามอ้าง "รับข้อมูลไว้แล้ว" · bind แยก no_source / redis_unavailable / redis_error
 */
import { setValueWithTtlTyped, moveKeyAtomic, getDelKey, delKeyTyped } from "../../redis/scanV2Redis.js";

export const PRE_SCAN_INFO_TTL_SEC = 15 * 60;
const key = (uid) => `objinfo:preprovided:${uid}`;
const jobKey = (jobId) => `objinfo:pre_job:${jobId}`;

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

/**
 * เก็บ provisional (TTL 15 นาที) — เขียนทับของเดิมได้ (ข้อความล่าสุดคือของชิ้นถัดไป)
 * typed ตามผลเขียนจริง: ok:false = ห้ามอ้างว่าเก็บแล้ว
 * @returns {Promise<{ ok: true } | { ok: false, reason: "invalid_input" | "redis_unavailable" | "redis_error", message?: string }>}
 */
export async function storePreScanObjectInfo(lineUserId, rawText, deps = {}) {
  const uid = String(lineUserId || "").trim();
  const raw = String(rawText || "").trim().slice(0, 400);
  if (!uid || !raw) return { ok: false, reason: "invalid_input" };
  const set = deps.set || setValueWithTtlTyped;
  let res;
  try {
    res = await set(key(uid), JSON.stringify({ raw, at: Date.now() }), PRE_SCAN_INFO_TTL_SEC);
  } catch (e) {
    return { ok: false, reason: "redis_error", message: String(e?.message || e).slice(0, 120) };
  }
  if (res && typeof res === "object" && res.ok === true) return { ok: true };
  if (res && typeof res === "object" && res.ok === false) {
    return { ok: false, reason: res.reason === "redis_unavailable" ? "redis_unavailable" : "redis_error", message: res.message };
  }
  // set ที่ไม่คืน typed (เช่น helper เก่า) = ไม่รู้ผลจริง → ถือว่าไม่สำเร็จ (ห้าม false-success)
  return { ok: false, reason: "redis_error", message: "untyped_set_result" };
}

/**
 * bind ตอน "รับรูป/สร้าง job" (Codex รอบสอง #1): ย้าย uid-scoped → job-scoped แบบ atomic (Lua MOVE)
 * → รูปถัดไปเท่านั้นที่ได้ข้อมูล · สองรูปติดกัน รูปแรกได้ รูปสองไม่ได้
 * typed (P0-1): no_source (ไม่มีข้อมูลค้าง = ปกติ) ≠ redis_unavailable ≠ redis_error
 * redis_error: source อาจยังค้างและไป bind รูปถัดไปผิด → พยายาม DEL source (best-effort) และรายงาน sourceCleared
 * @returns {Promise<{ bound: true, status: "moved" } | { bound: false, status: "no_source" | "redis_unavailable" | "redis_error" | "invalid_input", message?: string, sourceCleared?: boolean }>}
 */
export async function bindPreScanInfoToJob(lineUserId, jobId, deps = {}) {
  const uid = String(lineUserId || "").trim();
  const jid = String(jobId || "").trim();
  if (!uid || !jid) return { bound: false, status: "invalid_input" };
  const move = deps.move || moveKeyAtomic;
  let res;
  try {
    res = await move(key(uid), jobKey(jid), PRE_SCAN_INFO_TTL_SEC);
  } catch (e) {
    res = { status: "redis_error", value: null, message: String(e?.message || e).slice(0, 120) };
  }
  const status = res && typeof res === "object" ? res.status : null;
  if (status === "moved" && res.value) return { bound: true, status: "moved" };
  if (status === "no_source") return { bound: false, status: "no_source" };
  if (status === "redis_unavailable") return { bound: false, status: "redis_unavailable" };
  // redis_error (หรือผลไม่ typed): source อาจค้าง → ล้าง best-effort เพื่อไม่ให้ไป bind รูปถัดไปผิด
  const del = deps.del || delKeyTyped;
  let sourceCleared = false;
  try {
    const d = await del(key(uid));
    sourceCleared = Boolean(d && d.ok === true);
  } catch {
    sourceCleared = false;
  }
  return { bound: false, status: "redis_error", message: res?.message, sourceCleared };
}

/**
 * consume ครั้งเดียว (atomic GETDEL) ตาม jobId — gate เรียกตอนจะตัดสินว่าต้องถามหรือไม่
 * null = ไม่มีข้อมูล/อ่านไม่ได้ (gate ถามตามปกติ) — เหตุผลอยู่ใน deps.onMiss ถ้าต้องการ
 * @returns {Promise<{ raw: string, at: number } | null>}
 */
export async function consumeJobPreScanInfo(jobId, deps = {}) {
  const jid = String(jobId || "").trim();
  if (!jid) return null;
  const getdel = deps.getdel || getDelKey;
  let res;
  try {
    res = await getdel(jobKey(jid));
  } catch {
    return null;
  }
  const status = res && typeof res === "object" ? res.status : null;
  if (status !== "got" || !res.value) {
    if (status === "redis_error" && typeof deps.onMiss === "function") deps.onMiss(status, res.message);
    return null;
  }
  try {
    const j = JSON.parse(res.value);
    if (!j || !j.raw) return null;
    if (Date.now() - Number(j.at || 0) > PRE_SCAN_INFO_TTL_SEC * 1000) return null;
    return { raw: String(j.raw), at: Number(j.at) };
  } catch {
    return null;
  }
}

/** DB insert ล้ม → คืน evidence กลับให้ job (ยังไม่หาย) แล้ว gate ถามตามปกติ — typed */
export async function restoreJobPreScanInfo(jobId, info, deps = {}) {
  const jid = String(jobId || "").trim();
  if (!jid || !info?.raw) return { ok: false, reason: "invalid_input" };
  const set = deps.set || setValueWithTtlTyped;
  try {
    const r = await set(jobKey(jid), JSON.stringify({ raw: info.raw, at: info.at || Date.now() }), PRE_SCAN_INFO_TTL_SEC);
    return r && typeof r === "object" && r.ok === true ? { ok: true } : { ok: false, reason: r?.reason || "redis_error" };
  } catch (e) {
    return { ok: false, reason: "redis_error", message: String(e?.message || e).slice(0, 120) };
  }
}

/** copy แอดมินรับข้อมูล (โทนเดิม) — ใช้เฉพาะเมื่อเขียนสำเร็จจริง */
export const PRE_SCAN_INFO_ACK_TEXT = "รับข้อมูลชิ้นนี้ไว้แล้วครับ ส่งรูปมาได้เลย เดี๋ยวผมส่งให้อาจารย์ดู";
/** copy เมื่อบันทึกไม่ได้ (deterministic, โทนเดิม, ไม่สัญญา, ไม่ตีความพลัง) — gate จะถามตามปกติหลังอ่านเสร็จ */
export const PRE_SCAN_INFO_STORE_FAILED_TEXT = "รอบนี้ยังบันทึกข้อมูลชิ้นไม่ได้ครับ ส่งรูปมาได้เลย เดี๋ยวผมถามข้อมูลอีกทีหลังอาจารย์ดูเสร็จ";
