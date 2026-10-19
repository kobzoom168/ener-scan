/**
 * Deterministic chat-quality checks (persona 2 ชั้น — 11 ส.ค. 2026, จากสังเคราะห์ Codex+Claude):
 * ปัญหาที่โค้ดจับได้แม่นกว่าและถูกกว่า LLM ให้จับก่อน แล้วค่อยส่งเรื่องที่ต้องเข้าใจภาษาให้ LLM
 * ทุกฟังก์ชัน pure — รับ rows [{ role, text, created_at, metadata_json? }] เรียงเวลา คืน findings
 * รูป finding: { time, quote, problem, severity } (โครงเดียวกับ issues ของ analyzer)
 */
import { AJARN_MONEY_RE } from "../stores/conversationMessages.db.js";

export const HANDOFF_RE = /(เรียนถามอาจารย์|ส่งให้อาจารย์|ถามอาจารย์ให้|ส่งต่อให้อาจารย์)/;
// speakerRole metadata เริ่มบันทึกบน pro 11 ส.ค. 2026 ~19:00 — cutoff ตั้งเที่ยงคืน 12 ส.ค.
// โดยตั้งใจ (intentional grace period ~5 ชม.: ช่วง deploy คาบเกี่ยว มีข้อความจาก instance
// เก่า/ใหม่ปนกัน อนุโลม no-tag ถึงเที่ยงคืนกัน false alarm — หลังจากนั้นเข้มเต็ม)
const META_ROLLOUT_MS = Date.parse("2026-08-12T00:00:00+07:00");
const COMPLAINT_RE =
  /(ห่วย|แย่มาก|โกง|หลอก|คืนเงิน|ยกเลิก|ไม่พอใจ|ช้ามาก|ทำไมยังไม่|รอนานมาก|ไม่ตอบ|เงียบ)/;
const PAYMENT_RE = /(สลิป|โอน|จ่าย|ค่าครู|แพ็ก|QR|คิวอาร์|เปิดสิทธิ์|บาท)/i;

function hm(iso) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return "??:??";
  }
}

function speakerOf(row) {
  return String(row?.metadata_json?.speakerRole || "").trim() || null;
}

/** เสียงอาจารย์ (tag ชัด) มีคำการเงิน = critical เสมอ */
export function detectAjarnMoneyBreach(rows) {
  const out = [];
  for (const r of rows || []) {
    if (r.role !== "bot" || speakerOf(r) !== "ajarn") continue;
    const t = String(r.text || "");
    if (AJARN_MONEY_RE.test(t)) {
      out.push({
        time: hm(r.created_at),
        quote: t.slice(0, 200),
        problem: "[AUTO] เสียงอาจารย์หลุดคำการเงิน (กติกา persona: เงินเป็นเรื่องแอดมินเท่านั้น)",
        severity: "high",
      });
    }
  }
  return out;
}

/** ข้อความ bot เดิมซ้ำ ≥ count ครั้งใน windowMin นาที (เคสจริง 10 ส.ค.: เกตถามซ้ำ 30 รอบ) */
/**
 * marker ภายในที่ลูกค้าไม่เห็นจริง (บันทึกใน history ให้ monitor เห็น timeline) —
 * สแกนหลายชิ้นติดกัน marker ซ้ำเป็นเรื่องปกติ (false alarm 13 ส.ค.)
 * เช็คจาก metadata replyType=scan_result + exact allowlist เท่านั้น
 * (Codex 14 ส.ค.: regex วงเล็บกว้างอาจซ่อนข้อความจริงที่บังเอิญอยู่ในวงเล็บเหลี่ยม)
 */
export const INTERNAL_MARKER_TEXTS = new Set([
  "[ส่งรายงานผลสแกนพร้อมการ์ด/เสียงถึงลูกค้าแล้ว]",
  "[เสียงเตือนเรื่องหลายรูป]",
  "[ส่งการ์ดผลสแกนของฉันแล้ว]",
]);

function isInternalMarkerRow(r) {
  if (String(r?.metadata_json?.replyType || "") === "scan_result") return true;
  return INTERNAL_MARKER_TEXTS.has(String(r?.text || "").trim());
}

export function detectRepeatedBotMessages(rows, { count = 3, windowMin = 10 } = {}) {
  const bot = (rows || []).filter(
    (r) => r.role === "bot" && String(r.text || "").trim() && !isInternalMarkerRow(r),
  );
  const out = [];
  const flagged = new Set();
  for (let i = 0; i < bot.length; i++) {
    const t = String(bot[i].text).trim();
    if (flagged.has(t)) continue;
    const t0 = new Date(bot[i].created_at).getTime();
    let n = 1;
    for (let j = i + 1; j < bot.length; j++) {
      if (String(bot[j].text).trim() !== t) continue;
      if (new Date(bot[j].created_at).getTime() - t0 > windowMin * 60_000) break;
      n += 1;
    }
    if (n >= count) {
      flagged.add(t);
      out.push({
        time: hm(bot[i].created_at),
        quote: t.slice(0, 200),
        problem: `[AUTO] ข้อความเดิมซ้ำ ${n} ครั้งใน ${windowMin} นาที (บอทวน)`,
        severity: "high",
      });
    }
  }
  return out;
}

/** แอดมินเกริ่นส่งต่ออาจารย์ แต่ไม่มีข้อความ bot ใดตามมาใน windowMin นาที = ลูกค้าค้าง */
export function detectDanglingHandoff(rows, { windowMin = 10 } = {}) {
  const out = [];
  const list = rows || [];
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (r.role !== "bot" || !HANDOFF_RE.test(String(r.text || ""))) continue;
    const t0 = new Date(r.created_at).getTime();
    // สำเร็จ = มีคำตอบจากอาจารย์จริงเท่านั้น: speakerRole=ajarn หรือส่งผลสแกน (Codex รอบ 2:
    // consult ยังแยกเสียงไม่ได้ ห้ามนับจนกว่า role router เสร็จ) · ข้อความไม่มี tag อนุโลม
    // เฉพาะก่อนวัน rollout metadata — หลังจากนั้น tag หลุด = ต้องโผล่ให้เห็น ไม่ซ่อน regression
    const followed = list
      .slice(i + 1)
      .some((x) => {
        if (x.role !== "bot") return false;
        const ts = new Date(x.created_at).getTime();
        if (ts - t0 > windowMin * 60_000) return false;
        const sp = String(x.metadata_json?.speakerRole || "");
        const rt = String(x.metadata_json?.replyType || "");
        if (!sp && !rt) return ts < META_ROLLOUT_MS; // legacy ก่อน rollout เท่านั้น
        return sp === "ajarn" || rt === "scan_result";
      });
    if (!followed) {
      out.push({
        time: hm(r.created_at),
        quote: String(r.text || "").slice(0, 200),
        problem: `[AUTO] เกริ่นว่าส่งให้อาจารย์แล้วแต่ไม่มีคำตอบตามมาใน ${windowMin} นาที`,
        severity: "high",
      });
    }
  }
  return out;
}

/** รวมทุกตัวตรวจ deterministic */
/* ---------------- 19 ต.ค. 2026 (Codex): เกณฑ์ตามนโยบาย ณ เวลาที่ตอบ + แยก "ถามผลเก่า" ออกจาก "ขอสแกนใหม่" + แหล่งข้อความ ---------------- */

/** ลูกค้าถามถึงของ/ผลที่สแกนไปแล้ว หรือขอเปรียบเทียบของเดิม (ไม่ใช่ขอสแกนใหม่) */
export const OLD_RESULT_QUESTION_RE =
  /(ที่ส่งไป|ที่เคยส่ง|ที่สแกนไป|สแกนไปแล้ว|ผลเก่า|ผลที่แล้ว|รูปก่อนหน้า|ชิ้นก่อนหน้า|ชิ้นที่แล้ว|เปรียบเทียบ|เทียบกัน|ชิ้นไหน.{0,16}(ดี|แรง|คุ้มครอง|เหมาะ|สุด)|อันไหน.{0,16}(ดี|แรง|คุ้มครอง|เหมาะ|สุด)|องค์ไหน.{0,16}(ดี|แรง|คุ้มครอง|เหมาะ|สุด))/;
/** คำตอบ paywall/ชวนเปิดสิทธิ์ (จาก replyType หรือข้อความ) */
export const PAYWALL_REPLY_TYPE_RE = /paywall|free_quota_exhausted|quota_exhausted|single_offer|offer_intro|existing_no_rights/i;
export const PAYWALL_TEXT_RE = /(สิทธิ์ฟรี.{0,12}(ครบ|หมด)|ใช้สิทธิ์.{0,12}ครบ|เปิดสิทธิ์เพิ่ม|เปิดเพิ่มได้\s*\d+\s*บาท|เติมสิทธิ์เพื่อสแกน|\d+\s*บาท.{0,20}(ครั้ง|สแกน))/;
/** คำสัญญาฟรีรายวัน (ใช้ได้เฉพาะเมื่อนโยบาย ณ เวลานั้นเป็น daily) — ไม่รวม "ทดลองฟรี 2 ครั้ง"/บัญชีใหม่ */
export const DAILY_FREE_PROMISE_RE = /(พรุ่งนี้.{0,24}ฟรี|ฟรี.{0,12}พรุ่งนี้|ฟรีวันนี้|ฟรีรายวัน|ฟรีวันละ|วันละ\s*\d+\s*(ครั้ง|ชิ้น)|หลังเที่ยงคืน|รีเซ็ต.{0,10}(ฟรี|สิทธิ์)|สิทธิ์ฟรี.{0,10}(วันนี้|ของวัน))/;

const AI_REPLY_TYPE_RE = /^(gemini_|consult|chat_|llm_|persona_|front_)/;
/** แหล่งข้อความบอท: template (deterministic/worker) · ai (LLM) · unknown (ไม่มี metadata) */
export function classifyBotSource(row) {
  if (row?.role !== "bot") return null;
  const m = row.metadata_json || {};
  const rt = String(m.replyType || "");
  if (AI_REPLY_TYPE_RE.test(rt) || String(m.speakerRole || "") === "consult") return "ai";
  if (rt || String(m.source || "") === "worker" || String(m.source || "") === "flow") return "template";
  return "unknown";
}

/** โหมดนโยบาย ณ เวลา iso จาก windows [{fromIso,toIso,mode}] (ไม่มี window ครอบ = null) */
export function policyModeAt(iso, windows = []) {
  const t = Date.parse(String(iso || "")); if (!Number.isFinite(t)) return null;
  for (const w of windows) { const a = Date.parse(w.fromIso), b = Date.parse(w.toIso); if (t >= a && t < b) return w.mode; }
  return null;
}

/**
 * ถามผลเก่า/เปรียบเทียบของเดิม → บอทตอบ paywall/หมดสิทธิ์/ชวนจ่าย ภายใน 3 นาที = ตอบไม่ตรงคำถาม
 * (โควต้าสแกนหมดไม่ใช่เหตุให้ปิดกั้นผลเก่าของเจ้าของ) — ไม่ขึ้นกับนโยบาย
 */
export function detectOldResultAnsweredWithPaywall(rows, { windowMin = 3 } = {}) {
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.role !== "user" || !OLD_RESULT_QUESTION_RE.test(String(r.text || ""))) continue;
    const t0 = Date.parse(r.created_at);
    for (let j = i + 1; j < rows.length; j++) {
      const b = rows[j];
      if (b.role === "user") break;
      if (Date.parse(b.created_at) - t0 > windowMin * 60_000) break;
      const rt = String(b.metadata_json?.replyType || ""); const txt = String(b.text || "");
      if (PAYWALL_REPLY_TYPE_RE.test(rt) || PAYWALL_TEXT_RE.test(txt)) {
        out.push({ kind: "old_result_paywall", time: hm(b.created_at), quote: txt.slice(0, 200), severity: "high", source: classifyBotSource(b),
          problem: "ลูกค้าถามถึงของ/ผลที่สแกนไปแล้ว แต่ตอบว่าหมดสิทธิ์/ชวนเปิดสิทธิ์ (ตอบไม่ตรงคำถาม — ผลเก่าของเจ้าของดูได้เสมอ ควรตอบจากรายงานเดิม ถ้าข้อมูลไม่พอให้บอกว่าขาดอะไร ไม่เดาคะแนน ไม่เร่งขาย)" });
        break;
      }
      break; // คำตอบแรกของบอทไม่ใช่ paywall = ไม่นับ
    }
  }
  return out;
}

/**
 * ข้อมูลสิทธิ์ผิดตามนโยบาย ณ เวลาที่ตอบ: บอทสัญญาฟรีรายวัน/พรุ่งนี้/รีเซ็ต ขณะที่โหมดเวลานั้นไม่ใช่ daily
 * (ก่อนเปลี่ยนโหมด = ปกติ ไม่จับ · หลังเปลี่ยน = จับ severity high · "ทดลองฟรี 2 ครั้ง" ไม่ถูกจับ)
 */
const NEGATION_BEFORE_RE = /(ไม่มี|ไม่ได้|ไม่ใช่|เลิก|ยกเลิก|งด|ปิด|หมดแล้ว|ไม่.{0,6}แล้ว)\s*$/;
/** มีคำสัญญาฟรีรายวันจริง (ไม่นับประโยคปฏิเสธ เช่น "ไม่มีฟรีรายวันแล้ว", "ยกเลิกฟรีวันนี้") */
export function hasDailyFreePromise(text) {
  const txt = String(text || "");
  const re = new RegExp(DAILY_FREE_PROMISE_RE.source, "g");
  let m;
  while ((m = re.exec(txt))) {
    const before = txt.slice(Math.max(0, m.index - 14), m.index);
    if (!NEGATION_BEFORE_RE.test(before)) return true;
    if (!m[0].length) re.lastIndex++;
  }
  return false;
}

export function detectDailyPromiseAgainstPolicy(rows, windows = []) {
  const out = [];
  for (const r of rows) {
    if (r.role !== "bot") continue;
    const txt = String(r.text || "");
    if (!hasDailyFreePromise(txt)) continue;
    const mode = policyModeAt(r.created_at, windows);
    if (!mode || mode === "daily") continue;
    out.push({ kind: "daily_promise_policy_mismatch", time: hm(r.created_at), quote: txt.slice(0, 200), severity: "high", source: classifyBotSource(r),
      problem: `ข้อมูลสิทธิ์ผิด: สัญญาฟรีรายวัน/พรุ่งนี้/รีเซ็ต ทั้งที่นโยบาย ณ เวลานั้นเป็น ${mode === "new_customer" ? "ฟรีเฉพาะบัญชีใหม่ที่เข้าเกณฑ์ทดลองรวม 2 ครั้ง (ไม่มีฟรีรายวัน)" : "ปิดสิทธิ์ฟรี"}` });
  }
  return out;
}

/** @param {Array} rows @param {{ policyWindows?: Array<{fromIso:string,toIso:string,mode:string}> }} [ctx] */
export function runDeterministicChecks(rows, ctx = {}) {
  return [
    ...detectAjarnMoneyBreach(rows),
    ...detectRepeatedBotMessages(rows),
    ...detectDanglingHandoff(rows),
    ...detectOldResultAnsweredWithPaywall(rows),
    ...detectDailyPromiseAgainstPolicy(rows, ctx.policyWindows || []),
  ];
}

/**
 * จัดลำดับลูกค้าที่ควรตรวจก่อน (แทน 60 คนแรกตามเวลา):
 * ด่า/ไม่พอใจ > เรื่องเงิน/สลิป > คุยเยอะ — คืน userIds เรียงคะแนนมาก→น้อย
 * @param {Map<string, Array<{role:string,text:string}>>} byUser
 */
export function prioritizeUsers(byUser) {
  const scored = [];
  for (const [uid, rows] of byUser.entries()) {
    const userTexts = rows.filter((r) => r.role === "user").map((r) => String(r.text || ""));
    if (!userTexts.length) continue;
    let score = 0;
    if (userTexts.some((t) => COMPLAINT_RE.test(t))) score += 100;
    if (rows.some((r) => PAYMENT_RE.test(String(r.text || "")))) score += 50;
    score += Math.min(rows.length, 20);
    scored.push({ uid, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.uid);
}
