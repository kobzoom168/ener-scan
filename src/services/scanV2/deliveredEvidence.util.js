/**
 * Actual-delivery evidence (flow-role รอบสอง, Codex #5): ใช้เฉพาะรายงานที่ "ส่งถึงลูกค้าแล้วจริง"
 * (scan_jobs.status = delivered) — ห้ามอ่าน scan_results_v2 ล่าสุดตรง ๆ เพราะอาจเป็นรายงานที่
 * object-info gate ยัง hold อยู่ หรือ job failed
 */
import { supabase as defaultSupabase } from "../../config/supabase.js";

/**
 * @returns {Promise<{ resultId: string, score: number|null, compat: number|null, power: string|null, completedAt: string|null } | null>}
 */
export async function getLatestDeliveredReport(lineUserId, deps = {}) {
  const db = deps.supabase || defaultSupabase;
  const uid = String(lineUserId || "").trim();
  if (!uid) return null;
  try {
    const { data: job, error: e1 } = await db
      .from("scan_jobs")
      .select("result_id,completed_at,status")
      .eq("line_user_id", uid)
      .eq("status", "delivered")
      .not("result_id", "is", null)
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (e1 || !job?.result_id) return null;
    const { data: sr, error: e2 } = await db
      .from("scan_results_v2")
      .select("id,report_payload_json")
      .eq("id", job.result_id)
      .maybeSingle();
    if (e2 || !sr) return null;
    const rp = sr.report_payload_json && typeof sr.report_payload_json === "object" ? sr.report_payload_json : null;
    const s = rp?.summary && typeof rp.summary === "object" ? rp.summary : {};
    const num = (v) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
    return {
      resultId: String(sr.id),
      score: num(s.energyScore),
      compat: num(s.compatibilityPercent),
      power: String(s.mainEnergyLabel || s.visibleMainLabel || "").trim() || null,
      completedAt: job.completed_at || null,
    };
  } catch {
    return null;
  }
}

/** true = มีรายงานที่ส่งถึงมือลูกค้าแล้วจริงอย่างน้อย 1 */
export async function hasDeliveredReport(lineUserId, deps = {}) {
  return Boolean(await getLatestDeliveredReport(lineUserId, deps));
}

/** คำถามที่ตอบจาก "ผลชิ้นล่าสุด" ได้ตรง ๆ: คะแนน/พลัง/ความเข้ากัน ของชิ้นนี้/ล่าสุด */
const LATEST_REPORT_QUESTION_RE =
  /(?:องค์นี้|ชิ้นนี้|อันนี้|ล่าสุด|ที่เพิ่ง(?:สแกน|ส่ง)|ที่สแกน(?:ไป)?)[^\n]{0,20}(?:คะแนน|พลัง|เข้ากับ|เด่นด้าน|สายไหน|เป็นไง|เป็นยังไง|ดีไหม|ดีมั้ย)|(?:คะแนน|พลัง|เข้ากับ|เด่นด้าน)[^\n]{0,20}(?:องค์นี้|ชิ้นนี้|อันนี้|ล่าสุด)/u;

export function isLatestReportQuestion(text) {
  const t = String(text || "").trim();
  if (!t || t.length > 120) return false;
  return LATEST_REPORT_QUESTION_RE.test(t);
}

/**
 * ข้อความจาก evidence จริง — ไม่แสดง 0/0% เมื่อค่าเป็น null
 * @returns {string|null} null = ข้อมูลไม่พอ (caller ใช้ honest fallback)
 */
export function buildDeliveredReportText(ev) {
  if (!ev) return null;
  const parts = [];
  if (ev.power) parts.push(`พลังเด่นด้าน${ev.power}`);
  if (ev.score !== null && ev.score !== undefined) parts.push(`คะแนน ${ev.score}/10`);
  if (ev.compat !== null && ev.compat !== undefined) parts.push(`เข้ากับคุณ ${ev.compat}%`);
  if (!parts.length) return null;
  return `จากผลอ่านชิ้นล่าสุดของคุณ ${parts.join(" ")} รายละเอียดอยู่ในรายงานครับ`;
}
