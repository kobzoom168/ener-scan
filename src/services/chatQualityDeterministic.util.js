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
export function runDeterministicChecks(rows) {
  return [
    ...detectAjarnMoneyBreach(rows),
    ...detectRepeatedBotMessages(rows),
    ...detectDanglingHandoff(rows),
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
